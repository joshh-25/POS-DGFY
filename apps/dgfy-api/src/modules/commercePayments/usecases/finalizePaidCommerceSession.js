import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import dbStore from '../../../utils/dbStore.js';
import tenantConnector from '../../../utils/TenantConnector.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import { storeCheckoutUseCase } from '../../store/index.js';

const toPlain = (value) => (value?.get ? value.get({ plain: true }) : value);
const getAttributes = (resource = {}) => resource?.attributes || resource || {};
const parseJsonObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const getFinalizationFailureReason = (error) => {
  const message = String(error?.message || 'The paid order could not be finalized.').trim();
  return message.slice(0, 1000);
};

// #668: a voucher's redemption limit can be exhausted by a concurrent order in the window between
// QRPh session-creation (preview only -- storeUseCases.js's resolveCheckoutContext only reserves
// when a transaction is already open, which a payment-session preview never has) and
// webhook-confirmed finalization (the real atomic reserveRedemption, run here via
// storeCheckoutUseCase). Finalization can then fail *after* PayMongo has already reported the
// payment as paid. Accepted as-is -- this mirrors the same flow's existing, already-accepted
// stock/location-availability race (not a new bug class); reserving the voucher earlier, at session
// creation, would instead hold a redemption slot hostage for a session the customer never actually
// pays, and this flow has no session-expiry release mechanism to hedge that today
// (reverseVoucherRedemptionUseCase exists but has no live caller yet). What #668 actually named as
// the gap was reconciliation visibility: every finalization failure landed under the same generic
// ORDER_FINALIZATION_FAILED code, so an operator working the paid_manual_resolution_required queue
// (commercePaymentAdminUseCases.js's retry/refund use cases) had to read a raw error message to tell
// "the voucher ran out, decide refund vs. retry" apart from any other failure. See ADR 0066's
// 2026-08-19 amendment.
//
// #706 (2026-08-19): #668's original four codes covered only the three exhaustion previews plus a
// version conflict -- but finalization re-runs the SAME full eligibility check preview did
// (voucherRedemptionUseCases.js's resolveEligibleBenefit, shared by both), under lock, so the exact
// same "changed between preview and finalization" race also produces these five. Each is a real,
// user-visible state that can flip between a QRPh session's creation and its webhook-confirmed
// finalization -- an admin edits/pauses the campaign, the customer holds an unpaid QR code past the
// voucher's own time window, or a price/cost change during that window newly triggers the below-cost
// guard (#697). A voucher expiring while a customer holds an unpaid QR code is, if anything, more
// likely in practice than a redemption-count race, and previously landed as the same unhelpful
// generic ORDER_FINALIZATION_FAILED the four-code set was built to get away from.
//
// Deliberately NOT added: VOUCHER_MIN_SPEND_NOT_MET, VOUCHER_MIN_QUANTITY_NOT_MET,
// VOUCHER_NOT_STARTED, VOUCHER_TIMEZONE_UNRESOLVABLE. These are evaluated against the same cart
// payload preview already saw -- not a race, a fixed function of data preview already had -- so if
// one of these blocks at finalization it blocked identically at preview and the checkout should
// never have reached a paid QRPh session in the first place. Tagging them VOUCHER_REDEMPTION_UNAVAILABLE
// would mislead an operator into treating a data/config bug as a normal exhaustion race.
//
// All nine codes are the voucher domain's own reason codes (voucherEligibilityPolicy.js's
// VOUCHER_ELIGIBILITY_REASON_CODES plus voucherErrors.js's VOUCHER_VERSION_CONFLICT and
// VOUCHER_PRICE_BELOW_COST) -- listed here as literals rather than imported, matching how every
// other failure_code in this module is already a free-standing string, not a shared cross-module
// enum.
const VOUCHER_REDEMPTION_UNAVAILABLE_REASON_CODES = new Set([
  'VOUCHER_REDEMPTION_LIMIT_REACHED',
  'VOUCHER_BUDGET_EXHAUSTED',
  'VOUCHER_QUANTITY_LIMIT_REACHED',
  'VOUCHER_VERSION_CONFLICT',
  // #706: added -- see the comment block above for why these five, and why the four deliberately
  // excluded codes stay excluded.
  'VOUCHER_EXPIRED',
  'VOUCHER_NOT_ACTIVE',
  'VOUCHER_WEEKDAY_NOT_ELIGIBLE',
  'VOUCHER_TIME_WINDOW_BLOCKED',
  'VOUCHER_PRICE_BELOW_COST'
]);

const getFinalizationFailureCode = (error) => {
  if (VOUCHER_REDEMPTION_UNAVAILABLE_REASON_CODES.has(error?.details?.reason_code)) {
    return 'VOUCHER_REDEMPTION_UNAVAILABLE';
  }
  return /idempotency[_ ]key.*different.*payload/i.test(String(error?.message || ''))
    ? 'IDEMPOTENCY_PAYLOAD_CONFLICT'
    : 'ORDER_FINALIZATION_FAILED';
};

const persistFinalizationFailure = async ({
  commercePaymentRepository,
  session,
  resource,
  providerEventId,
  error
}) => {
  await commercePaymentRepository.updateSessionById(session.session_id, {
    // Payment is confirmed. Keep it recoverable instead of treating it as a failed payment.
    status: 'paid_manual_resolution_required',
    provider_event_id: providerEventId || session.provider_event_id,
    provider_payment_id: getPaymentIdFromPayMongoResource(resource) || session.provider_payment_id,
    provider_payload: resource || session.provider_payload || null,
    failure_code: getFinalizationFailureCode(error),
    failure_reason: getFinalizationFailureReason(error)
  });
};

