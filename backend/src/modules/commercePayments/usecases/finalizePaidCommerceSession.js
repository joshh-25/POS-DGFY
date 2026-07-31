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
  const checkoutPayload = {
    ...storedCheckoutPayload,
    idempotency_key: plainSession.idempotency_key,
    payment_type: 'qrph',
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
    storeCustomer: verifiedStoreCustomer
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
};
