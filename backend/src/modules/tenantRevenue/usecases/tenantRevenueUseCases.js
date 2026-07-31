import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  canUseAutomaticTenantPayouts,
  tenantRevenueDefaultRateBps,
  tenantRevenueDefaultSettlementCycleDays,
  tenantRevenueSharingEnabled
} from '../../../config/tenantRevenueFeature.js';

const CENTAVOS_PER_PESO = 100n;
const BPS_DENOMINATOR = 10000n;

const parseJsonObject = (value) => {
  let parsed = value;
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
};

const toBigInt = (value, fallback = 0n) => {
  if (typeof value === 'bigint') return value;
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = String(value).trim();
  if (!/^-?\d+$/.test(normalized)) return fallback;
  return BigInt(normalized);
};

const toSafeNumber = (value, label = 'amount') => {
  const amount = toBigInt(value);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${label} exceeds the supported range.`);
  }
  return Number(amount);
};

const roundBasisPoints = (amountCentavos, basisPoints) => {
  const amount = toBigInt(amountCentavos);
  const bps = toBigInt(basisPoints);
  if (amount < 0n || bps < 0n || bps > BPS_DENOMINATOR) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Financial rate inputs are invalid.');
  }
  return (amount * bps + (BPS_DENOMINATOR / 2n)) / BPS_DENOMINATOR;
};

const addDays = (date, days) => {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + Number(days));
  return value;
};

const requireActor = (actor) => {
  const normalized = String(actor || '').trim();
  if (!normalized) {
    throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'An authenticated admin is required.');
  }
  return normalized.slice(0, 120);
};

const requireReason = (reason, label = 'Reason') => {
  const normalized = String(reason || '').trim();
  if (normalized.length < 3 || normalized.length > 500) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${label} must be between 3 and 500 characters.`);
  }
  return normalized;
};