export const getPaymentIdFromPayMongoResource = (resource = {}) => {
  const attrs = getAttributes(resource);
  return String(resource?.id || attrs?.payment_id || attrs?.payment?.id || '').startsWith('pay_')
    ? (resource?.id || attrs?.payment_id || attrs?.payment?.id)
    : null;
};

export const hasPayMongoSplitFailure = (resource = {}) => {
  const attrs = getAttributes(resource);
  const status = attrs.split_payment?.status || attrs.split?.status || null;
  return ['failed', 'error'].includes(String(status || '').toLowerCase());
};

export const finalizePaidCommerceSession = async ({
  session,
  resource = {},
  providerEventId = null,
  commercePaymentRepository
}) => {
  const plainSession = toPlain(session);
  if (plainSession.pos_transaction_id || plainSession.tracking_pin || plainSession.status === 'finalized') {
    return plainSession;
  }

  try {
    const tenant = await commercePaymentRepository.findTenantById(plainSession.tenant_id);
    if (!tenant) {
      throw new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found for paid commerce session', { statusCode: 404 });
    }

    const sequelizeInstance = await tenantConnector.getConnection(tenant);
    const tenantModels = getTenantModels(sequelizeInstance);
    const context = {
      sequelize: sequelizeInstance,
      tenantId: tenant.id,
      tenantToken: plainSession.store_slug,
      tenantName: tenant.name,
      tenantPlan: tenant.plan,
      tenantSubscriptionStatus: tenant.subscription_status,
      tenantGracePeriodEnd: tenant.grace_period_end,
      tenantPaymentMethod: tenant.payment_method,
      tenantComplianceModeState: tenant.compliance_mode_state || null,
      tenantComplianceModeChoiceRequired: tenant.compliance_mode_choice_required === true,
      tenantComplianceModeSelectedAt: tenant.compliance_mode_selected_at || null,
      tenantComplianceModeSelectedBy: tenant.compliance_mode_selected_by || null,
      tenantComplianceActivatedAt: tenant.compliance_activated_at || null,
      tenantCompliancePolicyVersion: tenant.compliance_policy_version || null,
      tenantComplianceProfile: tenant.compliance_profile || null,
      ...tenantModels
    };

    const storedCheckoutPayload = parseJsonObject(plainSession.checkout_payload);
    const verifiedStoreCustomer = parseJsonObject(storedCheckoutPayload._verified_store_customer);
    // The payment method is part of the locked checkout payload. Replaying a
    // paid session must use that exact value so the tenant order idempotency
    // hash remains identical to the original checkout request.
    const storedPaymentType = String(storedCheckoutPayload.payment_type || '').trim().toLowerCase() || 'qrph';
    const checkoutPayload = {
      ...storedCheckoutPayload,
      idempotency_key: plainSession.idempotency_key,
      payment_type: storedPaymentType,
      payment_status: 'paid',
      payment_provider: 'paymongo',
      payment_reference: getPaymentIdFromPayMongoResource(resource) || plainSession.provider_payment_id || plainSession.provider_payment_intent_id,
      payment_checkout_url: plainSession.checkout_url || null,
      payment_session_reference: plainSession.public_reference,
      payment_webhook_confirmed: true
    };

    const result = await dbStore.run(context, () => storeCheckoutUseCase({
      tenantId: tenant.id,
      payload: checkoutPayload,
      storeCustomer: verifiedStoreCustomer,
      allowExpiredGuestCheckoutProof: true
    }));

    if (!result.success) {
      throw result.error || new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Paid QR Ph checkout could not be finalized', { statusCode: 500 });
    }

    const order = result.data?.order || {};
    const feePolicy = parseJsonObject(plainSession.fee_policy);
    const usesPayMongoSplit = feePolicy.collection_model !== 'dgfy_collects_then_settles_tenant';
    const nextStatus = usesPayMongoSplit && hasPayMongoSplitFailure(resource)
      ? 'split_failed_manual_settlement_required'
      : 'finalized';

    return commercePaymentRepository.updateSessionById(plainSession.session_id, {
      status: nextStatus,
      finalized_at: new Date(),
      provider_event_id: providerEventId || plainSession.provider_event_id,
      provider_payment_id: getPaymentIdFromPayMongoResource(resource) || plainSession.provider_payment_id,
      pos_transaction_id: order.pos_transaction_id || null,
      tracking_pin: result.data?.tracking_pin || order.tracking_pin || null,
      provider_payload: resource,
      failure_code: nextStatus === 'split_failed_manual_settlement_required' ? 'SPLIT_FAILED' : null,
      failure_reason: nextStatus === 'split_failed_manual_settlement_required'
        ? 'Payment succeeded but PayMongo split allocation requires manual settlement.'
        : null
    });
  } catch (error) {
    try {
      await persistFinalizationFailure({
        commercePaymentRepository,
        session: plainSession,
        resource,
        providerEventId,
        error
      });
    } catch {
      // The webhook still returns a retryable error if recording the recovery state also fails.
    }

    throw new DomainError(
      DomainErrorCode.INTERNAL_ERROR,
      'Payment received; order finalization is pending retry.',
      { statusCode: 500 }
    );
  }
};
