import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import tenantConnector from '../../../utils/TenantConnector.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import { finalizePaidCommerceSession } from './finalizePaidCommerceSession.js';
import { buildProcessVerifiedPaidCommerceSessionUseCase } from './processVerifiedPaidCommerceSession.js';
import { tenantRevenueSharingEnabled } from '../../../config/tenantRevenueFeature.js';
import { recordSucceededTenantRevenueRefundUseCase } from '../../tenantRevenue/index.js';
import {
  buildRefundLedgerIdempotencyKey,
  mapRefundStatusToLedgerStatus,
  writeTenantOrderPaymentEntry
} from '../repositories/tenantOrderPaymentLedgerRepository.js';
import { alertCommerceRefundFailed } from './commerceRefundAlerting.js';

const randomReference = (prefix) => `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
const toInt = (value, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const TENANT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeTenantId = (value) => {
  if (value == null) return null;
  const raw = String(value).trim();
  return TENANT_UUID_PATTERN.test(raw) ? raw.toLowerCase() : null;
};
const toCentavos = (value) => Math.round((Number(value) || 0) * 100);
const normalizeReference = (value) => String(value || '').trim().toUpperCase();
const TERMINAL_REFUND_SUCCESS_STATUSES = new Set(['succeeded', 'success', 'refunded']);
const TERMINAL_REFUND_FAILURE_STATUSES = new Set(['failed', 'cancelled', 'canceled']);
const ACTIVE_REFUND_STATUSES = ['pending', 'succeeded'];
const RETRY_ACTIVE_REFUND_STATUSES = ['created', 'pending', 'succeeded'];
const SUCCEEDED_REFUND_STATUSES = ['succeeded'];
const SETTLEMENT_REPORT_STATUSES = ['finalized', 'paid', 'refund_pending', 'partial_refunded', 'refunded', 'split_failed_manual_settlement_required'];
const PAID_PROVIDER_STATUSES = new Set(['paid', 'succeeded', 'success', 'completed']);

const isAmbiguousProviderRefundError = (error = {}) => {
  const status = Number(error?.response?.status || 0);
  return !error?.response || status === 408 || status === 429 || status >= 500;
};

const serializeAccount = (account = {}) => ({
  account_id: account.account_id,
  tenant_id: account.tenant_id,
  provider: account.provider,
  provider_merchant_id: account.provider_merchant_id,
  provider_wallet_id: account.provider_wallet_id,
  wallet_status: account.wallet_status || 'unknown',
  wallet_verified_at: account.wallet_verified_at || null,
  onboarding_status: account.onboarding_status,
  qrph_enabled: Boolean(account.qrph_enabled),
  split_enabled: Boolean(account.split_enabled),
  charges_enabled: Boolean(account.charges_enabled),
  requirements_due: account.requirements_due || null,
  metadata: account.metadata || null,
  last_synced_at: account.last_synced_at || null,
  updated_at: account.updated_at || null
});

const serializeSession = (session = {}, refunds = []) => ({
  payment_session_id: session.public_reference,
  public_reference: session.public_reference,
  tenant_id: session.tenant_id,
  store_slug: session.store_slug,
  provider: session.provider,
  target_type: session.target_type,
  status: session.status,
  idempotency_key: session.idempotency_key,
  total_amount: session.total_amount,
  total_amount_centavos: session.total_amount_centavos,
  currency: session.currency,
  qr_code_image_url: session.qr_code_image_url,
  expires_at: session.expires_at,
  service_fee_amount: session.service_fee_amount,
  platform_fee_centavos: session.platform_fee_centavos,
  tenant_transfer_merchant_id: session.tenant_transfer_merchant_id,
  provider_payment_intent_id: session.provider_payment_intent_id,
  provider_payment_id: session.provider_payment_id,
  paid_at: session.paid_at,
  finalized_at: session.finalized_at,
  pos_transaction_id: session.pos_transaction_id,
  tracking_pin: session.tracking_pin,
  failure_code: session.failure_code,
  failure_reason: session.failure_reason,
  refundable_amount_centavos: Math.max(0, Number(session.total_amount_centavos || 0) - refunds
    .filter((refund) => ACTIVE_REFUND_STATUSES.includes(refund.status))
    .reduce((sum, refund) => sum + Number(refund.amount_centavos || 0), 0)),
  refunds: refunds.map(serializeRefund)
});

const serializeRefund = (refund = {}, retryOfReference = null) => ({
  refund_id: refund.public_reference,
  public_reference: refund.public_reference,
  retry_of: typeof (retryOfReference || refund.retryOf?.public_reference || refund.retry_of) === 'string'
    ? (retryOfReference || refund.retryOf?.public_reference || refund.retry_of)
    : null,
  payment_session_id: refund.payment_session_id,
  provider_refund_id: refund.provider_refund_id,
  provider_payment_id: refund.provider_payment_id,
  amount_centavos: refund.amount_centavos,
  currency: refund.currency,
  reason: refund.reason,
  notes: refund.notes,
  refund_strategy: refund.refund_strategy,
  split_refund_payload: refund.split_refund_payload || null,
  status: refund.status,
  failure_code: refund.failure_code,
  failure_reason: refund.failure_reason,
  requested_by: refund.requested_by,
  created_at: refund.created_at,
  updated_at: refund.updated_at
});

const normalizeReadinessMetadata = (payload = {}, actor = null) => {
  const rawMetadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  const verificationReference = String(
    payload.verification_reference
    || rawMetadata.verification_reference
    || ''
  ).trim();
  const verifiedAt = String(
    payload.verified_at
    || rawMetadata.verified_at
    || ''
  ).trim();
  const verifiedBy = String(
    payload.verified_by
    || rawMetadata.verified_by
    || actor
    || ''
  ).trim();
  return {
    ...rawMetadata,
    verification_reference: verificationReference || null,
    verified_at: verifiedAt || null,
    verified_by: verifiedBy || null
  };
};

const assertReadinessEvidence = (payload = {}, metadata = {}) => {
  const enablingCommerce = payload.onboarding_status === 'active'
    || Boolean(payload.qrph_enabled)
    || Boolean(payload.split_enabled)
    || Boolean(payload.charges_enabled);
  if (!enablingCommerce) return;
  if (!metadata.verification_reference || !metadata.verified_at) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      'PayMongo readiness evidence is required before enabling tenant commerce payments',
      {
        statusCode: 422,
        details: {
          required_metadata: ['verification_reference', 'verified_at']
        }
      }
    );
  }
  const enablingSplitOrCharges = Boolean(payload.split_enabled) || Boolean(payload.charges_enabled);
  if (enablingSplitOrCharges && payload.wallet_status !== 'enabled') {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      'PayMongo enabled wallet evidence is required before enabling split or charge settlement',
      {
        statusCode: 422,
        details: {
          required_fields: ['wallet_status=enabled', 'wallet_verified_at']
        }
      }
    );
  }
  if (enablingSplitOrCharges && !payload.wallet_verified_at) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      'PayMongo wallet verification timestamp is required before enabling split or charge settlement',
      {
        statusCode: 422,
        details: {
          required_fields: ['wallet_verified_at']
        }
      }
    );
  }
};

const serializeSettlementRow = (session = {}, refunds = []) => {
  const succeededRefundCentavos = refunds
    .filter((refund) => refund.status === 'succeeded')
    .reduce((sum, refund) => sum + Number(refund.amount_centavos || 0), 0);
  const pendingRefundCentavos = refunds
    .filter((refund) => refund.status === 'pending')
    .reduce((sum, refund) => sum + Number(refund.amount_centavos || 0), 0);
  const totalCentavos = Number(session.total_amount_centavos || 0);
  const platformFeeCentavos = Number(session.platform_fee_centavos || 0);
  return {
    payment_session_id: session.public_reference,
    tenant_id: session.tenant_id,
    store_slug: session.store_slug,
    target_type: session.target_type,
    status: session.status,
    total_amount_centavos: totalCentavos,
    platform_fee_centavos: platformFeeCentavos,
    fee_policy: session.fee_policy || null,
    estimated_tenant_gross_centavos: Math.max(0, totalCentavos - platformFeeCentavos),
    succeeded_refund_centavos: succeededRefundCentavos,
    pending_refund_centavos: pendingRefundCentavos,
    net_after_succeeded_refunds_centavos: Math.max(0, totalCentavos - succeededRefundCentavos),
    reconciliation_variance_centavos: Math.max(0, succeededRefundCentavos + pendingRefundCentavos - totalCentavos),
    tenant_transfer_merchant_id: session.tenant_transfer_merchant_id,
    provider_payment_intent_id: session.provider_payment_intent_id,
    provider_payment_id: session.provider_payment_id,
    pos_transaction_id: session.pos_transaction_id,
    tracking_pin: session.tracking_pin,
    paid_at: session.paid_at,
    finalized_at: session.finalized_at,
    refunds: refunds.map(serializeRefund)
  };
};

const buildSplitRefund = ({ strategy, amountCentavos, session, customSources = [] }) => {
  if (strategy === 'proportional') return null;
  if (strategy === 'tenant') {
    return {
      refund_sources: [{
        merchant_id: session.tenant_transfer_merchant_id,
        split_type: 'fixed',
        value: amountCentavos
      }]
    };
  }
  if (strategy === 'dgfy') {
    if (!process.env.PAYMONGO_DGFY_MERCHANT_ID) return null;
    return {
      refund_sources: [{
        merchant_id: process.env.PAYMONGO_DGFY_MERCHANT_ID,
        split_type: 'fixed',
        value: amountCentavos
      }]
    };
  }
  return {
    refund_sources: customSources.map((source) => ({
      merchant_id: String(source.merchant_id || '').trim(),
      split_type: source.split_type || 'fixed',
      value: toInt(source.value, 0)
    })).filter((source) => source.merchant_id && source.value > 0)
  };
};

const updateTenantPaymentStatus = async ({ commercePaymentRepository, session, paymentStatus }) => {
  if (!session.pos_transaction_id) return;
  const tenant = await commercePaymentRepository.findTenantById(session.tenant_id);
  if (!tenant) return;
  const sequelizeInstance = await tenantConnector.getConnection(tenant);
  const tenantModels = getTenantModels(sequelizeInstance);
  const PosTransaction = tenantModels.PosTransaction;
  if (!PosTransaction) return;
  await PosTransaction.update(
    { payment_status: paymentStatus },
    { where: { pos_transaction_id: session.pos_transaction_id } }
  );
};

// Phase 144 (#824): mirror every refund attempt into the tenant's own per-order ledger
// (`pos_order_payments`, kind 'refund'), so a downpayment order's reversal is visible in the same
// place its capture was recorded rather than only landlord-side. Gated internally to downpayment
// sessions and best-effort by contract -- see repositories/tenantOrderPaymentLedgerRepository.js.
//
// Deliberately NOT accompanied by any edit to the order's amount_paid/balance_due: ADR 0052
// clause 4 requires corrections to be expressed as reversal entries, never as edits to the
// original figures. `updateTenantPaymentStatus` (below) already moves payment_status to
// refund_pending/partial_refunded/refunded, which is the only order-row change a refund makes.
const recordTenantRefundLedgerEntry = async ({
  writeOrderPaymentLedgerEntry = writeTenantOrderPaymentEntry,
  commercePaymentRepository,
  session,
  refund,
  status
}) => (
  writeOrderPaymentLedgerEntry({
    commercePaymentRepository,
    session,
    kind: 'refund',
    status: mapRefundStatusToLedgerStatus(status),
    amountCentavos: Number(refund?.amount_centavos || 0),
    paymentMethod: session?.capture_payment_method || null,
    paymentReference: refund?.provider_payment_id || session?.provider_payment_id || null,
    idempotencyKey: buildRefundLedgerIdempotencyKey(refund?.public_reference)
  })
);

const getBasePaidSessionStatus = (session = {}) => {
  if (session.status === 'split_failed_manual_settlement_required') return session.status;
  if (session.status === 'paid_manual_resolution_required') return session.status;
  if (session.finalized_at || session.pos_transaction_id) return 'finalized';
  if (session.paid_at || session.provider_payment_id) return 'paid';
  return session.status;
};

export const reconcileRefundedPaymentState = async ({ commercePaymentRepository, session, transaction = null }) => {
  const [succeededCentavos, pendingCentavos] = await Promise.all([
    commercePaymentRepository.sumRefundCentavosByStatuses(session.session_id, SUCCEEDED_REFUND_STATUSES, { transaction }),
    commercePaymentRepository.sumRefundCentavosByStatuses(session.session_id, ['pending'], { transaction })
  ]);
  const totalCentavos = Number(session.total_amount_centavos || 0);
  let paymentStatus = 'paid';
  let sessionStatus = getBasePaidSessionStatus(session);

  if (succeededCentavos >= totalCentavos && totalCentavos > 0) {
    paymentStatus = 'refunded';
    sessionStatus = 'refunded';
  } else if (succeededCentavos > 0) {
    paymentStatus = 'partial_refunded';
    sessionStatus = 'partial_refunded';
  } else if (pendingCentavos > 0) {
    paymentStatus = 'refund_pending';
    sessionStatus = 'refund_pending';
  }

  const updatedSession = await commercePaymentRepository.updateSessionById(
    session.session_id,
    { status: sessionStatus },
    { transaction }
  );
  await updateTenantPaymentStatus({
    commercePaymentRepository,
    session: updatedSession || session,
    paymentStatus
  });
  return updatedSession || session;
};

const writePaymentAudit = async ({
  commercePaymentRepository,
  entityId,
  action,
  changes,
  actor,
  eventType,
  actorUsername,
  reason,
  requestId
}) => {
  const payload = {
    user_id: null,
    entity_type: 'CommercePayment',
    entity_id: entityId ?? null,
    action,
    changes: {
      ...changes,
      actor: actor || null
    },
    user_agent: 'PayMongo Commerce Admin'
  };
  if (eventType !== undefined) payload.event_type = eventType;
  if (actorUsername !== undefined) payload.actor_username = actorUsername;
  if (reason !== undefined) payload.reason = reason;
  if (requestId !== undefined) payload.request_id = requestId;
  await commercePaymentRepository.createAuditLog?.({
    ...payload
  });
};

const getProviderPaymentRecords = (paymentIntent = {}) => {
  const attributes = paymentIntent?.attributes || {};
  const paymentCollection = Array.isArray(attributes.payments)
    ? attributes.payments
    : (Array.isArray(attributes.payments?.data) ? attributes.payments.data : []);
  const candidates = [
    ...paymentCollection,
    attributes.latest_payment,
    attributes.payment
  ].filter(Boolean);
  return candidates.map((candidate) => ({
    resource: candidate?.data || candidate,
    attributes: candidate?.data?.attributes || candidate?.attributes || {}
  }));
};

const buildProviderPaidResource = ({ session, paymentIntent }) => {
  const intentAttributes = paymentIntent?.attributes || {};
  const paymentRecords = getProviderPaymentRecords(paymentIntent);
  const paidRecord = paymentRecords.find(({ attributes }) => PAID_PROVIDER_STATUSES.has(String(attributes.status || '').trim().toLowerCase()));
  const paymentRecord = paidRecord || null;
  const paymentAttributes = paymentRecord?.attributes || {};
  const observedPaymentAttributes = paymentRecords[0]?.attributes || {};
  const providerStatus = String(
    paymentRecords.length > 0
      ? paymentAttributes.status || observedPaymentAttributes.status || ''
      : intentAttributes.status || ''
  ).trim().toLowerCase();
  const paymentId = String(
    paymentRecord?.resource?.id
    || paymentAttributes.id
    || ''
  ).trim();
  const isPaid = paymentRecords.length > 0
    ? Boolean(paidRecord)
    : PAID_PROVIDER_STATUSES.has(String(intentAttributes.status || '').trim().toLowerCase());

  if (!isPaid) {
    return {
      isPaid: false,
      providerStatus,
      paymentId: null,
      resource: null
    };
  }

  if (!paymentId.startsWith('pay_')) {
    return {
      isPaid: true,
      providerStatus,
      paymentId: null,
      resource: null
    };
  }

  return {
    isPaid: true,
    providerStatus,
    paymentId,
    resource: {
      id: paymentId,
      type: 'payment',
      attributes: {
        ...paymentAttributes,
        status: 'paid',
        amount: paymentAttributes.amount ?? intentAttributes.amount,
        currency: paymentAttributes.currency || intentAttributes.currency || session.currency || 'PHP',
        payment_intent_id: paymentAttributes.payment_intent_id || paymentIntent.id || session.provider_payment_intent_id,
        metadata: paymentAttributes.metadata || intentAttributes.metadata || {}
      }
    }
  };
};

export const buildListCommercePaymentSessionsUseCase = ({ commercePaymentRepository }) => async ({ query = {} } = {}) => {
  try {
    const tenantId = normalizeTenantId(query.tenant_id);
    const status = String(query.status || '').trim();
    const refundStatus = String(query.refund_status || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const sessionIds = refundStatus.length > 0
      ? await commercePaymentRepository.listSessionIdsByRefundStatuses(refundStatus)
      : null;
    const filters = {
      tenantId,
      status: status ? status.split(',').map((entry) => entry.trim()).filter(Boolean) : null,
      targetType: query.target_type || null,
      provider: 'paymongo',
      ...(sessionIds ? { sessionIds } : {})
    };
    const sessions = await commercePaymentRepository.listSessions(filters, {
      limit: Math.min(toInt(query.limit, 100) || 100, 250),
      offset: Math.max(toInt(query.offset, 0) || 0, 0)
    });
    const withRefunds = await Promise.all(sessions.map(async (session) => {
      const refunds = await commercePaymentRepository.listRefundsBySession(session.session_id);
      return serializeSession(session, refunds);
    }));
    const total = await commercePaymentRepository.countSessions(filters);
    return ok({
      payment_sessions: withRefunds,
      pagination: {
        limit: Math.min(toInt(query.limit, 100) || 100, 250),
        offset: Math.max(toInt(query.offset, 0) || 0, 0),
        count: withRefunds.length,
        total
      }
    });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildListCommercePaymentRefundsUseCase = ({ commercePaymentRepository }) => async ({ query = {} } = {}) => {
  try {
    const tenantId = normalizeTenantId(query.tenant_id);
    if (query.tenant_id && !tenantId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'tenant_id must be a valid UUID.', { statusCode: 422 });
    }
    const status = Array.isArray(query.status)
      ? query.status.map((entry) => String(entry).trim()).filter(Boolean)
      : String(query.status || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const limit = Math.min(toInt(query.limit, 100) || 100, 250);
    const offset = Math.max(toInt(query.offset, 0) || 0, 0);
    const result = await commercePaymentRepository.listRefundsForAdmin({
      status,
      tenant_id: tenantId,
      limit,
      offset
    });
    const rows = (result.refunds || []).map((refund) => {
      const isRetryEligibleStatus = refund.status === 'failed'
        || (refund.status === 'manual_review_required' && refund.failure_code === 'PROVIDER_REFUND_NOT_FOUND');
      return {
        ...serializeRefund(refund, refund.retry_of),
        has_retry: Boolean(refund.has_retry),
        retry_child_references: Array.isArray(refund.retry_child_references) ? refund.retry_child_references : [],
        retry_eligible: Boolean(isRetryEligibleStatus && !refund.has_retry && !refund._has_active_refund),
        payment_session: refund.payment_session || null
      };
    });
    return ok({
      refunds: rows,
      pagination: {
        limit,
        offset,
        count: rows.length,
        total: Number(result.total || 0)
      }
    });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildGetCommerceSettlementReportUseCase = ({ commercePaymentRepository }) => async ({ query = {} } = {}) => {
  try {
    const tenantId = normalizeTenantId(query.tenant_id);
    const status = String(query.status || '').trim();
    const refundStatus = String(query.refund_status || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const sessionIds = refundStatus.length > 0
      ? await commercePaymentRepository.listSessionIdsByRefundStatuses(refundStatus)
      : null;
    const sessions = await commercePaymentRepository.listSessions({
      tenantId,
      status: status ? status.split(',').map((entry) => entry.trim()).filter(Boolean) : SETTLEMENT_REPORT_STATUSES,
      targetType: query.target_type || null,
      provider: 'paymongo',
      ...(sessionIds ? { sessionIds } : {})
    }, {
      limit: Math.min(toInt(query.limit, 250) || 250, 1000),
      offset: Math.max(toInt(query.offset, 0) || 0, 0)
    });
    const rows = await Promise.all(sessions.map(async (session) => {
      const refunds = await commercePaymentRepository.listRefundsBySession(session.session_id);
      return serializeSettlementRow(session, refunds);
    }));
    const summary = rows.reduce((acc, row) => {
      acc.session_count += 1;
      acc.total_amount_centavos += row.total_amount_centavos;
      acc.platform_fee_centavos += row.platform_fee_centavos;
      acc.estimated_tenant_gross_centavos += row.estimated_tenant_gross_centavos;
      acc.succeeded_refund_centavos += row.succeeded_refund_centavos;
      acc.pending_refund_centavos += row.pending_refund_centavos;
      acc.reconciliation_variance_centavos += row.reconciliation_variance_centavos;
      acc.by_status[row.status] = (acc.by_status[row.status] || 0) + 1;
      return acc;
    }, {
      session_count: 0,
      total_amount_centavos: 0,
      platform_fee_centavos: 0,
      estimated_tenant_gross_centavos: 0,
      succeeded_refund_centavos: 0,
      pending_refund_centavos: 0,
      reconciliation_variance_centavos: 0,
      by_status: {}
    });

    return ok({ settlement_report: { summary, rows } });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildGetCommercePaymentSessionUseCase = ({ commercePaymentRepository }) => async ({ paymentSessionId }) => {
  try {
    const reference = normalizeReference(paymentSessionId);
    const session = await commercePaymentRepository.findSessionByPublicReference(reference);
    if (!session) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payment session not found', { statusCode: 404 });
    const refunds = await commercePaymentRepository.listRefundsBySession(session.session_id);
    return ok({ payment_session: serializeSession(session, refunds) });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildUpsertTenantPaymentAccountUseCase = ({ commercePaymentRepository }) => async ({ tenantId, payload = {}, actor = null }) => {
  try {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'tenant_id is required', { statusCode: 422 });
    const tenant = await commercePaymentRepository.findTenantById(normalizedTenantId);
    if (!tenant) throw new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found', { statusCode: 404 });
    const providerMerchantId = String(payload.provider_merchant_id || '').trim();
    if (!providerMerchantId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'provider_merchant_id is required', { statusCode: 422 });
    }
    const readinessMetadata = normalizeReadinessMetadata(payload, actor);
    assertReadinessEvidence(payload, readinessMetadata);
    const account = await commercePaymentRepository.upsertTenantPaymentAccount({
      tenant_id: normalizedTenantId,
      provider: 'paymongo',
      provider_merchant_id: providerMerchantId,
      provider_wallet_id: payload.provider_wallet_id || null,
      wallet_status: payload.wallet_status || 'unknown',
      wallet_verified_at: payload.wallet_verified_at || null,
      onboarding_status: payload.onboarding_status || 'pending',
      qrph_enabled: Boolean(payload.qrph_enabled),
      split_enabled: Boolean(payload.split_enabled),
      charges_enabled: Boolean(payload.charges_enabled),
      requirements_due: payload.requirements_due || null,
      metadata: readinessMetadata,
      last_synced_at: new Date()
    });
    await writePaymentAudit({
      commercePaymentRepository,
      entityId: account.account_id,
      action: 'UPDATE',
      changes: {
        event: 'tenant_payment_account_readiness_upserted',
        tenant_id: normalizedTenantId,
        provider: 'paymongo',
        wallet_status: account.wallet_status || 'unknown',
        onboarding_status: account.onboarding_status,
        qrph_enabled: Boolean(account.qrph_enabled),
        split_enabled: Boolean(account.split_enabled),
        charges_enabled: Boolean(account.charges_enabled)
      }
    });
    return ok({ payment_account: serializeAccount(account) });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildListTenantPaymentAccountsUseCase = ({ commercePaymentRepository }) => async ({ query = {} } = {}) => {
  try {
    const tenantId = normalizeTenantId(query.tenant_id);
    const accounts = await commercePaymentRepository.listTenantPaymentAccounts({ tenantId });
    return ok({ payment_accounts: accounts.map(serializeAccount) });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

const extractPayMongoAccountId = (resource = {}) => {
  const attrs = resource?.attributes || {};
  return resource?.id
    || attrs.account_id
    || attrs.merchant_id
    || attrs.id
    || null;
};

const extractOnboardingUrl = (resource = {}) => {
  const attrs = resource?.attributes || {};
  return attrs.onboarding_url
    || attrs.onboarding_link
    || attrs.hosted_onboarding_url
    || attrs.verification_url
    || null;
};

const extractRequirementsDue = (resource = {}) => {
  const attrs = resource?.attributes || resource || {};
  return attrs.requirements_due
    || attrs.requirements
    || attrs.currently_due
    || attrs.eventually_due
    || null;
};

const hasExplicitEnabledWalletEvidence = (resource = {}) => {
  const attrs = resource?.attributes || resource || {};
  const wallet = attrs.wallet || {};
  const status = String(attrs.wallet_status || wallet.status || '').toLowerCase();
  return ['enabled', 'activated', 'active'].includes(status);
};

const hasExplicitSplitEvidence = (resource = {}) => {
  const attrs = resource?.attributes || resource || {};
  const capabilities = attrs.capabilities || {};
  const features = Array.isArray(attrs.features) ? attrs.features.map((feature) => String(feature).toLowerCase()) : [];
  return attrs.split_enabled === true
    || attrs.split_payments_enabled === true
    || capabilities.split_payments === 'active'
    || features.includes('split_payments')
    || features.includes('split_payment');
};

const hasExplicitChargeEvidence = (resource = {}) => {
  const attrs = resource?.attributes || resource || {};
  const capabilities = attrs.capabilities || {};
  return attrs.charges_enabled === true
    || attrs.payments_enabled === true
    || capabilities.payments === 'active'
    || capabilities.charges === 'active';
};

const findExistingChildAccountForTenant = async ({ paymongoService, tenantId, tradeName }) => {
  if (typeof paymongoService?.listChildAccounts !== 'function') return null;
  try {
    const accounts = await paymongoService.listChildAccounts({ search_term: tradeName });
    return (accounts || []).find((account) => {
      const attrs = account?.attributes || {};
      return attrs.metadata?.tenant_id === tenantId
        || String(attrs.trade_name || '').trim().toLowerCase() === String(tradeName || '').trim().toLowerCase();
    }) || null;
  } catch {
    return null;
  }
};

export const buildCreateTenantPayMongoChildAccountUseCase = ({
  commercePaymentRepository,
  paymongoService
}) => async ({ tenantId, payload = {}, actor = null } = {}) => {
  try {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'tenant_id is required', { statusCode: 422 });
    const tenant = await commercePaymentRepository.findTenantById(normalizedTenantId);
    if (!tenant) throw new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found', { statusCode: 404 });

    const existing = await commercePaymentRepository.findTenantPaymentAccount({ tenantId: normalizedTenantId, provider: 'paymongo' });
    if (existing?.provider_merchant_id) {
      return ok({
        payment_account: serializeAccount(existing),
        idempotent_replay: true
      });
    }

    const tradeName = String(payload.trade_name || tenant.name || '').trim();
    if (!tradeName) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'trade_name is required to create a PayMongo child merchant', { statusCode: 422 });
    }

    const existingProviderAccount = await findExistingChildAccountForTenant({
      paymongoService,
      tenantId: normalizedTenantId,
      tradeName
    });
    const childMerchant = existingProviderAccount || await paymongoService.createChildMerchant({
      tradeName,
      type: 'merchant',
      features: ['payment_gateway', 'basic_wallet'],
      metadata: {
        tenant_id: normalizedTenantId,
        created_from: 'dgfy_admin_payments',
        actor: actor || null
      }
    });
    const providerMerchantId = extractPayMongoAccountId(childMerchant);
    if (!providerMerchantId) {
      throw new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        'PayMongo child merchant response did not include a merchant account ID',
        {
          statusCode: 502,
          details: { provider_response_id_missing: true }
        }
      );
    }

    const providerPayload = childMerchant?.attributes || {};
    const account = await commercePaymentRepository.upsertTenantPaymentAccount({
      tenant_id: normalizedTenantId,
      provider: 'paymongo',
      provider_merchant_id: providerMerchantId,
      provider_wallet_id: providerPayload.wallet_id || providerPayload.wallet?.id || null,
      wallet_status: providerPayload.wallet_status || 'unknown',
      wallet_verified_at: null,
      onboarding_status: 'pending',
      qrph_enabled: false,
      split_enabled: false,
      charges_enabled: false,
      requirements_due: extractRequirementsDue(childMerchant),
      metadata: {
        verification_reference: null,
        verified_at: null,
        verified_by: null,
        trade_name: tradeName,
        onboarding_url: extractOnboardingUrl(childMerchant),
        child_account_created_at: new Date().toISOString(),
        child_account_created_by: actor || null,
        child_account_creation_source: existingProviderAccount ? 'provider_lookup' : 'api',
        provider_status: providerPayload.status || null,
        provider_features: providerPayload.features || null,
        provider_account_matched_before_create: Boolean(existingProviderAccount),
        fee_contract: {
          dgfy_fee_basis: 'subtotal',
          dgfy_fee_charged_to: 'tenant',
          provider_fee_shoulder: 'tenant_company'
        }
      },
      last_synced_at: new Date()
    });

    await writePaymentAudit({
      commercePaymentRepository,
      entityId: account.account_id,
      action: 'CREATE',
      actor,
      changes: {
        event: 'tenant_paymongo_child_account_created',
        tenant_id: normalizedTenantId,
        provider_merchant_id: providerMerchantId,
        trade_name: tradeName,
        provider_account_matched_before_create: Boolean(existingProviderAccount),
        onboarding_status: account.onboarding_status
      }
    });

    return ok({
      payment_account: serializeAccount(account),
      paymongo_child_account: {
        id: providerMerchantId,
        onboarding_url: extractOnboardingUrl(childMerchant),
        raw_status: providerPayload.status || null
      },
      provider_account_matched_before_create: Boolean(existingProviderAccount),
      idempotent_replay: false
    });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildOperateTenantPayMongoChildAccountUseCase = ({
  commercePaymentRepository,
  paymongoService
}) => async ({ tenantId, action, actor = null } = {}) => {
  try {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'tenant_id is required', { statusCode: 422 });
    const normalizedAction = String(action || '').trim();
    if (!['sync-requirements', 'submit-review', 'activate'].includes(normalizedAction)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Unsupported PayMongo child account action', { statusCode: 422 });
    }

    const account = await commercePaymentRepository.findTenantPaymentAccount({ tenantId: normalizedTenantId, provider: 'paymongo' });
    if (!account?.provider_merchant_id) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Tenant PayMongo child account is not created yet', { statusCode: 404 });
    }

    let providerResource = null;
    if (normalizedAction === 'sync-requirements') {
      providerResource = await paymongoService.retrieveChildMerchantRequirements(account.provider_merchant_id);
    } else if (normalizedAction === 'submit-review') {
      providerResource = await paymongoService.submitChildMerchantForReview(account.provider_merchant_id);
    } else if (normalizedAction === 'activate') {
      providerResource = await paymongoService.activateAccount(account.provider_merchant_id);
    }

    const providerPayload = providerResource?.attributes || providerResource || {};
    const walletEnabled = hasExplicitEnabledWalletEvidence(providerResource);
    const splitEnabled = walletEnabled && hasExplicitSplitEvidence(providerResource);
    const chargesEnabled = walletEnabled && hasExplicitChargeEvidence(providerResource);
    const activated = normalizedAction === 'activate' && ['activated', 'active'].includes(String(providerPayload.status || '').toLowerCase());
    const now = new Date();
    const metadata = {
      ...(account.metadata || {}),
      provider_status: providerPayload.status || account.metadata?.provider_status || null,
      provider_features: providerPayload.features || account.metadata?.provider_features || null,
      last_provider_action: normalizedAction,
      last_provider_action_at: now.toISOString(),
      last_provider_action_by: actor || null,
      provider_action_response_id: providerResource?.id || null
    };
    if (activated) {
      metadata.verification_reference = providerResource?.id || metadata.verification_reference || `paymongo:${normalizedAction}:${account.provider_merchant_id}`;
      metadata.verified_at = now.toISOString();
      metadata.verified_by = actor || 'platform-admin';
    }

    const updated = await commercePaymentRepository.upsertTenantPaymentAccount({
      tenant_id: normalizedTenantId,
      provider: 'paymongo',
      provider_merchant_id: account.provider_merchant_id,
      provider_wallet_id: providerPayload.wallet_id || providerPayload.wallet?.id || account.provider_wallet_id || null,
      wallet_status: walletEnabled ? 'enabled' : (providerPayload.wallet_status || account.wallet_status || 'unknown'),
      wallet_verified_at: walletEnabled ? now : account.wallet_verified_at,
      onboarding_status: activated ? 'active' : account.onboarding_status,
      qrph_enabled: activated ? true : Boolean(account.qrph_enabled),
      split_enabled: splitEnabled ? true : Boolean(account.split_enabled),
      charges_enabled: chargesEnabled ? true : Boolean(account.charges_enabled),
      requirements_due: extractRequirementsDue(providerResource) || account.requirements_due || null,
      metadata,
      last_synced_at: now
    });

    await writePaymentAudit({
      commercePaymentRepository,
      entityId: updated.account_id,
      action: 'UPDATE',
      actor,
      changes: {
        event: 'tenant_paymongo_child_account_provider_action',
        tenant_id: normalizedTenantId,
        provider_merchant_id: account.provider_merchant_id,
        action: normalizedAction,
        onboarding_status: updated.onboarding_status,
        wallet_status: updated.wallet_status,
        split_enabled: Boolean(updated.split_enabled),
        charges_enabled: Boolean(updated.charges_enabled)
      }
    });

    return ok({
      payment_account: serializeAccount(updated),
      provider_action: {
        action: normalizedAction,
        provider_resource_id: providerResource?.id || null,
        activated,
        wallet_evidence_detected: walletEnabled,
        split_evidence_detected: splitEnabled,
        charge_evidence_detected: chargesEnabled
      }
    });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildRetryCommercePaymentFinalizationUseCase = ({ commercePaymentRepository, partnerClient }) => async ({ paymentSessionId }) => {
  try {
    const reference = normalizeReference(paymentSessionId);
    const session = await commercePaymentRepository.findSessionByPublicReference(reference);
    if (!session) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payment session not found', { statusCode: 404 });
    if (!['paid', 'paid_manual_resolution_required', 'split_failed_manual_settlement_required'].includes(session.status)) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Only paid unresolved sessions can be retried', { statusCode: 409 });
    }
    const finalized = await finalizePaidCommerceSession({
      session,
      resource: session.provider_payload || {},
      providerEventId: session.provider_event_id,
      commercePaymentRepository,
      partnerClient
    });
    await writePaymentAudit({
      commercePaymentRepository,
      entityId: finalized.session_id,
      action: 'UPDATE',
      changes: {
        event: 'commerce_payment_finalization_retry',
        payment_session_id: finalized.public_reference,
        status: finalized.status
      }
    });
    return ok({ payment_session: serializeSession(finalized, await commercePaymentRepository.listRefundsBySession(finalized.session_id)) });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildReconcileCommercePaymentSessionUseCase = ({
  commercePaymentRepository,
  paymongoService,
  partnerClient
}) => async ({ paymentSessionId, actor = 'paymongo_admin_reconciliation' }) => {
  try {
    const reference = normalizeReference(paymentSessionId);
    const session = await commercePaymentRepository.findSessionByPublicReference(reference);
    if (!session) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payment session not found', { statusCode: 404 });
    const refunds = await commercePaymentRepository.listRefundsBySession(session.session_id);

    if (session.status === 'finalized' || session.pos_transaction_id || session.tracking_pin) {
      return ok({
        payment_session: serializeSession(session, refunds),
        reconciliation: {
          status: 'already_finalized',
          provider_status: session.status,
          provider_payment_id: session.provider_payment_id || null
        }
      });
    }
    if (!session.provider_payment_intent_id) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Payment session has no PayMongo payment intent to reconcile', { statusCode: 409 });
    }

    const paymentIntent = await paymongoService.retrievePaymentIntent(session.provider_payment_intent_id);
    const providerPayment = buildProviderPaidResource({ session, paymentIntent });
    if (!providerPayment.isPaid) {
      return ok({
        payment_session: serializeSession(session, refunds),
        reconciliation: {
          status: 'provider_not_paid',
          provider_status: providerPayment.providerStatus || 'unknown',
          provider_payment_id: null
        }
      });
    }
    if (!providerPayment.paymentId || !providerPayment.resource) {
      throw new DomainError(
        DomainErrorCode.CONFLICT,
        'PayMongo reports the payment intent as paid but did not return a payment record.',
        { statusCode: 409 }
      );
    }

    const processVerifiedPaidCommerceSession = buildProcessVerifiedPaidCommerceSessionUseCase({
      commercePaymentRepository,
      partnerClient
    });
    const processed = await processVerifiedPaidCommerceSession({
      session,
      resource: providerPayment.resource,
      actor
    });
    const reconciledSession = await commercePaymentRepository.findSessionByPublicReference(reference) || session;
    const reconciledRefunds = await commercePaymentRepository.listRefundsBySession(reconciledSession.session_id);
    await writePaymentAudit({
      commercePaymentRepository,
      entityId: reconciledSession.session_id,
      action: 'UPDATE',
      actor,
      changes: {
        event: 'commerce_payment_provider_reconciled',
        payment_session_id: reference,
        provider_status: providerPayment.providerStatus,
        provider_payment_intent_id: session.provider_payment_intent_id,
        provider_payment_id: providerPayment.paymentId,
        final_status: reconciledSession.status,
        finalization_status: processed?.status || null
      }
    });
    return ok({
      payment_session: serializeSession(reconciledSession, reconciledRefunds),
      reconciliation: {
        status: processed?.status === 'finalized' ? 'finalized' : 'paid_manual_resolution_required',
        provider_status: providerPayment.providerStatus,
        provider_payment_id: providerPayment.paymentId
      }
    });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

// #1268: admin-authenticated mirror of `buildConfirmStoreCheckoutSandboxPaymentUseCase`
// (apps/dgfy-api/src/modules/store/usecases/storeUseCases.js). Deliberately duplicates that use
// case's status/expiry/amount validation rather than sharing it, so the storefront use case (and
// its loopback-gated route) stays completely untouched, per the issue's own non-goals. This is a
// second, independent entry point into the same already-safe `confirmSandboxQrphPayment` call —
// not a proxy to the loopback route.
export const buildConfirmCommercePaymentSessionSandboxUseCase = ({
  commercePaymentRepository,
  paymongoService
}) => async ({ paymentSessionId, actor = 'paymongo_admin_sandbox_confirmation' }) => {
  try {
    if (process.env.PAYMONGO_MODE !== 'test') {
      throw new DomainError(
        DomainErrorCode.RESOURCE_NOT_FOUND,
        'Sandbox payment confirmation is not available.',
        { statusCode: 404 }
      );
    }

    const reference = normalizeReference(paymentSessionId);
    const session = await commercePaymentRepository.findSessionByPublicReference(reference);
    if (!session) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payment session not found', { statusCode: 404 });

    const refunds = await commercePaymentRepository.listRefundsBySession(session.session_id);

    if (session.status === 'finalized') {
      return ok({
        confirmation_requested: false,
        idempotent_replay: true,
        payment_session: serializeSession(session, refunds)
      });
    }
    if (session.status !== 'awaiting_payment') {
      throw new DomainError(
        DomainErrorCode.CONFLICT,
        `Payment session cannot be confirmed while ${String(session.status || 'unknown').replaceAll('_', ' ')}.`,
        { statusCode: 409 }
      );
    }
    if (!session.provider_payment_intent_id) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Payment session has no PayMongo payment intent.', { statusCode: 409 });
    }
    if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'The PayMongo QR Ph payment has expired.', { statusCode: 409 });
    }

    const providerResult = await paymongoService.confirmSandboxQrphPayment({
      paymentIntentId: session.provider_payment_intent_id,
      expectedAmount: session.total_amount_centavos,
      expectedCurrency: session.currency || 'PHP'
    });
    const providerAttributes = providerResult.paymentIntent?.attributes || {};
    if (
      Number(providerAttributes.amount) !== Number(session.total_amount_centavos)
      || String(providerAttributes.currency || '').toUpperCase() !== String(session.currency || 'PHP').toUpperCase()
    ) {
      throw new DomainError(
        DomainErrorCode.CONFLICT,
        'PayMongo sandbox payment amount or currency does not match this checkout.',
        { statusCode: 409 }
      );
    }

    await writePaymentAudit({
      commercePaymentRepository,
      entityId: session.session_id,
      action: 'UPDATE',
      actor,
      changes: {
        event: 'commerce_payment_sandbox_confirmation_requested',
        payment_session_id: reference
      }
    });

    return ok({
      confirmation_requested: true,
      idempotent_replay: false,
      payment_session: serializeSession(session, refunds)
    });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildCreateCommercePaymentRefundUseCase = ({
  commercePaymentRepository,
  paymongoService,
  revenueSharingEnabled = tenantRevenueSharingEnabled,
  // Phase 144 (#824): injected so the tenant-ledger wiring is assertable without module mocking,
  // matching how commerceOrderLifecycleUseCase takes its own writer.
  writeOrderPaymentLedgerEntry = writeTenantOrderPaymentEntry,
  raiseAlert = async () => {},
  logger = console
}) => async ({ paymentSessionId, payload = {}, actor = null, retryOfRefundReference = null }) => {
  try {
    const reference = normalizeReference(paymentSessionId);
    const session = await commercePaymentRepository.findSessionByPublicReference(reference);
    if (!session) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payment session not found', { statusCode: 404 });
    if (!session.provider_payment_id) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Payment session has no PayMongo payment ID to refund', { statusCode: 409 });
    }
    if (!['finalized', 'paid', 'split_failed_manual_settlement_required', 'partial_refunded', 'refund_pending'].includes(session.status)) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Only paid/finalized sessions can be refunded', { statusCode: 409 });
    }

    const requestedAmountCentavos = payload.amount_centavos
      ? toInt(payload.amount_centavos, 0)
      : toCentavos(payload.amount);
    if (requestedAmountCentavos <= 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Refund amount exceeds refundable balance', {
        statusCode: 422,
        details: { refundable_centavos: Number(session.total_amount_centavos || 0) }
      });
    }

    const strategy = String(payload.refund_strategy || 'proportional').trim();
    if (!['proportional', 'tenant', 'dgfy', 'custom'].includes(strategy)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Invalid refund strategy', { statusCode: 422 });
    }
    const splitRefund = revenueSharingEnabled
      ? null
      : buildSplitRefund({
        strategy,
        amountCentavos: requestedAmountCentavos,
        session,
        customSources: Array.isArray(payload.refund_sources) ? payload.refund_sources : []
      });
    if (!revenueSharingEnabled && strategy !== 'proportional' && (!splitRefund?.refund_sources || splitRefund.refund_sources.length === 0)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'split_refund refund_sources are required for this strategy', { statusCode: 422 });
    }
    if (!revenueSharingEnabled && strategy !== 'proportional' && splitRefund.refund_sources.some((source) => !source.merchant_id || source.value <= 0)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'split_refund sources require merchant_id and positive value', { statusCode: 422 });
    }
    if (!revenueSharingEnabled && strategy !== 'proportional') {
      const sourceTotal = splitRefund.refund_sources.reduce((sum, source) => sum + Number(source.value || 0), 0);
      if (sourceTotal !== requestedAmountCentavos) {
        throw new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          'split_refund source values must equal the requested refund amount',
          {
            statusCode: 422,
            details: {
              requested_amount_centavos: requestedAmountCentavos,
              split_refund_source_total_centavos: sourceTotal
            }
          }
        );
      }
    }

    const retryReference = retryOfRefundReference ? normalizeReference(retryOfRefundReference) : null;
    let retryOfRefundId = null;
    const refund = await commercePaymentRepository.runInTransaction(async (transaction) => {
      const lockedSession = await commercePaymentRepository.findSessionBySessionId(session.session_id, {
        transaction,
        lock: true
      });
      if (!lockedSession) {
        throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payment session not found', { statusCode: 404 });
      }

      if (retryReference) {
        const original = await commercePaymentRepository.findRefundByPublicReference(retryReference, {
          transaction,
          lock: true
        });
        if (!original || Number(original.payment_session_id) !== Number(lockedSession.session_id)) {
          throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Refund not found for this payment session', { statusCode: 404 });
        }
        const retryable = original.status === 'failed'
          || (original.status === 'manual_review_required' && original.failure_code === 'PROVIDER_REFUND_NOT_FOUND');
        if (!retryable) {
          throw new DomainError(DomainErrorCode.CONFLICT, 'This refund is not eligible for retry.', {
            statusCode: 409,
            observabilityReasonCode: 'COMMERCE_REFUND_RETRY_INELIGIBLE'
          });
        }
        const retryChild = await commercePaymentRepository.findRetryChildOf(original.refund_id, {
          transaction,
          lock: true
        });
        if (retryChild) {
          throw new DomainError(DomainErrorCode.CONFLICT, 'Retry the latest attempt instead.', {
            statusCode: 409,
            observabilityReasonCode: 'COMMERCE_REFUND_RETRY_HAS_CHILD'
          });
        }
        const refunds = await commercePaymentRepository.listRefundsBySession(lockedSession.session_id, { transaction });
        const anotherActiveRefund = refunds.some((row) => (
          Number(row.refund_id) !== Number(original.refund_id)
          && RETRY_ACTIVE_REFUND_STATUSES.includes(row.status)
        ));
        if (anotherActiveRefund) {
          throw new DomainError(DomainErrorCode.CONFLICT, 'Another refund is already active for this payment session.', {
            statusCode: 409,
            observabilityReasonCode: 'COMMERCE_REFUND_RETRY_ACTIVE_REFUND'
          });
        }
        retryOfRefundId = Number(original.refund_id);
      }

      const refundedCentavos = await commercePaymentRepository.sumRefundCentavosByStatuses(
        lockedSession.session_id,
        RETRY_ACTIVE_REFUND_STATUSES,
        { transaction }
      );
      const refundableCentavos = Number(lockedSession.total_amount_centavos || 0) - refundedCentavos;
      if (requestedAmountCentavos > refundableCentavos) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Refund amount exceeds refundable balance', {
          statusCode: 422,
          details: { refundable_centavos: refundableCentavos }
        });
      }

      return commercePaymentRepository.createRefund({
        public_reference: randomReference('CRF'),
        payment_session_id: lockedSession.session_id,
        retry_of_refund_id: retryOfRefundId,
        tenant_id: lockedSession.tenant_id,
        provider: 'paymongo',
        provider_payment_id: lockedSession.provider_payment_id,
        amount_centavos: requestedAmountCentavos,
        currency: lockedSession.currency || 'PHP',
        reason: payload.reason || 'requested_by_customer',
        notes: payload.notes ? String(payload.notes).slice(0, 255) : null,
        refund_strategy: revenueSharingEnabled ? 'proportional' : strategy,
        split_refund_payload: splitRefund,
        status: 'created',
        requested_by: actor || null
      }, { transaction });
    });

    let providerRefund;
    try {
      providerRefund = await paymongoService.createRefund({
        amount: requestedAmountCentavos,
        paymentId: session.provider_payment_id,
        reason: refund.reason,
        notes: refund.notes,
        splitRefund
      });
    } catch (error) {
      const pendingReconciliation = isAmbiguousProviderRefundError(error);
      const failed = await commercePaymentRepository.updateRefundById(refund.refund_id, {
        status: pendingReconciliation ? 'pending' : 'failed',
        failure_code: pendingReconciliation
          ? 'PROVIDER_REFUND_PENDING_RECONCILIATION'
          : 'PROVIDER_REFUND_FAILED',
        failure_reason: error.response?.data?.errors?.[0]?.detail || error.message || 'PayMongo refund failed'
      });
      await recordTenantRefundLedgerEntry({
        writeOrderPaymentLedgerEntry, commercePaymentRepository, session, refund, status: failed?.status
      });
      if (pendingReconciliation) {
        const pendingSession = await reconcileRefundedPaymentState({ commercePaymentRepository, session });
        return ok({
          refund: serializeRefund(failed, retryReference),
          payment_session: serializeSession(
            pendingSession,
            await commercePaymentRepository.listRefundsBySession(session.session_id)
          ),
          provider_confirmation_required: true,
          retryable: false
        });
      }
      await alertCommerceRefundFailed({ refund: failed, session, error, raiseAlert, logger });
      await writePaymentAudit({
        commercePaymentRepository,
        entityId: refund.refund_id,
        action: 'UPDATE',
        actor,
        changes: {
          event: 'commerce_payment_refund_failed',
          payment_session_id: session.public_reference,
          refund_reference: refund.public_reference,
          provider_payment_id: session.provider_payment_id,
          amount_centavos: requestedAmountCentavos,
          failure_code: failed?.failure_code,
          failure_reason: failed?.failure_reason
        }
      });
      return ok({ refund: serializeRefund(failed, retryReference), retryable: true });
    }

    const providerStatus = String(providerRefund?.attributes?.status || 'pending').toLowerCase();
    const nextRefundStatus = TERMINAL_REFUND_SUCCESS_STATUSES.has(providerStatus)
      ? 'succeeded'
      : (TERMINAL_REFUND_FAILURE_STATUSES.has(providerStatus) ? 'failed' : 'pending');
    const updatedRefund = await commercePaymentRepository.updateRefundById(refund.refund_id, {
      status: nextRefundStatus,
      provider_refund_id: providerRefund?.id || null,
      provider_payload: providerRefund,
      failure_code: nextRefundStatus === 'failed' ? 'PROVIDER_REFUND_FAILED' : null,
      failure_reason: nextRefundStatus === 'failed' ? (providerRefund?.attributes?.failed_message || 'PayMongo reported refund failure.') : null
    });
    await recordTenantRefundLedgerEntry({
      writeOrderPaymentLedgerEntry, commercePaymentRepository, session, refund, status: nextRefundStatus
    });

    const updatedSession = await reconcileRefundedPaymentState({ commercePaymentRepository, session });
    if (nextRefundStatus === 'succeeded') {
      const revenueResult = await recordSucceededTenantRevenueRefundUseCase({
        session: updatedSession,
        refund: updatedRefund,
        actor: actor || 'commerce_payment_admin'
      });
      if (!revenueResult.success) throw revenueResult.error;
    }
    if (nextRefundStatus === 'failed') {
      await alertCommerceRefundFailed({
        refund: updatedRefund,
        session: updatedSession,
        error: new Error(updatedRefund.failure_reason || 'PayMongo reported refund failure.'),
        raiseAlert,
        logger
      });
      await writePaymentAudit({
        commercePaymentRepository,
        entityId: refund.refund_id,
        action: 'UPDATE',
        actor,
        changes: {
          event: 'commerce_payment_refund_failed',
          payment_session_id: session.public_reference,
          refund_reference: refund.public_reference,
          provider_refund_id: providerRefund?.id || null,
          amount_centavos: requestedAmountCentavos,
          failure_code: updatedRefund.failure_code,
          failure_reason: updatedRefund.failure_reason
        }
      });
    }
    await writePaymentAudit({
      commercePaymentRepository,
      entityId: refund.refund_id,
      action: 'CREATE',
      actor,
      changes: {
        event: 'commerce_payment_refund_submitted',
        payment_session_id: session.public_reference,
        refund_reference: refund.public_reference,
        provider_refund_id: providerRefund?.id || null,
        amount_centavos: requestedAmountCentavos,
        provider_status: providerStatus,
        stored_status: nextRefundStatus
      }
    });

    return ok({
      refund: serializeRefund(updatedRefund, retryReference),
      payment_session: serializeSession(updatedSession, await commercePaymentRepository.listRefundsBySession(session.session_id))
    });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};

export const buildRetryCommercePaymentRefundUseCase = ({
  commercePaymentRepository,
  paymongoService,
  createCommercePaymentRefundUseCase
}) => async ({ paymentSessionId, refundId, actor = null, actorAdminId = null, reason = '', requestId = null }) => {
  const paymentSessionReference = normalizeReference(paymentSessionId);
  const refundReference = normalizeReference(refundId);
  const normalizedReason = String(reason || '').trim();
  let session = null;
  let original = null;

  const auditBlocked = async (blockCode) => {
    const originalRefundId = original && Number.isInteger(Number(original.refund_id))
      ? Number(original.refund_id)
      : null;
    await writePaymentAudit({
      commercePaymentRepository,
      entityId: originalRefundId,
      action: 'UPDATE',
      actor,
      eventType: 'commerce_payment_refund_retry_blocked',
      actorUsername: actor,
      reason: normalizedReason,
      requestId,
      changes: {
        payment_session_id: session?.public_reference || paymentSessionReference || null,
        original_refund_reference: original?.public_reference || refundReference || null,
        amount_centavos: original ? Number(original.amount_centavos || 0) : null,
        actor_admin_id: actorAdminId || null,
        retry_reason: normalizedReason,
        block_code: blockCode
      }
    });
  };

  const rejectBlocked = async (blockCode, error) => {
    await auditBlocked(blockCode);
    throw error;
  };

  try {
    if (normalizedReason.length < 3 || normalizedReason.length > 255) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Retry reason must be between 3 and 255 characters.', {
        statusCode: 422
      });
    }

    session = await commercePaymentRepository.findSessionByPublicReference(paymentSessionReference);
    if (!session) {
      await rejectBlocked('PAYMENT_SESSION_NOT_FOUND', new DomainError(
        DomainErrorCode.RESOURCE_NOT_FOUND,
        'Payment session not found.',
        { statusCode: 404 }
      ));
    }
    original = await commercePaymentRepository.findRefundByPublicReference(refundReference);
    if (!original || Number(original.payment_session_id) !== Number(session.session_id)) {
      await rejectBlocked('REFUND_NOT_FOUND_FOR_SESSION', new DomainError(
        DomainErrorCode.RESOURCE_NOT_FOUND,
        'Refund not found for this payment session.',
        { statusCode: 404 }
      ));
    }
    const eligible = original.status === 'failed'
      || (original.status === 'manual_review_required' && original.failure_code === 'PROVIDER_REFUND_NOT_FOUND');
    if (!eligible) {
      await rejectBlocked('COMMERCE_REFUND_RETRY_INELIGIBLE', new DomainError(
        DomainErrorCode.CONFLICT,
        'This refund is not eligible for retry.',
        { statusCode: 409, observabilityReasonCode: 'COMMERCE_REFUND_RETRY_INELIGIBLE' }
      ));
    }

    const retryChild = await commercePaymentRepository.findRetryChildOf(original.refund_id);
    if (retryChild) {
      await rejectBlocked('COMMERCE_REFUND_RETRY_HAS_CHILD', new DomainError(
        DomainErrorCode.CONFLICT,
        'Retry the latest attempt instead.',
        { statusCode: 409, observabilityReasonCode: 'COMMERCE_REFUND_RETRY_HAS_CHILD' }
      ));
    }

    const refunds = await commercePaymentRepository.listRefundsBySession(session.session_id);
    if (refunds.some((refund) => (
      Number(refund.refund_id) !== Number(original.refund_id)
      && RETRY_ACTIVE_REFUND_STATUSES.includes(refund.status)
    ))) {
      await rejectBlocked('COMMERCE_REFUND_RETRY_ACTIVE_REFUND', new DomainError(
        DomainErrorCode.CONFLICT,
        'Another refund is already active for this payment session.',
        { statusCode: 409, observabilityReasonCode: 'COMMERCE_REFUND_RETRY_ACTIVE_REFUND' }
      ));
    }

    if (typeof paymongoService?.listPaymentRefunds !== 'function') {
      await rejectBlocked('COMMERCE_REFUND_RETRY_PROVIDER_READ_UNAVAILABLE', new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        'PayMongo refund verification is unavailable.',
        { statusCode: 503, observabilityReasonCode: 'COMMERCE_REFUND_RETRY_PROVIDER_READ_UNAVAILABLE' }
      ));
    }
    let providerRefunds;
    try {
      providerRefunds = await paymongoService.listPaymentRefunds(session.provider_payment_id);
    } catch (error) {
      await rejectBlocked('COMMERCE_REFUND_RETRY_PROVIDER_READ_FAILED', new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        'PayMongo could not be checked before retrying this refund.',
        { statusCode: 503, cause: error, observabilityReasonCode: 'COMMERCE_REFUND_RETRY_PROVIDER_READ_FAILED' }
      ));
    }
    if (!Array.isArray(providerRefunds)) {
      await rejectBlocked('COMMERCE_REFUND_RETRY_PROVIDER_READ_INVALID', new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        'PayMongo refund verification returned an invalid response.',
        { statusCode: 503, observabilityReasonCode: 'COMMERCE_REFUND_RETRY_PROVIDER_READ_INVALID' }
      ));
    }
    for (const providerRefund of providerRefunds) {
      const attributes = providerRefund?.attributes || providerRefund || {};
      const providerRefundId = String(providerRefund?.id || attributes.id || '').trim();
      if (
        providerRefundId.startsWith('ref_')
        && Number(attributes.amount || 0) === Number(original.amount_centavos || 0)
      ) {
        const matchingLocalRefund = await commercePaymentRepository.findRefundByProviderId(providerRefundId);
        const matchingManualReviewAttempt = original.status === 'manual_review_required'
          && matchingLocalRefund
          && Number(matchingLocalRefund.refund_id) === Number(original.refund_id);
        if (matchingLocalRefund && !matchingManualReviewAttempt) continue;
        await rejectBlocked('COMMERCE_REFUND_RETRY_UNLINKED_PROVIDER_MATCH', new DomainError(
          DomainErrorCode.CONFLICT,
          'An unlinked PayMongo refund with this amount already exists. Review it before retrying.',
          { statusCode: 409, observabilityReasonCode: 'COMMERCE_REFUND_RETRY_UNLINKED_PROVIDER_MATCH' }
        ));
      }
    }

    const retryResult = await createCommercePaymentRefundUseCase({
      paymentSessionId: paymentSessionReference,
      payload: {
        amount_centavos: Number(original.amount_centavos),
        refund_strategy: original.refund_strategy || 'proportional',
        reason: original.reason || 'requested_by_customer',
        notes: `Retry of ${original.public_reference}`,
        refund_sources: original.split_refund_payload?.refund_sources || []
      },
      actor,
      retryOfRefundReference: original.public_reference
    });
    if (!retryResult?.success) {
      await auditBlocked(retryResult?.error?.observabilityReasonCode || 'COMMERCE_REFUND_RETRY_CREATE_FAILED');
      return retryResult;
    }

    const newRefund = retryResult.data?.refund || null;
    const newRefundReference = newRefund?.public_reference || newRefund?.refund_id || null;

    await writePaymentAudit({
      commercePaymentRepository,
      entityId: Number(original.refund_id),
      action: 'CREATE',
      actor,
      eventType: 'commerce_payment_refund_retried',
      actorUsername: actor,
      reason: normalizedReason,
      requestId,
      changes: {
        payment_session_id: session.public_reference,
        original_refund_reference: original.public_reference,
        new_refund_reference: newRefundReference,
        amount_centavos: Number(original.amount_centavos),
        outcome: newRefund?.status || null,
        provider_refund_id: newRefund?.provider_refund_id || null,
        actor_admin_id: actorAdminId || null,
        retry_reason: normalizedReason
      }
    });
    return {
      ...retryResult,
      data: {
        ...retryResult.data,
        refund: newRefund ? { ...newRefund, retry_of: original.public_reference } : newRefund
      }
    };
  } catch (error) {
    return fail(error instanceof DomainError
      ? error
      : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message || 'Failed to retry commerce payment refund.'));
  }
};