const requireDate = (value, label) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${label} is invalid.`);
  }
  return date;
};

const getAttributes = (resource = {}) => resource?.attributes || resource || {};

const firstInteger = (...values) => {
  for (const value of values) {
    if (Number.isInteger(value) && value >= 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  }
  return null;
};

const normalizePaymentMethod = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['card', 'credit_card', 'debit_card'].includes(normalized)) return 'card';
  if (['gcash', 'grab_pay', 'grabpay', 'maya', 'paymaya', 'shopeepay', 'wallet', 'e_wallet'].includes(normalized)) {
    return 'ewallet';
  }
  if (['qrph', 'qr_ph', 'qr'].includes(normalized)) return 'qrph';
  if (['online_banking', 'bank_transfer', 'instapay', 'pesonet', 'dob', 'brankas'].includes(normalized)) {
    return 'online_banking';
  }
  return normalized || 'other';
};

const calculateConfiguredProviderFallback = ({ grossCentavos, paymentMethod, policy }) => {
  const method = normalizePaymentMethod(paymentMethod);
  const fallbackPolicy = policy?.fallback_fee_policy;
  if (!fallbackPolicy || typeof fallbackPolicy !== 'object' || Array.isArray(fallbackPolicy)) return null;
  const configuration = fallbackPolicy[method];
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return null;
  const rateBps = firstInteger(configuration.rate_bps) ?? 0;
  const fixedCentavos = firstInteger(configuration.fixed_centavos) ?? 0;
  if (rateBps < 0 || rateBps > 10000 || fixedCentavos < 0) return null;
  return toSafeNumber(
    roundBasisPoints(grossCentavos || 0, rateBps) + toBigInt(fixedCentavos),
    `${method} provider fallback fee`
  );
};

const extractProviderFinancials = ({ session, resource, policy }) => {
  const attrs = getAttributes(resource);
  const balanceAttrs = attrs.balance_transaction?.attributes
    || attrs.balance_transaction
    || attrs.balance_transaction_data?.attributes
    || {};
  const paymentMethod = normalizePaymentMethod(
    attrs.source?.type
      || attrs.payment_method?.type
      || attrs.payment_method_type
      || session?.payment_method
      || 'other'
  );
  const gross = firstInteger(attrs.amount, balanceAttrs.amount, session.total_amount_centavos);
  const explicitFee = firstInteger(
    attrs.fee,
    attrs.fee_amount,
    attrs.processing_fee,
    balanceAttrs.fee,
    balanceAttrs.fee_amount
  );
  const explicitNet = firstInteger(attrs.net_amount, attrs.net, balanceAttrs.net_amount, balanceAttrs.net);
  const feeVat = firstInteger(
    attrs.fee_vat,
    attrs.fee_vat_amount,
    balanceAttrs.fee_vat,
    balanceAttrs.fee_vat_amount
  );
  const fallbackFee = explicitFee === null
    ? calculateConfiguredProviderFallback({ grossCentavos: gross || 0, paymentMethod, policy })
    : null;
  const providerFee = explicitFee ?? fallbackFee;
  const source = explicitFee !== null
    ? 'webhook'
    : (fallbackFee !== null ? 'fallback' : 'manual_review');
  const providerNet = explicitNet ?? (
    gross !== null && providerFee !== null ? Math.max(0, gross - providerFee) : null
  );

  return {
    gross,
    providerFee,
    providerNet,
    feeVat,
    providerFeeSource: source,
    providerBalanceTransactionId: attrs.balance_transaction_id
      || attrs.balance_transaction?.id
      || balanceAttrs.id
      || null,
    paymentMethod
  };
};

const allocateProviderFee = ({ providerFeeCentavos, policy }) => {
  const fee = toBigInt(providerFeeCentavos);
  if (policy.provider_fee_payer === 'dgfy') {
    return { tenant: 0n, dgfy: fee };
  }
  if (policy.provider_fee_payer === 'shared') {
    const tenant = roundBasisPoints(fee, policy.shared_fee_tenant_bps);
    return { tenant, dgfy: fee - tenant };
  }
  return { tenant: fee, dgfy: 0n };
};

const calculateTenantRevenueBreakdown = ({
  grossAmountCentavos,
  providerFeeCentavos,
  policy
}) => {
  const gross = toBigInt(grossAmountCentavos);
  const providerFee = toBigInt(providerFeeCentavos);
  const dgfyFee = roundBasisPoints(gross, policy.dgfy_rate_bps);
  const providerFeeAllocation = allocateProviderFee({
    providerFeeCentavos: providerFee,
    policy
  });
  return {
    gross,
    providerFee,
    dgfyFee,
    tenantProviderFee: providerFeeAllocation.tenant,
    dgfyProviderFee: providerFeeAllocation.dgfy,
    tenantNetPayable: gross - dgfyFee - providerFeeAllocation.tenant
  };
};

const buildDefaultPolicySnapshot = () => ({
  policy_id: null,
  version: 0,
  dgfy_rate_bps: tenantRevenueDefaultRateBps,
  settlement_cycle_days: tenantRevenueDefaultSettlementCycleDays,
  settlement_status: 'on_hold',
  minimum_payout_centavos: 0,
  currency: 'PHP',
  provider_fee_payer: 'tenant',
  shared_fee_tenant_bps: null,
  automatic_payout_enabled: false,
  payout_destination_masked: null,
  source: 'governed_default_missing_tenant_policy'
});

const sanitizePolicy = (policy) => {
  if (!policy) return policy;
  return Object.fromEntries(
    Object.entries(policy).filter(([key]) => key !== 'payout_destination_encrypted')
  );
};

const sanitizeTransaction = (transaction) => ({
  ...transaction,
  financial_snapshot: parseJsonObject(transaction.financial_snapshot),
  gross_amount_centavos: toSafeNumber(transaction.gross_amount_centavos),
  provider_fee_centavos: transaction.provider_fee_centavos === null
    ? null
    : toSafeNumber(transaction.provider_fee_centavos),
  provider_fee_vat_centavos: transaction.provider_fee_vat_centavos === null
    ? null
    : toSafeNumber(transaction.provider_fee_vat_centavos),
  provider_net_centavos: transaction.provider_net_centavos === null
    ? null
    : toSafeNumber(transaction.provider_net_centavos),
  dgfy_fee_centavos: toSafeNumber(transaction.dgfy_fee_centavos),
  tenant_provider_fee_centavos: toSafeNumber(transaction.tenant_provider_fee_centavos),
  dgfy_provider_fee_centavos: toSafeNumber(transaction.dgfy_provider_fee_centavos),
  refund_centavos: toSafeNumber(transaction.refund_centavos),
  chargeback_centavos: toSafeNumber(transaction.chargeback_centavos),
  adjustment_centavos: toSafeNumber(transaction.adjustment_centavos),
  tenant_net_payable_centavos: toSafeNumber(transaction.tenant_net_payable_centavos)
});

const makeReference = (prefix) => {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `${prefix}-${timestamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

const normalizeFallbackFeePolicy = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Payment-method fallback fees are invalid.');
  }
  const supportedMethods = new Set(['card', 'ewallet', 'qrph', 'online_banking', 'other']);
  const normalized = {};
  for (const [rawMethod, rawConfiguration] of Object.entries(value)) {
    const method = normalizePaymentMethod(rawMethod);
    if (!supportedMethods.has(method)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `Unsupported fallback payment method: ${rawMethod}.`
      );
    }
    if (!rawConfiguration || typeof rawConfiguration !== 'object' || Array.isArray(rawConfiguration)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Fallback fee for ${method} is invalid.`);
    }
    const rateBps = rawConfiguration.rate_bps === undefined
      ? 0
      : Number.parseInt(rawConfiguration.rate_bps, 10);
    const fixedCentavos = rawConfiguration.fixed_centavos === undefined
      ? 0
      : Number.parseInt(rawConfiguration.fixed_centavos, 10);
    if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${method} fallback rate is invalid.`);
    }
    if (!Number.isInteger(fixedCentavos) || fixedCentavos < 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${method} fixed fallback fee is invalid.`);
    }
    normalized[method] = {
      rate_bps: rateBps,
      fixed_centavos: fixedCentavos
    };
  }
  return Object.keys(normalized).length ? normalized : null;
};

const normalizePolicyInput = (payload = {}) => {
  const rate = Number.parseInt(payload.dgfy_rate_bps, 10);
  const cycle = Number.parseInt(payload.settlement_cycle_days, 10);
  const providerFeePayer = String(payload.provider_fee_payer || 'tenant').toLowerCase();
  const sharedRate = payload.shared_fee_tenant_bps === null || payload.shared_fee_tenant_bps === undefined
    ? null
    : Number.parseInt(payload.shared_fee_tenant_bps, 10);
  const status = String(payload.settlement_status || 'on_hold').toLowerCase();

  if (!Number.isInteger(rate) || rate < 0 || rate > 10000) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY fee rate must be between 0 and 10,000 basis points.');
  }
  if (![15, 30].includes(cycle)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Settlement cycle must be 15 or 30 days.');
  }
  if (!['tenant', 'dgfy', 'shared'].includes(providerFeePayer)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Provider fee payer is invalid.');
  }
  if (providerFeePayer === 'shared' && (!Number.isInteger(sharedRate) || sharedRate < 0 || sharedRate > 10000)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Shared provider fee allocation is required.');
  }
  if (!['active', 'suspended', 'on_hold'].includes(status)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Settlement policy status is invalid.');
  }
  if (payload.automatic_payout_enabled === true && !canUseAutomaticTenantPayouts) {
    throw new DomainError(
      DomainErrorCode.SERVICE_UNAVAILABLE,
      'Automatic payouts are locked until provider, legal, accounting, and production approval are confirmed.',
      { statusCode: 503 }
    );
  }

  return {
    dgfy_rate_bps: rate,
    settlement_cycle_days: String(cycle),
    settlement_status: status,
    minimum_payout_centavos: toSafeNumber(payload.minimum_payout_centavos || 0, 'minimum payout'),
    currency: 'PHP',
    provider_fee_payer: providerFeePayer,
    shared_fee_tenant_bps: providerFeePayer === 'shared' ? sharedRate : null,
    fallback_fee_policy: normalizeFallbackFeePolicy(payload.fallback_fee_policy),
    automatic_payout_enabled: payload.automatic_payout_enabled === true,
    large_payout_threshold_centavos: payload.large_payout_threshold_centavos === null
      || payload.large_payout_threshold_centavos === undefined
      ? null
      : toSafeNumber(payload.large_payout_threshold_centavos, 'large payout threshold'),
    effective_at: requireDate(payload.effective_at || new Date(), 'Effective date'),
    reason: requireReason(payload.reason, 'Policy change reason')
  };
};

const wrap = (handler) => async (...args) => {
  try {
    return ok(await handler(...args));
  } catch (error) {
    return fail(error instanceof DomainError
      ? error
      : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message || 'Tenant revenue operation failed.'));
  }
};

export const buildTenantRevenueUseCases = ({
  tenantRevenueRepository,
  payoutDestinationCrypto
}) => {
  const {
    encryptPayoutDestination,
    maskPayoutDestination
  } = payoutDestinationCrypto;
  const createFeePolicy = wrap(async ({ tenantId, payload, actor }) => {
    const requestedBy = requireActor(actor);
    const normalized = normalizePolicyInput(payload);
    const tenant = await tenantRevenueRepository.findTenantById(tenantId);
    if (!tenant) throw new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found.');

    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const latest = await tenantRevenueRepository.findLatestFeePolicy(tenantId, {
        transaction,
        lock: true
      });
      if (latest && new Date(normalized.effective_at) <= new Date(latest.effective_at)) {
        throw new DomainError(
          DomainErrorCode.CONFLICT,
          'A new fee policy must take effect after the latest policy.'
        );
      }

      let encryptedDestination = latest?.payout_destination_encrypted || null;
      let maskedDestination = latest?.payout_destination_masked || null;
      if (payload.payout_destination) {
        encryptedDestination = encryptPayoutDestination(payload.payout_destination);
        maskedDestination = maskPayoutDestination(payload.payout_destination);
      }

      if (latest && !latest.ends_at) {
        await tenantRevenueRepository.updateFeePolicy(latest.policy_id, {
          ends_at: new Date(normalized.effective_at.getTime() - 1)
        }, { transaction, lock: true });
      }

      const created = await tenantRevenueRepository.createFeePolicy({
        tenant_id: tenantId,
        version: Number(latest?.version || 0) + 1,
        ...normalized,
        payout_destination_encrypted: encryptedDestination,
        payout_destination_masked: maskedDestination,
        created_by: requestedBy
      }, { transaction });

      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantRevenueFeePolicy',
        entity_id: created.policy_id,
        action: 'CREATE',
        changes: {
          event: 'tenant_revenue_fee_policy_version_created',
          tenant_id: tenantId,
          old_value: latest ? {
            version: latest.version,
            dgfy_rate_bps: latest.dgfy_rate_bps,
            settlement_cycle_days: latest.settlement_cycle_days,
            settlement_status: latest.settlement_status,
            minimum_payout_centavos: latest.minimum_payout_centavos,
            provider_fee_payer: latest.provider_fee_payer,
            shared_fee_tenant_bps: latest.shared_fee_tenant_bps,
            fallback_fee_policy: latest.fallback_fee_policy,
            payout_destination_masked: latest.payout_destination_masked,
            automatic_payout_enabled: latest.automatic_payout_enabled,
            effective_at: latest.effective_at,
            ends_at: latest.ends_at
          } : null,
          new_value: {
            version: created.version,
            dgfy_rate_bps: created.dgfy_rate_bps,
            settlement_cycle_days: created.settlement_cycle_days,
            settlement_status: created.settlement_status,
            minimum_payout_centavos: created.minimum_payout_centavos,
            provider_fee_payer: created.provider_fee_payer,
            shared_fee_tenant_bps: created.shared_fee_tenant_bps,
            fallback_fee_policy: created.fallback_fee_policy,
            payout_destination_masked: created.payout_destination_masked,
            automatic_payout_enabled: created.automatic_payout_enabled,
            effective_at: created.effective_at,
            ends_at: created.ends_at
          },
          version: created.version,
          dgfy_rate_bps: created.dgfy_rate_bps,
          settlement_cycle_days: created.settlement_cycle_days,
          settlement_status: created.settlement_status,
          automatic_payout_enabled: created.automatic_payout_enabled,
          reason: created.reason
        }
      }, { transaction });

      return { policy: sanitizePolicy(created) };
    });
  });

  const listFeePolicies = wrap(async ({ tenantId }) => ({
    policies: (await tenantRevenueRepository.listFeePolicies(tenantId)).map(sanitizePolicy)
  }));

  const postPaidTransaction = wrap(async ({
    session,
    resource,
    providerEventId,
    actor = 'paymongo_webhook'
  }) => {
    if (!tenantRevenueSharingEnabled) {
      return { posted: false, reason: 'tenant_revenue_sharing_disabled' };
    }
    if (!session?.session_id || !session?.tenant_id) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Payment session is missing tenant revenue identifiers.');
    }

    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const existing = await tenantRevenueRepository.findRevenueTransactionBySession(
        session.session_id,
        { transaction, lock: true }
      );
      if (existing) return { posted: false, reason: 'already_posted', transaction: sanitizeTransaction(existing) };

      const paidAt = session.paid_at ? new Date(session.paid_at) : new Date();
      const effectivePolicy = await tenantRevenueRepository.findEffectiveFeePolicy(
        session.tenant_id,
        paidAt,
        { transaction, lock: true }
      );
      const policy = effectivePolicy || buildDefaultPolicySnapshot();
      const provider = extractProviderFinancials({ session, resource, policy });
      const gross = toBigInt(provider.gross);
      if (gross <= 0n) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Provider payment gross amount is invalid.');
      }

      const providerFeeKnown = provider.providerFee !== null;
      const providerFee = toBigInt(provider.providerFee);
      const breakdown = calculateTenantRevenueBreakdown({
        grossAmountCentavos: gross,
        providerFeeCentavos: providerFee,
        policy
      });
      const dgfyFee = breakdown.dgfyFee;
      const allocation = {
        tenant: breakdown.tenantProviderFee,
        dgfy: breakdown.dgfyProviderFee
      };
      const tenantNetPayable = breakdown.tenantNetPayable;
      const providerIdentityMatches = providerFeeKnown
        && provider.providerNet !== null
        && toBigInt(provider.providerNet) + providerFee === gross;
      const reconciliationStatus = providerIdentityMatches ? 'reconciled' : 'exception';
      // A verified payment is real money, but it is not settlement-eligible
      // until the tenant POS confirms that the order was fulfilled.
      const settlementStatus = 'on_hold';

      const attrs = getAttributes(resource);
      const providerPaymentId = String(
        resource?.id
        || attrs.payment_id
        || session.provider_payment_id
        || ''
      ).trim();
      if (!providerPaymentId) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Provider payment ID is missing.');
      }

      const checkout = session.checkout_payload || {};
      const created = await tenantRevenueRepository.createRevenueTransaction({
        tenant_id: session.tenant_id,
        payment_session_id: session.session_id,
        policy_id: effectivePolicy?.policy_id || null,
        company_id: checkout.company_id || checkout.companyId || null,
        branch_id: checkout.branch_id || checkout.location_id || checkout.branchId || null,
        order_id: checkout.order_id || checkout.orderId || session.public_reference,
        provider: 'paymongo',
        provider_payment_id: providerPaymentId,
        provider_payment_intent_id: attrs.payment_intent_id
          || attrs.payment_intent?.id
          || session.provider_payment_intent_id
          || null,
        provider_source_id: attrs.source?.id || attrs.source_id || null,
        provider_balance_transaction_id: provider.providerBalanceTransactionId,
        payment_method: provider.paymentMethod,
        currency: String(session.currency || attrs.currency || 'PHP').toUpperCase(),
        gross_amount_centavos: toSafeNumber(gross, 'gross amount'),
        provider_fee_centavos: providerFeeKnown ? toSafeNumber(providerFee, 'provider fee') : null,
        provider_fee_vat_centavos: provider.feeVat,
        provider_net_centavos: provider.providerNet,
        provider_fee_source: provider.providerFeeSource,
        dgfy_rate_bps: Number(policy.dgfy_rate_bps),
        dgfy_fee_centavos: toSafeNumber(dgfyFee, 'DGFY fee'),
        tenant_provider_fee_centavos: toSafeNumber(allocation.tenant, 'tenant provider fee'),
        dgfy_provider_fee_centavos: toSafeNumber(allocation.dgfy, 'DGFY provider fee'),
        refund_centavos: 0,
        chargeback_centavos: 0,
        adjustment_centavos: 0,
        tenant_net_payable_centavos: toSafeNumber(tenantNetPayable, 'tenant payable'),
        settlement_cycle_days: Number(policy.settlement_cycle_days),
        eligibility_at: addDays(paidAt, policy.settlement_cycle_days),
        fulfillment_status: 'pending',
        fulfilled_at: null,
        fulfillment_updated_at: null,
        payment_status: 'paid',
        reconciliation_status: reconciliationStatus,
        settlement_status: settlementStatus,
        provider_event_id: providerEventId || session.provider_event_id || null,
        paid_at: paidAt,
        created_by: actor,
        approved_by: null,
        financial_snapshot: {
          collection_model: 'dgfy_collects_then_settles_tenant',
          split_payment_used: false,
          policy: sanitizePolicy(policy),
          provider_financials: provider,
          calculation: {
            gross_centavos: gross.toString(),
            dgfy_fee_centavos: dgfyFee.toString(),
            tenant_provider_fee_centavos: allocation.tenant.toString(),
            dgfy_provider_fee_centavos: allocation.dgfy.toString(),
            tenant_net_payable_centavos: tenantNetPayable.toString()
          }
        }
      }, { transaction });
      if (created.__idempotent_replay) {
        const existingTransaction = Object.fromEntries(
          Object.entries(created).filter(([key]) => key !== '__idempotent_replay')
        );
        return {
          posted: false,
          reason: 'already_posted',
          transaction: sanitizeTransaction(existingTransaction)
        };
      }

      const ledgerBase = {
        tenant_id: session.tenant_id,
        revenue_transaction_id: created.revenue_transaction_id,
        settlement_batch_id: null,
        payout_id: null,
        currency: created.currency,
        reverses_ledger_entry_id: null,
        created_by: actor,
        approved_by: null
      };
      await tenantRevenueRepository.createLedgerEntry({
        ...ledgerBase,
        entry_type: 'payment',
        debit_account: 'paymongo_clearing',
        credit_account: 'tenant_payable',
        amount_centavos: toSafeNumber(gross),
        idempotency_key: `payment:${providerPaymentId}`,
        reason: 'PayMongo payment received for tenant order.',
        metadata: { provider_event_id: providerEventId || null }
      }, { transaction });

      if (dgfyFee > 0n) {
        await tenantRevenueRepository.createLedgerEntry({
          ...ledgerBase,
          entry_type: 'platform_fee',
          debit_account: 'tenant_payable',
          credit_account: 'dgfy_platform_revenue',
          amount_centavos: toSafeNumber(dgfyFee),
          idempotency_key: `platform-fee:${providerPaymentId}`,
          reason: `DGFY platform fee at ${policy.dgfy_rate_bps} basis points.`,
          metadata: { policy_id: effectivePolicy?.policy_id || null, policy_version: policy.version }
        }, { transaction });
      }

      if (allocation.tenant > 0n) {
        await tenantRevenueRepository.createLedgerEntry({
          ...ledgerBase,
          entry_type: 'provider_fee',
          debit_account: 'tenant_payable',
          credit_account: 'paymongo_fee_clearing',
          amount_centavos: toSafeNumber(allocation.tenant),
          idempotency_key: `provider-fee-tenant:${providerPaymentId}`,
          reason: 'Tenant share of PayMongo processing fee.',
          metadata: { provider_fee_source: provider.providerFeeSource }
        }, { transaction });
      }
      if (allocation.dgfy > 0n) {
        await tenantRevenueRepository.createLedgerEntry({
          ...ledgerBase,
          entry_type: 'provider_fee',
          debit_account: 'paymongo_fee_expense',
          credit_account: 'paymongo_fee_clearing',
          amount_centavos: toSafeNumber(allocation.dgfy),
          idempotency_key: `provider-fee-dgfy:${providerPaymentId}`,
          reason: 'DGFY share of PayMongo processing fee.',
          metadata: { provider_fee_source: provider.providerFeeSource }
        }, { transaction });
      }

      if (!effectivePolicy) {
        await tenantRevenueRepository.createReconciliationRecord({
          tenant_id: session.tenant_id,
          revenue_transaction_id: created.revenue_transaction_id,
          exception_type: 'missing_effective_fee_policy',
          severity: 'blocking',
          expected_value: { policy_status: 'active' },
          actual_value: { policy_status: 'missing' },
          status: 'open',
          detected_at: new Date()
        }, { transaction });
      }
      if (!providerIdentityMatches) {
        await tenantRevenueRepository.createReconciliationRecord({
          tenant_id: session.tenant_id,
          revenue_transaction_id: created.revenue_transaction_id,
          exception_type: providerFeeKnown ? 'provider_net_mismatch' : 'provider_fee_missing',
          severity: 'blocking',
          expected_value: {
            identity: 'gross = provider_net + provider_fee',
            gross_centavos: toSafeNumber(gross)
          },
          actual_value: {
            provider_fee_centavos: provider.providerFee,
            provider_net_centavos: provider.providerNet,
            provider_fee_source: provider.providerFeeSource
          },
          status: 'open',
          detected_at: new Date()
        }, { transaction });
      }

      return { posted: true, transaction: sanitizeTransaction(created) };
    });
  });

  const recordOrderFulfillment = wrap(async ({
    session,
    fulfillmentStatus,
    actor = 'pos_order_lifecycle'
  }) => {
    if (!tenantRevenueSharingEnabled) {
      return { updated: false, reason: 'tenant_revenue_sharing_disabled' };
    }
    if (!session?.session_id) {
      return { updated: false, reason: 'payment_session_missing' };
    }
    const normalizedStatus = String(fulfillmentStatus || '').trim().toLowerCase();
    if (!['completed', 'rejected', 'cancelled'].includes(normalizedStatus)) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Order fulfillment status is not settlement-relevant.'
      );
    }

    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const revenue = await tenantRevenueRepository.findRevenueTransactionBySession(
        session.session_id,
        { transaction, lock: true }
      );
      if (!revenue) {
        return { updated: false, reason: 'revenue_transaction_not_found' };
      }
      const advancedSettlementStatuses = new Set([
        'scheduled',
        'processing',
        'partially_settled',
        'settled'
      ]);
      const financialSnapshot = parseJsonObject(revenue.financial_snapshot);
      const policyStatus = financialSnapshot.policy?.settlement_status;
      const settlementCanOpen = normalizedStatus === 'completed'
        && policyStatus === 'active'
        && ['reconciled', 'approved_override'].includes(revenue.reconciliation_status)
        && ['paid', 'partially_refunded'].includes(revenue.payment_status);
      const expectedSettlementStatus = advancedSettlementStatuses.has(revenue.settlement_status)
        ? revenue.settlement_status
        : (settlementCanOpen ? 'pending' : 'on_hold');
      if (
        revenue.fulfillment_status === normalizedStatus
        && revenue.settlement_status === expectedSettlementStatus
      ) {
        return {
          updated: false,
          reason: 'already_recorded',
          transaction: sanitizeTransaction(revenue)
        };
      }
      const now = new Date();
      const updated = await tenantRevenueRepository.updateRevenueTransaction(
        revenue.revenue_transaction_id,
        {
          fulfillment_status: normalizedStatus,
          fulfilled_at: normalizedStatus === 'completed' ? now : null,
          fulfillment_updated_at: now,
          settlement_status: expectedSettlementStatus
        },
        { transaction, lock: true }
      );

      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantRevenueTransaction',
        entity_id: revenue.revenue_transaction_id,
        action: 'UPDATE',
        changes: {
          event: 'tenant_revenue_order_fulfillment_recorded',
          payment_session_id: session.public_reference || session.session_id,
          previous_fulfillment_status: revenue.fulfillment_status || 'pending',
          fulfillment_status: normalizedStatus,
          previous_settlement_status: revenue.settlement_status,
          settlement_status: updated.settlement_status,
          actor
        },
        user_agent: 'POS Order Lifecycle',
        user_id: null
      }, { transaction });

      return {
        updated: true,
        transaction: sanitizeTransaction(updated)
      };
    });
  });

  const recordSucceededRefund = wrap(async ({
    session,
    refund,
    actor = 'paymongo_webhook'
  }) => {
    if (!tenantRevenueSharingEnabled) return { posted: false, reason: 'tenant_revenue_sharing_disabled' };
    if (!session?.session_id || !refund?.refund_id) return { posted: false, reason: 'refund_context_missing' };

    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const revenue = await tenantRevenueRepository.findRevenueTransactionBySession(
        session.session_id,
        { transaction, lock: true }
      );
      if (!revenue) return { posted: false, reason: 'revenue_transaction_not_found' };

      const amount = toBigInt(refund.amount_centavos);
      const ledgerResult = await tenantRevenueRepository.createLedgerEntry({
        tenant_id: revenue.tenant_id,
        revenue_transaction_id: revenue.revenue_transaction_id,
        settlement_batch_id: null,
        payout_id: null,
        entry_type: 'refund',
        debit_account: 'tenant_payable',
        credit_account: 'paymongo_clearing',
        amount_centavos: toSafeNumber(amount),
        currency: revenue.currency,
        idempotency_key: `refund:${refund.provider_refund_id || refund.refund_id}`,
        reverses_ledger_entry_id: null,
        reason: 'PayMongo refund deducted from tenant payable.',
        metadata: {
          refund_id: refund.refund_id,
          provider_refund_id: refund.provider_refund_id || null
        },
        created_by: actor,
        approved_by: null
      }, { transaction });
      if (!ledgerResult.created) {
        return { posted: false, reason: 'already_posted', transaction: sanitizeTransaction(revenue) };
      }

      const previousRefund = toBigInt(revenue.refund_centavos);
      const grossAmount = toBigInt(revenue.gross_amount_centavos);
      const dgfyFee = toBigInt(revenue.dgfy_fee_centavos);
      const updatedRefund = previousRefund + amount;
      const fullyRefunded = updatedRefund >= grossAmount;
      const proportionalPlatformFee = (refundedAmount) => {
        if (grossAmount <= 0n || dgfyFee <= 0n) return 0n;
        const cappedRefund = refundedAmount > grossAmount ? grossAmount : refundedAmount;
        return (dgfyFee * cappedRefund + (grossAmount / 2n)) / grossAmount;
      };
      const platformFeeReversal = proportionalPlatformFee(updatedRefund)
        - proportionalPlatformFee(previousRefund);
      if (platformFeeReversal > 0n) {
        await tenantRevenueRepository.createLedgerEntry({
          tenant_id: revenue.tenant_id,
          revenue_transaction_id: revenue.revenue_transaction_id,
          settlement_batch_id: null,
          payout_id: null,
          entry_type: 'reversal',
          debit_account: 'dgfy_platform_revenue',
          credit_account: 'tenant_payable',
          amount_centavos: toSafeNumber(platformFeeReversal),
          currency: revenue.currency,
          idempotency_key: `platform-fee-refund:${refund.provider_refund_id || refund.refund_id}`,
          reverses_ledger_entry_id: null,
          reason: 'DGFY platform fee reversed proportionally after a successful PayMongo refund.',
          metadata: {
            refund_id: refund.refund_id,
            provider_refund_id: refund.provider_refund_id || null,
            refund_centavos: toSafeNumber(amount)
          },
          created_by: actor,
          approved_by: null
        }, { transaction });
      }
      const updatedPayable = toBigInt(revenue.tenant_net_payable_centavos)
        - amount
        + platformFeeReversal;
      const settlementItem = await tenantRevenueRepository.findSettlementItemByRevenueTransaction(
        revenue.revenue_transaction_id,
        { transaction, lock: true }
      );
      const wasPaidToTenant = revenue.settlement_status === 'settled'
        || settlementItem?.batch?.status === 'paid';
      const activeBatchMustHold = settlementItem?.batch
        && ['prepared', 'approved', 'scheduled', 'processing', 'partially_paid'].includes(
          settlementItem.batch.status
        );
      if (activeBatchMustHold) {
        await tenantRevenueRepository.updateSettlementBatch(
          settlementItem.batch.settlement_batch_id,
          { status: 'on_hold' },
          { transaction, lock: true }
        );
      }
      const updated = await tenantRevenueRepository.updateRevenueTransaction(
        revenue.revenue_transaction_id,
        {
          refund_centavos: toSafeNumber(updatedRefund),
          tenant_net_payable_centavos: toSafeNumber(updatedPayable),
          payment_status: fullyRefunded ? 'refunded' : 'partially_refunded',
          settlement_status: wasPaidToTenant
            ? 'settled'
            : (
              activeBatchMustHold
                ? 'on_hold'
                : (fullyRefunded ? 'reversed' : revenue.settlement_status)
            )
        },
        { transaction, lock: true }
      );

      if (wasPaidToTenant || activeBatchMustHold) {
        await tenantRevenueRepository.createReconciliationRecord({
          tenant_id: revenue.tenant_id,
          revenue_transaction_id: revenue.revenue_transaction_id,
          exception_type: 'refund_after_settlement_scheduling',
          severity: 'blocking',
          expected_value: { settlement_status: 'pending_or_eligible' },
          actual_value: {
            previous_settlement_status: revenue.settlement_status,
            previous_settlement_batch_status: settlementItem?.batch?.status || null,
            refund_centavos: toSafeNumber(amount)
          },
          status: 'open',
          detected_at: new Date()
        }, { transaction });
      }
      await tenantRevenueRepository.createReconciliationRecord({
        tenant_id: revenue.tenant_id,
        revenue_transaction_id: revenue.revenue_transaction_id,
        exception_type: 'refund_provider_fee_treatment_unconfirmed',
        severity: 'warning',
        expected_value: { provider_fee_refund_status: 'confirmed_from_provider' },
        actual_value: { provider_fee_refund_status: 'unknown' },
        status: 'open',
        detected_at: new Date()
      }, { transaction });
      return { posted: true, transaction: sanitizeTransaction(updated) };
    });
  });

  const recordChargeback = wrap(async ({
    session,
    resource,
    providerEventId,
    actor = 'paymongo_webhook'
  }) => {
    if (!tenantRevenueSharingEnabled) return { posted: false, reason: 'tenant_revenue_sharing_disabled' };
    if (!session?.session_id) return { posted: false, reason: 'chargeback_context_missing' };
    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const revenue = await tenantRevenueRepository.findRevenueTransactionBySession(
        session.session_id,
        { transaction, lock: true }
      );
      if (!revenue) return { posted: false, reason: 'revenue_transaction_not_found' };
      const attrs = getAttributes(resource);
      const amount = toBigInt(firstInteger(attrs.amount, attrs.disputed_amount, revenue.gross_amount_centavos));
      const chargebackReference = String(
        resource?.id
        || attrs.chargeback_id
        || attrs.dispute_id
        || providerEventId
        || ''
      ).trim();
      if (!chargebackReference || amount <= 0n) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Chargeback reference or amount is invalid.');
      }
      const ledgerResult = await tenantRevenueRepository.createLedgerEntry({
        tenant_id: revenue.tenant_id,
        revenue_transaction_id: revenue.revenue_transaction_id,
        settlement_batch_id: null,
        payout_id: null,
        entry_type: 'chargeback',
        debit_account: 'tenant_payable',
        credit_account: 'paymongo_clearing',
        amount_centavos: toSafeNumber(amount),
        currency: revenue.currency,
        idempotency_key: `chargeback:${chargebackReference}`,
        reverses_ledger_entry_id: null,
        reason: 'Provider chargeback deducted from tenant payable.',
        metadata: { provider_event_id: providerEventId || null, chargeback_reference: chargebackReference },
        created_by: actor,
        approved_by: null
      }, { transaction });
      if (!ledgerResult.created) {
        return { posted: false, reason: 'already_posted', transaction: sanitizeTransaction(revenue) };
      }
      const updatedChargeback = toBigInt(revenue.chargeback_centavos) + amount;
      const updatedPayable = toBigInt(revenue.tenant_net_payable_centavos) - amount;
      const settlementItem = await tenantRevenueRepository.findSettlementItemByRevenueTransaction(
        revenue.revenue_transaction_id,
        { transaction, lock: true }
      );
      const wasPaidToTenant = revenue.settlement_status === 'settled'
        || settlementItem?.batch?.status === 'paid';
      const activeBatchMustHold = settlementItem?.batch
        && ['prepared', 'approved', 'scheduled', 'processing', 'partially_paid'].includes(
          settlementItem.batch.status
        );
      if (activeBatchMustHold) {
        await tenantRevenueRepository.updateSettlementBatch(
          settlementItem.batch.settlement_batch_id,
          { status: 'on_hold' },
          { transaction, lock: true }
        );
      }
      const updated = await tenantRevenueRepository.updateRevenueTransaction(
        revenue.revenue_transaction_id,
        {
          chargeback_centavos: toSafeNumber(updatedChargeback),
          tenant_net_payable_centavos: toSafeNumber(updatedPayable),
          payment_status: 'chargeback',
          reconciliation_status: 'exception',
          settlement_status: wasPaidToTenant
            ? 'settled'
            : (activeBatchMustHold ? 'on_hold' : revenue.settlement_status)
        },
        { transaction, lock: true }
      );
      await tenantRevenueRepository.createReconciliationRecord({
        tenant_id: revenue.tenant_id,
        revenue_transaction_id: revenue.revenue_transaction_id,
        exception_type: 'provider_chargeback',
        severity: 'blocking',
        expected_value: { action: 'review_and_deduct_from_unsettled_or_next_settlement' },
        actual_value: {
          chargeback_reference: chargebackReference,
          amount_centavos: toSafeNumber(amount),
          previous_settlement_status: revenue.settlement_status,
          previous_settlement_batch_status: settlementItem?.batch?.status || null,
          carry_forward_required: wasPaidToTenant
        },
        status: 'open',
        detected_at: new Date()
      }, { transaction });
      return { posted: true, transaction: sanitizeTransaction(updated) };
    });
  });

  const requestAdjustment = wrap(async ({ payload, actor }) => {
    const requestedBy = requireActor(actor);
    const tenantId = String(payload.tenant_id || '').trim();
    const revenueTransactionId = String(payload.revenue_transaction_id || '').trim();
    const idempotencyKey = String(payload.idempotency_key || '').trim();
    const amount = toBigInt(payload.amount_centavos);
    const reason = requireReason(payload.reason, 'Adjustment reason');
    if (!tenantId || !revenueTransactionId) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Tenant and revenue transaction are required.');
    }
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 180) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid adjustment idempotency key is required.');
    }
    if (amount === 0n) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Adjustment amount cannot be zero.');
    }
    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const existing = await tenantRevenueRepository.findAdjustmentByIdempotency(idempotencyKey, {
        transaction,
        lock: true
      });
      if (existing) return { adjustment: existing, idempotent_replay: true };
      const revenue = await tenantRevenueRepository.findRevenueTransactionById(
        revenueTransactionId,
        { transaction, lock: true }
      );
      if (!revenue || String(revenue.tenant_id) !== tenantId) {
        throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Revenue transaction was not found for this tenant.');
      }
      const adjustment = await tenantRevenueRepository.createAdjustment({
        tenant_id: tenantId,
        revenue_transaction_id: revenueTransactionId,
        amount_centavos: toSafeNumber(amount, 'adjustment amount'),
        reason,
        status: 'pending',
        idempotency_key: idempotencyKey,
        requested_by: requestedBy,
        approved_by: null,
        approval_reason: null,
        approved_at: null
      }, { transaction });
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantRevenueAdjustment',
        entity_id: adjustment.adjustment_id,
        action: 'CREATE',
        changes: {
          event: 'tenant_revenue_adjustment_requested',
          tenant_id: tenantId,
          revenue_transaction_id: revenueTransactionId,
          amount_centavos: toSafeNumber(amount),
          requested_by: requestedBy,
          reason
        }
      }, { transaction });
      return { adjustment, idempotent_replay: false };
    });
  });

  const approveAdjustment = wrap(async ({ adjustmentId, payload, actor }) => {
    const approvedBy = requireActor(actor);
    const approvalReason = requireReason(payload.reason, 'Approval reason');
    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const adjustment = await tenantRevenueRepository.findAdjustmentById(adjustmentId, {
        transaction,
        lock: true
      });
      if (!adjustment) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Adjustment not found.');
      if (adjustment.status === 'posted') return { adjustment, idempotent_replay: true };
      if (adjustment.status !== 'pending') {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Only pending adjustments can be approved.');
      }
      if (String(adjustment.requested_by).toLowerCase() === approvedBy.toLowerCase()) {
        throw new DomainError(
          DomainErrorCode.AUTHORIZATION_FAILED,
          'The requester cannot approve the same financial adjustment.'
        );
      }
      const revenue = await tenantRevenueRepository.findRevenueTransactionById(
        adjustment.revenue_transaction_id,
        { transaction, lock: true }
      );
      if (!revenue) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Revenue transaction not found.');
      const amount = toBigInt(adjustment.amount_centavos);
      const absoluteAmount = amount < 0n ? -amount : amount;
      await tenantRevenueRepository.createLedgerEntry({
        tenant_id: adjustment.tenant_id,
        revenue_transaction_id: adjustment.revenue_transaction_id,
        settlement_batch_id: null,
        payout_id: null,
        entry_type: 'adjustment',
        debit_account: amount > 0n ? 'tenant_adjustment_expense' : 'tenant_payable',
        credit_account: amount > 0n ? 'tenant_payable' : 'tenant_adjustment_recovery',
        amount_centavos: toSafeNumber(absoluteAmount),
        currency: revenue.currency,
        idempotency_key: `adjustment-posted:${adjustment.adjustment_id}`,
        reverses_ledger_entry_id: null,
        reason: adjustment.reason,
        metadata: { approval_reason: approvalReason },
        created_by: adjustment.requested_by,
        approved_by: approvedBy
      }, { transaction });
      const updatedAdjustmentTotal = toBigInt(revenue.adjustment_centavos) + amount;
      const updatedPayable = toBigInt(revenue.tenant_net_payable_centavos) + amount;
      const settlementItem = await tenantRevenueRepository.findSettlementItemByRevenueTransaction(
        revenue.revenue_transaction_id,
        { transaction, lock: true }
      );
      const wasPaidToTenant = revenue.settlement_status === 'settled'
        || settlementItem?.batch?.status === 'paid';
      const activeBatchMustHold = settlementItem?.batch
        && ['prepared', 'approved', 'scheduled', 'processing', 'partially_paid'].includes(
          settlementItem.batch.status
        );
      if (activeBatchMustHold) {
        await tenantRevenueRepository.updateSettlementBatch(
          settlementItem.batch.settlement_batch_id,
          { status: 'on_hold' },
          { transaction, lock: true }
        );
      }
      await tenantRevenueRepository.updateRevenueTransaction(
        revenue.revenue_transaction_id,
        {
          adjustment_centavos: toSafeNumber(updatedAdjustmentTotal),
          tenant_net_payable_centavos: toSafeNumber(updatedPayable),
          settlement_status: wasPaidToTenant
            ? 'settled'
            : (activeBatchMustHold ? 'on_hold' : revenue.settlement_status)
        },
        { transaction, lock: true }
      );
      const posted = await tenantRevenueRepository.updateAdjustment(adjustmentId, {
        status: 'posted',
        approved_by: approvedBy,
        approval_reason: approvalReason,
        approved_at: new Date()
      }, { transaction, lock: true });
      if (wasPaidToTenant || activeBatchMustHold) {
        await tenantRevenueRepository.createReconciliationRecord({
          tenant_id: adjustment.tenant_id,
          revenue_transaction_id: revenue.revenue_transaction_id,
          exception_type: 'adjustment_after_settlement_scheduling',
          severity: 'blocking',
          expected_value: { action: 'deduct_or_add_to_next_settlement' },
          actual_value: {
            previous_settlement_status: revenue.settlement_status,
            previous_settlement_batch_status: settlementItem?.batch?.status || null,
            carry_forward_required: wasPaidToTenant,
            adjustment_centavos: toSafeNumber(amount)
          },
          status: 'open',
          detected_at: new Date()
        }, { transaction });
      }
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantRevenueAdjustment',
        entity_id: adjustmentId,
        action: 'UPDATE',
        changes: {
          event: 'tenant_revenue_adjustment_approved_and_posted',
          old_status: adjustment.status,
          new_status: 'posted',
          requested_by: adjustment.requested_by,
          approved_by: approvedBy,
          reason: approvalReason
        }
      }, { transaction });
      return { adjustment: posted, idempotent_replay: false };
    });
  });

  const listAdjustments = wrap(async ({ query = {} }) => ({
    adjustments: await tenantRevenueRepository.listAdjustments({
      tenantId: query.tenant_id || null,
      status: query.status || null
    }, { limit: Math.min(500, Number.parseInt(query.limit || 200, 10)) })
  }));

  const reconcileProviderFinancials = wrap(async ({ payload, actor }) => {
    const reconciledBy = requireActor(actor);
    const statementReference = String(payload.statement_reference || '').trim();
    const source = String(payload.source || 'statement').trim();
    if (statementReference.length < 3 || statementReference.length > 160) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A provider statement or API reference is required.');
    }
    const results = [];
    for (const row of payload.rows || []) {
      const result = await tenantRevenueRepository.runInTransaction(async (transaction) => {
        const revenue = await tenantRevenueRepository.findRevenueTransactionByProviderPayment(
          row.provider_payment_id,
          { transaction, lock: true }
        );
        if (!revenue) {
          if (!payload.tenant_id) {
            return { provider_payment_id: row.provider_payment_id, status: 'missing_internal_payment' };
          }
          await tenantRevenueRepository.createReconciliationRecord({
            tenant_id: payload.tenant_id,
            revenue_transaction_id: null,
            exception_type: 'provider_payment_missing_internal',
            severity: 'blocking',
            expected_value: { internal_transaction: 'present' },
            actual_value: {
              provider_payment_id: row.provider_payment_id,
              statement_reference: statementReference
            },
            status: 'open',
            detected_at: new Date()
          }, { transaction });
          return { provider_payment_id: row.provider_payment_id, status: 'missing_internal_payment' };
        }

        const gross = toBigInt(row.gross_amount_centavos);
        const fee = toBigInt(row.provider_fee_centavos);
        const net = toBigInt(row.provider_net_centavos);
        const grossMatches = gross === toBigInt(revenue.gross_amount_centavos);
        const identityMatches = net + fee === gross;
        if (!grossMatches || !identityMatches) {
          await tenantRevenueRepository.createReconciliationRecord({
            tenant_id: revenue.tenant_id,
            revenue_transaction_id: revenue.revenue_transaction_id,
            exception_type: grossMatches ? 'provider_net_mismatch' : 'provider_gross_mismatch',
            severity: 'blocking',
            expected_value: {
              internal_gross_centavos: toSafeNumber(revenue.gross_amount_centavos),
              identity: 'gross = fee + net'
            },
            actual_value: {
              statement_reference: statementReference,
              provider_gross_centavos: toSafeNumber(gross),
              provider_fee_centavos: toSafeNumber(fee),
              provider_net_centavos: toSafeNumber(net)
            },
            status: 'open',
            detected_at: new Date()
          }, { transaction });
          await tenantRevenueRepository.updateRevenueTransaction(
            revenue.revenue_transaction_id,
            { reconciliation_status: 'exception', settlement_status: 'on_hold' },
            { transaction, lock: true }
          );
          return { provider_payment_id: row.provider_payment_id, status: 'mismatch' };
        }

        const policy = revenue.financial_snapshot?.policy || {
          dgfy_rate_bps: revenue.dgfy_rate_bps,
          provider_fee_payer: 'tenant',
          shared_fee_tenant_bps: null
        };
        const allocation = allocateProviderFee({ providerFeeCentavos: fee, policy });
        const oldTenantFee = toBigInt(revenue.tenant_provider_fee_centavos);
        const oldDgfyFee = toBigInt(revenue.dgfy_provider_fee_centavos);
        const tenantDelta = allocation.tenant - oldTenantFee;
        const dgfyDelta = allocation.dgfy - oldDgfyFee;
        const ledgerBase = {
          tenant_id: revenue.tenant_id,
          revenue_transaction_id: revenue.revenue_transaction_id,
          settlement_batch_id: null,
          payout_id: null,
          entry_type: 'adjustment',
          currency: revenue.currency,
          reverses_ledger_entry_id: null,
          created_by: reconciledBy,
          approved_by: reconciledBy
        };
        if (tenantDelta !== 0n) {
          await tenantRevenueRepository.createLedgerEntry({
            ...ledgerBase,
            debit_account: tenantDelta > 0n ? 'tenant_payable' : 'paymongo_fee_clearing',
            credit_account: tenantDelta > 0n ? 'paymongo_fee_clearing' : 'tenant_payable',
            amount_centavos: toSafeNumber(tenantDelta < 0n ? -tenantDelta : tenantDelta),
            idempotency_key: `provider-reconciliation:tenant:${statementReference}:${row.provider_payment_id}`,
            reason: 'Provider statement corrected the tenant share of processing fees.',
            metadata: { statement_reference: statementReference, source }
          }, { transaction });
        }
        if (dgfyDelta !== 0n) {
          await tenantRevenueRepository.createLedgerEntry({
            ...ledgerBase,
            debit_account: dgfyDelta > 0n ? 'paymongo_fee_expense' : 'paymongo_fee_clearing',
            credit_account: dgfyDelta > 0n ? 'paymongo_fee_clearing' : 'paymongo_fee_expense',
            amount_centavos: toSafeNumber(dgfyDelta < 0n ? -dgfyDelta : dgfyDelta),
            idempotency_key: `provider-reconciliation:dgfy:${statementReference}:${row.provider_payment_id}`,
            reason: 'Provider statement corrected the DGFY share of processing fees.',
            metadata: { statement_reference: statementReference, source }
          }, { transaction });
        }
        const payable = toBigInt(revenue.tenant_net_payable_centavos) - tenantDelta;
        const updated = await tenantRevenueRepository.updateRevenueTransaction(
          revenue.revenue_transaction_id,
          {
            provider_fee_centavos: toSafeNumber(fee),
            provider_fee_vat_centavos: row.provider_fee_vat_centavos ?? revenue.provider_fee_vat_centavos,
            provider_net_centavos: toSafeNumber(net),
            provider_balance_transaction_id: row.provider_balance_transaction_id
              || revenue.provider_balance_transaction_id,
            provider_fee_source: source,
            tenant_provider_fee_centavos: toSafeNumber(allocation.tenant),
            dgfy_provider_fee_centavos: toSafeNumber(allocation.dgfy),
            tenant_net_payable_centavos: toSafeNumber(payable),
            reconciliation_status: 'reconciled',
            settlement_status: revenue.settlement_status === 'on_hold'
              && policy.settlement_status === 'active'
              ? 'pending'
              : revenue.settlement_status,
            financial_snapshot: {
              ...parseJsonObject(revenue.financial_snapshot),
              provider_reconciliation: {
                statement_reference: statementReference,
                source,
                reconciled_at: new Date().toISOString(),
                reconciled_by: reconciledBy
              }
            }
          },
          { transaction, lock: true }
        );
        const openRecords = await tenantRevenueRepository.listReconciliationRecords({
          revenueTransactionId: revenue.revenue_transaction_id,
          status: 'open'
        }, { transaction, limit: 200 });
        for (const record of openRecords.filter((entry) => [
          'provider_fee_missing',
          'provider_net_mismatch',
          'provider_gross_mismatch'
        ].includes(entry.exception_type))) {
          await tenantRevenueRepository.updateReconciliationRecord(
            record.reconciliation_id,
            {
              status: 'resolved',
              resolution_reason: `Reconciled from ${source} ${statementReference}.`,
              resolved_at: new Date(),
              resolved_by: reconciledBy
            },
            { transaction, lock: true }
          );
        }
        await tenantRevenueRepository.createAuditLog({
          entity_type: 'TenantRevenueTransaction',
          entity_id: revenue.revenue_transaction_id,
          action: 'UPDATE',
          changes: {
            event: 'tenant_revenue_provider_financials_reconciled',
            statement_reference: statementReference,
            source,
            old_provider_fee_centavos: revenue.provider_fee_centavos,
            new_provider_fee_centavos: toSafeNumber(fee),
            reconciled_by: reconciledBy
          }
        }, { transaction });
        return {
          provider_payment_id: row.provider_payment_id,
          status: 'reconciled',
          transaction: sanitizeTransaction(updated)
        };
      });
      results.push(result);
    }
    return {
      statement_reference: statementReference,
      source,
      processed: results.length,
      reconciled: results.filter((entry) => entry.status === 'reconciled').length,
      exceptions: results.filter((entry) => entry.status !== 'reconciled').length,
      results
    };
  });

  const listTransactions = wrap(async ({ query = {} }) => {
    const limit = Math.min(500, Math.max(1, Number.parseInt(query.limit || 100, 10)));
    const offset = Math.max(0, Number.parseInt(query.offset || 0, 10));
    const filters = {
      tenantId: query.tenant_id || null,
      status: query.payment_status || null,
      reconciliationStatus: query.reconciliation_status || null,
      settlementStatus: query.settlement_status || null,
      companyId: query.company_id || null,
      branchId: query.branch_id || null,
      paymentMethod: query.payment_method
        ? normalizePaymentMethod(query.payment_method)
        : null,
      providerPaymentId: query.provider_payment_id || null,
      settlementReference: query.settlement_reference || null,
      periodStart: query.period_start ? requireDate(query.period_start, 'Period start') : null,
      periodEnd: query.period_end ? requireDate(query.period_end, 'Period end') : null
    };
    const [rows, total] = await Promise.all([
      tenantRevenueRepository.listRevenueTransactions(filters, { limit, offset }),
      tenantRevenueRepository.countRevenueTransactions(filters)
    ]);
    return {
      transactions: rows.map(sanitizeTransaction),
      pagination: { total, limit, offset }
    };
  });

  const getDashboard = wrap(async ({ query = {} }) => {
    const filters = {
      tenantId: query.tenant_id || null,
      companyId: query.company_id || null,
      branchId: query.branch_id || null,
      paymentMethod: query.payment_method
        ? normalizePaymentMethod(query.payment_method)
        : null,
      providerPaymentId: query.provider_payment_id || null,
      settlementReference: query.settlement_reference || null,
      status: query.payment_status || null,
      settlementStatus: query.settlement_status || null,
      periodStart: query.period_start ? requireDate(query.period_start, 'Period start') : null,
      periodEnd: query.period_end ? requireDate(query.period_end, 'Period end') : null
    };
    const [transactions, batches, payouts, exceptions] = await Promise.all([
      tenantRevenueRepository.listRevenueTransactions(filters, { limit: 10000 }),
      tenantRevenueRepository.listSettlementBatches({ tenantId: filters.tenantId }, { limit: 200 }),
      tenantRevenueRepository.listPayouts({ tenantId: filters.tenantId }, { limit: 200 }),
      tenantRevenueRepository.listReconciliationRecords({
        tenantId: filters.tenantId,
        status: 'open'
      }, { limit: 200 })
    ]);
    const totals = transactions.reduce((summary, row) => {
      summary.gross_centavos += toBigInt(row.gross_amount_centavos);
      summary.provider_fee_centavos += toBigInt(row.provider_fee_centavos);
      summary.provider_fee_vat_centavos += toBigInt(row.provider_fee_vat_centavos);
      summary.dgfy_fee_centavos += toBigInt(row.dgfy_fee_centavos);
      summary.refund_centavos += toBigInt(row.refund_centavos);
      summary.chargeback_centavos += toBigInt(row.chargeback_centavos);
      summary.adjustment_centavos += toBigInt(row.adjustment_centavos);
      summary.tenant_payable_centavos += toBigInt(row.tenant_net_payable_centavos);
      if (row.settlement_status === 'settled') {
        summary.settled_centavos += toBigInt(row.tenant_net_payable_centavos);
      } else {
        summary.unsettled_centavos += toBigInt(row.tenant_net_payable_centavos);
        const isAvailable = ['reconciled', 'approved_override'].includes(row.reconciliation_status)
          && row.fulfillment_status === 'completed'
          && ['pending', 'eligible'].includes(row.settlement_status)
          && new Date(row.eligibility_at) <= new Date();
        if (isAvailable) {
          summary.available_centavos += toBigInt(row.tenant_net_payable_centavos);
        } else {
          summary.pending_centavos += toBigInt(row.tenant_net_payable_centavos);
        }
      }
      return summary;
    }, {
      gross_centavos: 0n,
      provider_fee_centavos: 0n,
      provider_fee_vat_centavos: 0n,
      dgfy_fee_centavos: 0n,
      refund_centavos: 0n,
      chargeback_centavos: 0n,
      adjustment_centavos: 0n,
      tenant_payable_centavos: 0n,
      settled_centavos: 0n,
      unsettled_centavos: 0n,
      available_centavos: 0n,
      pending_centavos: 0n
    });
    const unsettledEligibilityDates = transactions
      .filter((row) => row.settlement_status !== 'settled')
      .map((row) => new Date(row.eligibility_at))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((left, right) => left - right);
    const completedSettlementDates = batches
      .filter((batch) => batch.status === 'paid' && batch.actual_payout_at)
      .map((batch) => new Date(batch.actual_payout_at))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((left, right) => right - left);
    return {
      feature: {
        enabled: tenantRevenueSharingEnabled,
        collection_model: 'dgfy_collects_then_settles_tenant',
        split_payment_used: false,
        automatic_payout_available: canUseAutomaticTenantPayouts
      },
      totals: Object.fromEntries(
        Object.entries(totals).map(([key, value]) => [key, toSafeNumber(value, key)])
      ),
      counts: {
        transactions: transactions.length,
        successful_transactions: transactions.filter((row) => [
          'paid',
          'partially_refunded',
          'refunded'
        ].includes(row.payment_status)).length,
        open_exceptions: exceptions.length,
        settlement_batches: batches.length,
        payouts: payouts.length
      },
      recent_transactions: transactions.slice(0, 20).map(sanitizeTransaction),
      recent_batches: batches.slice(0, 20),
      recent_payouts: payouts.slice(0, 20),
      open_exceptions: exceptions.slice(0, 20),
      schedule: {
        next_settlement_date: unsettledEligibilityDates[0]?.toISOString() || null,
        last_settlement_date: completedSettlementDates[0]?.toISOString() || null
      }
    };
  });

  const createSettlementBatch = wrap(async ({ payload, actor }) => {
    const preparedBy = requireActor(actor);
    const tenantId = String(payload.tenant_id || '').trim();
    const periodStart = requireDate(payload.period_start, 'Period start');
    const periodEnd = requireDate(payload.period_end, 'Period end');
    if (!tenantId) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Tenant is required.');
    if (periodEnd < periodStart) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Period end must be after period start.');
    }

    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const tenant = await tenantRevenueRepository.findTenantById(tenantId, { transaction });
      if (!tenant) throw new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found.');
      const policy = await tenantRevenueRepository.findEffectiveFeePolicy(
        tenantId,
        periodEnd,
        { transaction, lock: true }
      );
      if (!policy || policy.settlement_status !== 'active') {
        throw new DomainError(
          DomainErrorCode.CONFLICT,
          'Tenant settlement is not active or has no effective fee policy.'
        );
      }
      if (!policy.payout_destination_masked) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Tenant payout destination is not configured.');
      }

      const [rows, carryforwardEntries] = await Promise.all([
        tenantRevenueRepository.listEligibleUnbatchedTransactions({
          tenantId,
          periodStart,
          periodEnd,
          now: new Date()
        }, { transaction, lock: true }),
        tenantRevenueRepository.listEligibleCarryforwardLedgerEntries(
          { tenantId },
          { transaction, lock: true }
        )
      ]);
      if (!rows.length && !carryforwardEntries.length) {
        throw new DomainError(
          DomainErrorCode.CONFLICT,
          'No reconciled, eligible transactions or carry-forward corrections are available.'
        );
      }

      const totals = rows.reduce((summary, row) => {
        summary.gross += toBigInt(row.gross_amount_centavos);
        summary.providerFee += toBigInt(row.provider_fee_centavos);
        summary.dgfyFee += toBigInt(row.dgfy_fee_centavos);
        summary.refund += toBigInt(row.refund_centavos);
        summary.chargeback += toBigInt(row.chargeback_centavos);
        summary.adjustment += toBigInt(row.adjustment_centavos);
        summary.payout += toBigInt(row.tenant_net_payable_centavos);
        return summary;
      }, {
        gross: 0n,
        providerFee: 0n,
        dgfyFee: 0n,
        refund: 0n,
        chargeback: 0n,
        adjustment: 0n,
        payout: 0n
      });
      const carryforwardItems = carryforwardEntries.map((entry) => {
        const amount = toBigInt(entry.amount_centavos);
        let signedAdjustment;
        if (entry.entry_type === 'refund') {
          totals.refund += amount;
          signedAdjustment = -amount;
        } else if (entry.entry_type === 'chargeback') {
          totals.chargeback += amount;
          signedAdjustment = -amount;
        } else if (entry.credit_account === 'tenant_payable') {
          totals.adjustment += amount;
          signedAdjustment = amount;
        } else {
          totals.adjustment -= amount;
          signedAdjustment = -amount;
        }
        totals.payout += signedAdjustment;
        return {
          ledger_entry_id: entry.ledger_entry_id,
          included_adjustment_centavos: toSafeNumber(signedAdjustment)
        };
      });
      if (totals.payout <= 0n) {
        throw new DomainError(
          DomainErrorCode.CONFLICT,
          'Carry-forward deductions exceed the eligible tenant payable. Hold them for a future positive settlement.'
        );
      }
      if (totals.payout < toBigInt(policy.minimum_payout_centavos)) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Eligible payable is below the tenant minimum payout amount.');
      }

      const batch = await tenantRevenueRepository.createSettlementBatch({
        batch_number: makeReference('SET'),
        tenant_id: tenantId,
        period_start: periodStart,
        period_end: periodEnd,
        currency: 'PHP',
        gross_centavos: toSafeNumber(totals.gross),
        provider_fee_centavos: toSafeNumber(totals.providerFee),
        dgfy_fee_centavos: toSafeNumber(totals.dgfyFee),
        refund_centavos: toSafeNumber(totals.refund),
        chargeback_centavos: toSafeNumber(totals.chargeback),
        adjustment_centavos: toSafeNumber(totals.adjustment),
        payout_centavos: toSafeNumber(totals.payout),
        scheduled_payout_at: null,
        actual_payout_at: null,
        payout_destination_masked: policy.payout_destination_masked,
        status: 'prepared',
        prepared_by: preparedBy,
        approved_by: null,
        approved_at: null,
        approval_reason: null
      }, { transaction });
      await tenantRevenueRepository.createSettlementBatchItems(rows.map((row) => ({
        settlement_batch_id: batch.settlement_batch_id,
        revenue_transaction_id: row.revenue_transaction_id,
        included_payable_centavos: toSafeNumber(row.tenant_net_payable_centavos)
      })), { transaction });
      await tenantRevenueRepository.createSettlementBatchLedgerItems(carryforwardItems.map((entry) => ({
        settlement_batch_id: batch.settlement_batch_id,
        ...entry
      })), { transaction });
      await Promise.all(rows.map((row) => tenantRevenueRepository.updateRevenueTransaction(
        row.revenue_transaction_id,
        { settlement_status: 'scheduled', approved_by: null },
        { transaction, lock: true }
      )));
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantSettlementBatch',
        entity_id: batch.settlement_batch_id,
        action: 'CREATE',
        changes: {
          event: 'tenant_settlement_batch_prepared',
          tenant_id: tenantId,
          transaction_count: rows.length,
          carryforward_entry_count: carryforwardItems.length,
          payout_centavos: toSafeNumber(totals.payout),
          prepared_by: preparedBy
        }
      }, { transaction });
      return {
        batch: {
          ...batch,
          transaction_count: rows.length,
          carryforward_entry_count: carryforwardItems.length
        }
      };
    });
  });

  const listSettlementBatches = wrap(async ({ query = {} }) => ({
    batches: await tenantRevenueRepository.listSettlementBatches({
      tenantId: query.tenant_id || null,
      status: query.status || null
    }, { limit: Math.min(500, Number.parseInt(query.limit || 100, 10)) })
  }));

  const approveSettlementBatch = wrap(async ({ settlementBatchId, payload, actor }) => {
    const approvedBy = requireActor(actor);
    const reason = requireReason(payload.reason, 'Approval reason');
    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const batch = await tenantRevenueRepository.findSettlementBatchById(settlementBatchId, {
        transaction,
        lock: true
      });
      if (!batch) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Settlement batch not found.');
      if (batch.status !== 'prepared') {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Only prepared settlement batches can be approved.');
      }
      if (String(batch.prepared_by).toLowerCase() === approvedBy.toLowerCase()) {
        throw new DomainError(
          DomainErrorCode.AUTHORIZATION_FAILED,
          'The preparer cannot approve the same settlement batch.'
        );
      }
      const updated = await tenantRevenueRepository.updateSettlementBatch(settlementBatchId, {
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date(),
        approval_reason: reason
      }, { transaction, lock: true });
      for (const item of batch.items || []) {
        await tenantRevenueRepository.updateRevenueTransaction(
          item.revenue_transaction_id,
          { approved_by: approvedBy },
          { transaction, lock: true }
        );
      }
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantSettlementBatch',
        entity_id: settlementBatchId,
        action: 'UPDATE',
        changes: {
          event: 'tenant_settlement_batch_approved',
          prepared_by: batch.prepared_by,
          approved_by: approvedBy,
          reason
        }
      }, { transaction });
      return { batch: updated };
    });
  });

  const scheduleSettlementBatch = wrap(async ({ settlementBatchId, payload, actor }) => {
    const scheduledBy = requireActor(actor);
    const reason = requireReason(payload.reason, 'Schedule override reason');
    const scheduledPayoutAt = requireDate(payload.scheduled_payout_at, 'Scheduled payout date');
    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const batch = await tenantRevenueRepository.findSettlementBatchById(settlementBatchId, {
        transaction,
        lock: true
      });
      if (!batch) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Settlement batch not found.');
      if (!['approved', 'scheduled'].includes(batch.status)) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Only approved settlement batches can receive a payout date override.');
      }
      if (!batch.approved_by || String(batch.prepared_by).toLowerCase() === String(batch.approved_by).toLowerCase()) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Maker-checker approval is required before scheduling payout.');
      }
      const updated = await tenantRevenueRepository.updateSettlementBatch(settlementBatchId, {
        status: 'scheduled',
        scheduled_payout_at: scheduledPayoutAt,
        approval_reason: `${batch.approval_reason || ''}\nSchedule override: ${reason}`.trim()
      }, { transaction, lock: true });
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantSettlementBatch',
        entity_id: settlementBatchId,
        action: 'UPDATE',
        changes: {
          event: 'tenant_settlement_custom_date_scheduled',
          old_scheduled_payout_at: batch.scheduled_payout_at || null,
          new_scheduled_payout_at: scheduledPayoutAt,
          scheduled_by: scheduledBy,
          reason
        }
      }, { transaction });
      return { batch: updated };
    });
  });

  const cancelSettlementBatch = wrap(async ({ settlementBatchId, payload, actor }) => {
    const cancelledBy = requireActor(actor);
    const reason = requireReason(payload.reason, 'Cancellation reason');
    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const batch = await tenantRevenueRepository.findSettlementBatchById(settlementBatchId, {
        transaction,
        lock: true
      });
      if (!batch) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Settlement batch not found.');
      if (!['draft', 'prepared', 'on_hold'].includes(batch.status)) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Only draft, prepared, or held batches can be cancelled.');
      }
      const payouts = await tenantRevenueRepository.listPayouts(
        { settlementBatchId },
        { transaction, limit: 100 }
      );
      if (payouts.some((payout) => !['failed', 'reversed'].includes(payout.status))) {
        throw new DomainError(
          DomainErrorCode.CONFLICT,
          'This held settlement has an active or completed payout record and cannot be cancelled.'
        );
      }
      for (const item of batch.items || []) {
        await tenantRevenueRepository.updateRevenueTransaction(
          item.revenue_transaction_id,
          {
            settlement_status: item.revenueTransaction?.reconciliation_status === 'exception'
              ? 'on_hold'
              : 'eligible'
          },
          { transaction, lock: true }
        );
      }
      await tenantRevenueRepository.deleteSettlementBatchItems(settlementBatchId, { transaction });
      await tenantRevenueRepository.deleteSettlementBatchLedgerItems(settlementBatchId, { transaction });
      const updated = await tenantRevenueRepository.updateSettlementBatch(settlementBatchId, {
        status: 'cancelled',
        approval_reason: reason
      }, { transaction, lock: true });
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantSettlementBatch',
        entity_id: settlementBatchId,
        action: 'UPDATE',
        changes: { event: 'tenant_settlement_batch_cancelled', cancelled_by: cancelledBy, reason }
      }, { transaction });
      return { batch: updated };
    });
  });

  const createManualPayout = wrap(async ({ settlementBatchId, payload, actor }) => {
    const initiatedBy = requireActor(actor);
    const method = String(payload.method || 'manual_bank');
    if (!['manual_bank', 'manual_paymongo'].includes(method)) {
      throw new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        'Provider API payouts are not enabled. Use a manual payout method.'
      );
    }
    const idempotencyKey = String(payload.idempotency_key || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 180) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid payout idempotency key is required.');
    }

    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const existing = await tenantRevenueRepository.findPayoutByIdempotency(idempotencyKey, {
        transaction,
        lock: true
      });
      if (existing) return { payout: existing, idempotent_replay: true };
      const batch = await tenantRevenueRepository.findSettlementBatchById(settlementBatchId, {
        transaction,
        lock: true
      });
      if (!batch) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Settlement batch not found.');
      if (!['approved', 'scheduled'].includes(batch.status)) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Settlement batch must be approved before payout.');
      }
      if (!batch.approved_by || String(batch.prepared_by).toLowerCase() === String(batch.approved_by).toLowerCase()) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Settlement batch maker-checker approval is incomplete.');
      }
      const payout = await tenantRevenueRepository.createPayout({
        public_reference: makeReference('PAY'),
        settlement_batch_id: batch.settlement_batch_id,
        tenant_id: batch.tenant_id,
        amount_centavos: toSafeNumber(batch.payout_centavos),
        currency: batch.currency,
        method,
        provider_reference: payload.provider_reference || null,
        destination_masked: batch.payout_destination_masked,
        proof_reference: payload.proof_reference || null,
        status: 'approved',
        idempotency_key: idempotencyKey,
        initiated_by: initiatedBy,
        approved_by: batch.approved_by,
        confirmed_by: null,
        failure_reason: null,
        confirmed_at: null
      }, { transaction });
      await tenantRevenueRepository.updateSettlementBatch(settlementBatchId, {
        status: 'processing',
        scheduled_payout_at: new Date()
      }, { transaction, lock: true });
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantPayout',
        entity_id: payout.payout_id,
        action: 'CREATE',
        changes: {
          event: 'tenant_manual_payout_record_created',
          settlement_batch_id: batch.settlement_batch_id,
          amount_centavos: payout.amount_centavos,
          initiated_by: initiatedBy,
          approved_by: batch.approved_by,
          method
        }
      }, { transaction });
      return { payout, idempotent_replay: false };
    });
  });

  const confirmManualPayout = wrap(async ({ payoutId, payload, actor }) => {
    const confirmedBy = requireActor(actor);
    const providerReference = String(payload.provider_reference || '').trim();
    const proofReference = String(payload.proof_reference || '').trim();
    if (!providerReference || !proofReference) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Provider reference and payout proof are required before confirming payment.'
      );
    }

    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const payout = await tenantRevenueRepository.findPayoutById(payoutId, {
        transaction,
        lock: true
      });
      if (!payout) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payout not found.');
      if (payout.status === 'paid') return { payout, idempotent_replay: true };
      if (!['approved', 'processing', 'scheduled'].includes(payout.status)) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Payout is not eligible for paid confirmation.');
      }
      const batch = await tenantRevenueRepository.findSettlementBatchById(
        payout.settlement_batch_id,
        { transaction, lock: true }
      );
      if (!batch) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Settlement batch not found.');
      if (String(batch.approved_by || '').toLowerCase() !== confirmedBy.toLowerCase()) {
        throw new DomainError(
          DomainErrorCode.AUTHORIZATION_FAILED,
          'Only the administrator who approved this settlement may confirm the payout evidence.'
        );
      }

      await tenantRevenueRepository.createLedgerEntry({
        tenant_id: payout.tenant_id,
        revenue_transaction_id: null,
        settlement_batch_id: payout.settlement_batch_id,
        payout_id: payout.payout_id,
        entry_type: 'payout',
        debit_account: 'tenant_payable',
        credit_account: 'bank_clearing',
        amount_centavos: toSafeNumber(payout.amount_centavos),
        currency: payout.currency,
        idempotency_key: `payout-confirmed:${payout.payout_id}`,
        reverses_ledger_entry_id: null,
        reason: 'Approved tenant settlement payout confirmed paid.',
        metadata: { provider_reference: providerReference, proof_reference: proofReference },
        created_by: payout.initiated_by,
        approved_by: batch.approved_by
      }, { transaction });
      const paidAt = new Date();
      const updatedPayout = await tenantRevenueRepository.updatePayout(payoutId, {
        status: 'paid',
        provider_reference: providerReference,
        proof_reference: proofReference,
        confirmed_by: confirmedBy,
        confirmed_at: paidAt
      }, { transaction, lock: true });
      await tenantRevenueRepository.updateSettlementBatch(batch.settlement_batch_id, {
        status: 'paid',
        actual_payout_at: paidAt
      }, { transaction, lock: true });
      for (const item of batch.items || []) {
        await tenantRevenueRepository.updateRevenueTransaction(
          item.revenue_transaction_id,
          { settlement_status: 'settled' },
          { transaction, lock: true }
        );
      }
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantPayout',
        entity_id: payout.payout_id,
        action: 'UPDATE',
        changes: {
          event: 'tenant_manual_payout_confirmed_paid',
          provider_reference: providerReference,
          proof_reference: proofReference,
          confirmed_by: confirmedBy
        }
      }, { transaction });
      return { payout: updatedPayout, idempotent_replay: false };
    });
  });

  const failManualPayout = wrap(async ({ payoutId, payload, actor }) => {
    const failedBy = requireActor(actor);
    const reason = requireReason(payload.reason, 'Payout failure reason');
    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const payout = await tenantRevenueRepository.findPayoutById(payoutId, {
        transaction,
        lock: true
      });
      if (!payout) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payout not found.');
      if (payout.status === 'failed') return { payout, idempotent_replay: true };
      if (payout.status === 'paid') {
        throw new DomainError(DomainErrorCode.CONFLICT, 'A confirmed paid payout cannot be marked failed.');
      }
      const updated = await tenantRevenueRepository.updatePayout(payoutId, {
        status: 'failed',
        failure_reason: reason,
        confirmed_by: failedBy,
        confirmed_at: new Date()
      }, { transaction, lock: true });
      const batch = await tenantRevenueRepository.findSettlementBatchById(
        payout.settlement_batch_id,
        { transaction, lock: true }
      );
      await tenantRevenueRepository.updateSettlementBatch(payout.settlement_batch_id, {
        status: 'failed'
      }, { transaction, lock: true });
      for (const item of batch?.items || []) {
        await tenantRevenueRepository.updateRevenueTransaction(
          item.revenue_transaction_id,
          { settlement_status: 'on_hold' },
          { transaction, lock: true }
        );
      }
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantPayout',
        entity_id: payoutId,
        action: 'UPDATE',
        changes: {
          event: 'tenant_manual_payout_failed',
          old_status: payout.status,
          new_status: 'failed',
          failed_by: failedBy,
          reason
        }
      }, { transaction });
      return { payout: updated, idempotent_replay: false };
    });
  });

  const retryManualPayout = wrap(async ({ payoutId, payload, actor }) => {
    const initiatedBy = requireActor(actor);
    const reason = requireReason(payload.reason, 'Retry reason');
    const idempotencyKey = String(payload.idempotency_key || '').trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 180) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid retry idempotency key is required.');
    }
    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const existing = await tenantRevenueRepository.findPayoutByIdempotency(idempotencyKey, {
        transaction,
        lock: true
      });
      if (existing) return { payout: existing, idempotent_replay: true };
      const failedPayout = await tenantRevenueRepository.findPayoutById(payoutId, {
        transaction,
        lock: true
      });
      if (!failedPayout) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Payout not found.');
      if (failedPayout.status !== 'failed') {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Only failed payouts can be retried.');
      }
      const batch = await tenantRevenueRepository.findSettlementBatchById(
        failedPayout.settlement_batch_id,
        { transaction, lock: true }
      );
      if (!batch || batch.status !== 'failed' || !batch.approved_by) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Failed settlement batch approval is incomplete.');
      }
      if (String(batch.approved_by).toLowerCase() !== initiatedBy.toLowerCase()) {
        throw new DomainError(
          DomainErrorCode.AUTHORIZATION_FAILED,
          'A failed payout retry must be initiated by the authorized settlement approver.'
        );
      }
      const retry = await tenantRevenueRepository.createPayout({
        public_reference: makeReference('PAY'),
        settlement_batch_id: failedPayout.settlement_batch_id,
        tenant_id: failedPayout.tenant_id,
        amount_centavos: toSafeNumber(failedPayout.amount_centavos),
        currency: failedPayout.currency,
        method: failedPayout.method,
        provider_reference: null,
        destination_masked: failedPayout.destination_masked,
        proof_reference: null,
        status: 'approved',
        idempotency_key: idempotencyKey,
        initiated_by: initiatedBy,
        approved_by: batch.approved_by,
        confirmed_by: null,
        failure_reason: null,
        confirmed_at: null
      }, { transaction });
      await tenantRevenueRepository.updateSettlementBatch(batch.settlement_batch_id, {
        status: 'processing'
      }, { transaction, lock: true });
      for (const item of batch.items || []) {
        await tenantRevenueRepository.updateRevenueTransaction(
          item.revenue_transaction_id,
          { settlement_status: 'processing' },
          { transaction, lock: true }
        );
      }
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantPayout',
        entity_id: retry.payout_id,
        action: 'CREATE',
        changes: {
          event: 'tenant_manual_payout_retry_created',
          failed_payout_id: failedPayout.payout_id,
          initiated_by: initiatedBy,
          approved_by: batch.approved_by,
          reason
        }
      }, { transaction });
      return { payout: retry, idempotent_replay: false };
    });
  });

  const requestAutomaticPayout = wrap(async () => {
    if (!canUseAutomaticTenantPayouts) {
      throw new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        'Automatic tenant payouts are disabled pending external provider and governance approval.',
        { statusCode: 503 }
      );
    }
    throw new DomainError(
      DomainErrorCode.SERVICE_UNAVAILABLE,
      'No approved automatic payout adapter is installed.',
      { statusCode: 503 }
    );
  });

  const listReconciliation = wrap(async ({ query = {} }) => ({
    records: await tenantRevenueRepository.listReconciliationRecords({
      tenantId: query.tenant_id || null,
      status: query.status || null,
      severity: query.severity || null,
      revenueTransactionId: query.revenue_transaction_id || null
    }, { limit: Math.min(500, Number.parseInt(query.limit || 200, 10)) })
  }));

  const runInternalReconciliation = wrap(async ({ query = {}, actor }) => {
    const reconciledBy = requireActor(actor);
    const tenantId = query.tenant_id || null;
    const filters = {
      tenantId,
      periodStart: query.period_start ? requireDate(query.period_start, 'Period start') : null,
      periodEnd: query.period_end ? requireDate(query.period_end, 'Period end') : null
    };
    const [transactions, batches, payouts, existingOpenRecords] = await Promise.all([
      tenantRevenueRepository.listRevenueTransactions(filters, { limit: 10000 }),
      tenantRevenueRepository.listSettlementBatches({ tenantId }, { limit: 5000 }),
      tenantRevenueRepository.listPayouts({ tenantId }, { limit: 5000 }),
      tenantRevenueRepository.listReconciliationRecords({ tenantId, status: 'open' }, { limit: 10000 })
    ]);
    const existingKeys = new Set(existingOpenRecords.map((record) => (
      `${record.exception_type}:${record.revenue_transaction_id || 'none'}:${record.tenant_id}`
    )));
    const createdExceptions = [];

    const flag = async ({
      tenant,
      revenueTransactionId = null,
      exceptionType,
      severity = 'blocking',
      expectedValue,
      actualValue
    }) => {
      const key = `${exceptionType}:${revenueTransactionId || 'none'}:${tenant}`;
      if (existingKeys.has(key)) return false;
      const record = await tenantRevenueRepository.createReconciliationRecord({
        tenant_id: tenant,
        revenue_transaction_id: revenueTransactionId,
        exception_type: exceptionType,
        severity,
        expected_value: expectedValue,
        actual_value: actualValue,
        status: 'open',
        detected_at: new Date()
      });
      existingKeys.add(key);
      createdExceptions.push(record);
      return true;
    };

    for (const revenue of transactions) {
      const entries = await tenantRevenueRepository.listLedgerEntries({
        tenantId: revenue.tenant_id,
        revenueTransactionId: revenue.revenue_transaction_id
      });
      const entryTypes = new Set(entries.map((entry) => entry.entry_type));
      let blockingExceptionCreated = false;
      if (!entryTypes.has('payment')) {
        blockingExceptionCreated = await flag({
          tenant: revenue.tenant_id,
          revenueTransactionId: revenue.revenue_transaction_id,
          exceptionType: 'missing_payment_ledger_entry',
          expectedValue: { ledger_entry_type: 'payment' },
          actualValue: { ledger_entry_types: [...entryTypes] }
        }) || blockingExceptionCreated;
      }
      if (toBigInt(revenue.dgfy_fee_centavos) > 0n && !entryTypes.has('platform_fee')) {
        blockingExceptionCreated = await flag({
          tenant: revenue.tenant_id,
          revenueTransactionId: revenue.revenue_transaction_id,
          exceptionType: 'missing_platform_fee_ledger_entry',
          expectedValue: { dgfy_fee_centavos: toSafeNumber(revenue.dgfy_fee_centavos) },
          actualValue: { platform_fee_ledger_entry: 'missing' }
        }) || blockingExceptionCreated;
      }
      if (toBigInt(revenue.provider_fee_centavos) > 0n && !entryTypes.has('provider_fee')) {
        blockingExceptionCreated = await flag({
          tenant: revenue.tenant_id,
          revenueTransactionId: revenue.revenue_transaction_id,
          exceptionType: 'missing_provider_fee_ledger_entry',
          expectedValue: { provider_fee_centavos: toSafeNumber(revenue.provider_fee_centavos) },
          actualValue: { provider_fee_ledger_entry: 'missing' }
        }) || blockingExceptionCreated;
      }
      if (toBigInt(revenue.refund_centavos) > 0n && !entryTypes.has('refund')) {
        blockingExceptionCreated = await flag({
          tenant: revenue.tenant_id,
          revenueTransactionId: revenue.revenue_transaction_id,
          exceptionType: 'refund_missing_ledger_entry',
          expectedValue: { refund_centavos: toSafeNumber(revenue.refund_centavos) },
          actualValue: { refund_ledger_entry: 'missing' }
        }) || blockingExceptionCreated;
      }
      if (toBigInt(revenue.chargeback_centavos) > 0n && !entryTypes.has('chargeback')) {
        blockingExceptionCreated = await flag({
          tenant: revenue.tenant_id,
          revenueTransactionId: revenue.revenue_transaction_id,
          exceptionType: 'chargeback_missing_ledger_entry',
          expectedValue: { chargeback_centavos: toSafeNumber(revenue.chargeback_centavos) },
          actualValue: { chargeback_ledger_entry: 'missing' }
        }) || blockingExceptionCreated;
      }
      const providerGross = toBigInt(revenue.gross_amount_centavos);
      const providerFee = revenue.provider_fee_centavos === null
        ? null
        : toBigInt(revenue.provider_fee_centavos);
      const providerNet = revenue.provider_net_centavos === null
        ? null
        : toBigInt(revenue.provider_net_centavos);
      if (providerFee === null || providerNet === null || providerNet + providerFee !== providerGross) {
        blockingExceptionCreated = await flag({
          tenant: revenue.tenant_id,
          revenueTransactionId: revenue.revenue_transaction_id,
          exceptionType: providerFee === null ? 'provider_fee_missing' : 'provider_net_mismatch',
          expectedValue: {
            identity: 'gross = provider fee + provider net',
            gross_centavos: toSafeNumber(providerGross)
          },
          actualValue: {
            provider_fee_centavos: providerFee === null ? null : toSafeNumber(providerFee),
            provider_net_centavos: providerNet === null ? null : toSafeNumber(providerNet)
          }
        }) || blockingExceptionCreated;
      }
      if (revenue.settlement_status === 'settled') {
        const batch = revenue.settlementItem?.batch;
        const verifiedPayout = batch
          ? payouts.find((payout) => (
            String(payout.settlement_batch_id) === String(batch.settlement_batch_id)
            && payout.status === 'paid'
            && payout.provider_reference
            && payout.proof_reference
          ))
          : null;
        if (!batch || batch.status !== 'paid' || !verifiedPayout) {
          blockingExceptionCreated = await flag({
            tenant: revenue.tenant_id,
            revenueTransactionId: revenue.revenue_transaction_id,
            exceptionType: 'settled_transaction_missing_payout_evidence',
            expectedValue: { settlement_batch_status: 'paid', verified_payout_reference: 'present' },
            actualValue: {
              settlement_batch: batch || null,
              verified_payout: Boolean(verifiedPayout)
            }
          }) || blockingExceptionCreated;
        }
      }
      if (blockingExceptionCreated && revenue.settlement_status !== 'settled') {
        await tenantRevenueRepository.updateRevenueTransaction(revenue.revenue_transaction_id, {
          reconciliation_status: 'exception',
          settlement_status: 'on_hold'
        });
      }
    }

    for (const batch of batches.filter((entry) => entry.status === 'paid')) {
      const payout = payouts.find((entry) => (
        String(entry.settlement_batch_id) === String(batch.settlement_batch_id)
        && entry.status === 'paid'
      ));
      if (!payout?.provider_reference || !payout?.proof_reference) {
        await flag({
          tenant: batch.tenant_id,
          exceptionType: `paid_batch_missing_payout_reference_${batch.settlement_batch_id}`,
          expectedValue: { payout_reference: 'present', payout_proof: 'present' },
          actualValue: {
            settlement_batch_id: batch.settlement_batch_id,
            payout_id: payout?.payout_id || null
          }
        });
      }
    }

    await tenantRevenueRepository.createAuditLog({
      entity_type: 'TenantRevenueReconciliation',
      entity_id: tenantId || 'all-tenants',
      action: 'CREATE',
      changes: {
        event: 'tenant_revenue_internal_reconciliation_completed',
        tenant_id: tenantId,
        transactions_scanned: transactions.length,
        batches_scanned: batches.length,
        payouts_scanned: payouts.length,
        new_exceptions: createdExceptions.length,
        reconciled_by: reconciledBy
      }
    });

    return {
      transactions_scanned: transactions.length,
      batches_scanned: batches.length,
      payouts_scanned: payouts.length,
      new_exceptions: createdExceptions.length,
      exceptions: createdExceptions
    };
  });

  const resolveReconciliation = wrap(async ({ reconciliationId, payload, actor }) => {
    const resolvedBy = requireActor(actor);
    const reason = requireReason(payload.reason, 'Resolution reason');
    const resolutionStatus = payload.waive === true ? 'waived' : 'resolved';
    return tenantRevenueRepository.runInTransaction(async (transaction) => {
      const updated = await tenantRevenueRepository.updateReconciliationRecord(
        reconciliationId,
        {
          status: resolutionStatus,
          resolution_reason: reason,
          resolved_at: new Date(),
          resolved_by: resolvedBy
        },
        { transaction, lock: true }
      );
      if (!updated) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Reconciliation exception not found.');
      if (updated.revenue_transaction_id) {
        const open = await tenantRevenueRepository.listReconciliationRecords({
          revenueTransactionId: updated.revenue_transaction_id,
          status: 'open',
          severity: 'blocking'
        }, { transaction, limit: 1 });
        if (!open.length) {
          await tenantRevenueRepository.updateRevenueTransaction(
            updated.revenue_transaction_id,
            {
              reconciliation_status: resolutionStatus === 'waived' ? 'approved_override' : 'reconciled',
              settlement_status: 'pending'
            },
            { transaction, lock: true }
          );
        }
      }
      await tenantRevenueRepository.createAuditLog({
        entity_type: 'TenantRevenueReconciliation',
        entity_id: reconciliationId,
        action: 'UPDATE',
        changes: {
          event: 'tenant_revenue_reconciliation_resolved',
          status: resolutionStatus,
          reason,
          resolved_by: resolvedBy
        }
      }, { transaction });
      return { record: updated };
    });
  });

  const exportTransactionsCsv = wrap(async ({ query = {} }) => {
    const transactions = [];
    let offset = 0;
    let total;
    do {
      const result = await listTransactions({ query: { ...query, limit: 500, offset } });
      if (!result.success) throw result.error;
      transactions.push(...result.data.transactions);
      total = result.data.pagination.total;
      offset += result.data.transactions.length;
    } while (offset < total && offset > 0);
    const columns = [
      'payment_reference',
      'tenant',
      'company_id',
      'branch_id',
      'order_id',
      'payment_method',
      'paid_at',
      'gross_centavos',
      'provider_fee_centavos',
      'provider_fee_vat_centavos',
      'provider_net_centavos',
      'dgfy_rate_bps',
      'dgfy_fee_centavos',
      'refund_centavos',
      'chargeback_centavos',
      'adjustment_centavos',
      'tenant_net_payable_centavos',
      'reconciliation_status',
      'settlement_status',
      'settlement_reference'
    ];
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = transactions.map((row) => [
      row.provider_payment_id,
      row.tenant?.name || row.tenant_id,
      row.company_id,
      row.branch_id,
      row.order_id,
      row.payment_method,
      row.paid_at,
      row.gross_amount_centavos,
      row.provider_fee_centavos,
      row.provider_fee_vat_centavos,
      row.provider_net_centavos,
      row.dgfy_rate_bps,
      row.dgfy_fee_centavos,
      row.refund_centavos,
      row.chargeback_centavos,
      row.adjustment_centavos,
      row.tenant_net_payable_centavos,
      row.reconciliation_status,
      row.settlement_status,
      row.settlementItem?.batch?.batch_number || ''
    ].map(escape).join(','));
    return {
      filename: `tenant-revenue-${new Date().toISOString().slice(0, 10)}.csv`,
      content_type: 'text/csv; charset=utf-8',
      csv: [columns.join(','), ...rows].join('\n')
    };
  });

  return {
    createFeePolicy,
    listFeePolicies,
    postPaidTransaction,
    recordOrderFulfillment,
    recordSucceededRefund,
    recordChargeback,
    requestAdjustment,
    approveAdjustment,
    listAdjustments,
    reconcileProviderFinancials,
    listTransactions,
    getDashboard,
    createSettlementBatch,
    listSettlementBatches,
    approveSettlementBatch,
    scheduleSettlementBatch,
    cancelSettlementBatch,
    createManualPayout,
    confirmManualPayout,
    failManualPayout,
    retryManualPayout,
    requestAutomaticPayout,
    listReconciliation,
    runInternalReconciliation,
    resolveReconciliation,
    exportTransactionsCsv
  };
};

export const tenantRevenueMoney = {
  CENTAVOS_PER_PESO,
  roundBasisPoints,
  allocateProviderFee,
  calculateTenantRevenueBreakdown,
  calculateConfiguredProviderFallback,
  normalizePaymentMethod,
  toBigInt
};
