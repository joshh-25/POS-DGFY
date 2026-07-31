import Joi from 'joi';

const tenantId = Joi.string().trim().guid({ version: ['uuidv4', 'uuidv5'] });
const databaseId = Joi.string().trim().pattern(/^\d+$/);

const buildValidationErrorResponse = (error) => ({
  success: false,
  data: null,
  message: 'Validation failed',
  errors: error.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message
  })),
  timestamp: new Date().toISOString()
});

const validateSchema = (schema, source, target) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });
  if (error) return res.status(422).json(buildValidationErrorResponse(error));
  req[target] = value;
  return next();
};

const tenantParamSchema = Joi.object({ tenant_id: tenantId.required() });
const settlementBatchParamSchema = Joi.object({ settlement_batch_id: databaseId.required() });
const payoutParamSchema = Joi.object({ payout_id: databaseId.required() });
const reconciliationParamSchema = Joi.object({ reconciliation_id: databaseId.required() });
const adjustmentParamSchema = Joi.object({ adjustment_id: databaseId.required() });

const listQuerySchema = Joi.object({
  tenant_id: tenantId.optional(),
  company_id: Joi.string().trim().max(120).optional(),
  branch_id: Joi.string().trim().max(120).optional(),
  payment_method: Joi.string().trim().max(60).optional(),
  provider_payment_id: Joi.string().trim().max(120).optional(),
  settlement_reference: Joi.string().trim().max(120).optional(),
  payment_status: Joi.string().valid('paid', 'partially_refunded', 'refunded', 'chargeback', 'reversed').optional(),
  reconciliation_status: Joi.string().valid('pending', 'reconciled', 'exception', 'approved_override').optional(),
  settlement_status: Joi.string().valid(
    'pending', 'eligible', 'scheduled', 'processing', 'partially_settled', 'settled', 'on_hold', 'reversed'
  ).optional(),
  status: Joi.string().trim().max(40).optional(),
  severity: Joi.string().valid('info', 'warning', 'blocking').optional(),
  revenue_transaction_id: databaseId.optional(),
  period_start: Joi.date().iso().optional(),
  period_end: Joi.date().iso().min(Joi.ref('period_start')).optional(),
  limit: Joi.number().integer().min(1).max(500).default(100),
  offset: Joi.number().integer().min(0).default(0)
});

const feePolicyBodySchema = Joi.object({
  dgfy_rate_bps: Joi.number().integer().min(0).max(10000).required(),
  settlement_cycle_days: Joi.number().integer().valid(15, 30).required(),
  settlement_status: Joi.string().valid('active', 'suspended', 'on_hold').default('on_hold'),
  minimum_payout_centavos: Joi.number().integer().min(0).default(0),
  provider_fee_payer: Joi.string().valid('tenant', 'dgfy', 'shared').default('tenant'),
  shared_fee_tenant_bps: Joi.number().integer().min(0).max(10000).allow(null).optional(),
  fallback_fee_policy: Joi.object({
    card: Joi.object({
      rate_bps: Joi.number().integer().min(0).max(10000).default(0),
      fixed_centavos: Joi.number().integer().min(0).default(0)
    }).optional(),
    ewallet: Joi.object({
      rate_bps: Joi.number().integer().min(0).max(10000).default(0),
      fixed_centavos: Joi.number().integer().min(0).default(0)
    }).optional(),
    qrph: Joi.object({
      rate_bps: Joi.number().integer().min(0).max(10000).default(0),
      fixed_centavos: Joi.number().integer().min(0).default(0)
    }).optional(),
    online_banking: Joi.object({
      rate_bps: Joi.number().integer().min(0).max(10000).default(0),
      fixed_centavos: Joi.number().integer().min(0).default(0)
    }).optional(),
    other: Joi.object({
      rate_bps: Joi.number().integer().min(0).max(10000).default(0),
      fixed_centavos: Joi.number().integer().min(0).default(0)
    }).optional()
  }).allow(null).optional(),
  payout_destination: Joi.object({
    type: Joi.string().trim().max(40).required(),
    provider: Joi.string().trim().max(120).optional(),
    bank_name: Joi.string().trim().max(120).optional(),
    account_name: Joi.string().trim().max(160).required(),
    account_number: Joi.string().trim().max(80).optional(),
    wallet_number: Joi.string().trim().max(80).optional(),
    account_id: Joi.string().trim().max(120).optional()
  }).or('account_number', 'wallet_number', 'account_id').optional(),
  automatic_payout_enabled: Joi.boolean().default(false),
  large_payout_threshold_centavos: Joi.number().integer().min(0).allow(null).optional(),
  effective_at: Joi.date().iso().required(),
  reason: Joi.string().trim().min(3).max(500).required()
}).custom((value, helpers) => {
  if (value.provider_fee_payer === 'shared' && value.shared_fee_tenant_bps === undefined) {
    return helpers.error('any.custom', { message: 'shared_fee_tenant_bps is required for shared fees' });
  }
  return value;
});

const settlementBatchBodySchema = Joi.object({
  tenant_id: tenantId.required(),
  period_start: Joi.date().iso().required(),
  period_end: Joi.date().iso().min(Joi.ref('period_start')).required()
});

const reasonBodySchema = Joi.object({
  reason: Joi.string().trim().min(3).max(500).required(),
  waive: Joi.boolean().optional()
});

const manualPayoutBodySchema = Joi.object({
  method: Joi.string().valid('manual_bank', 'manual_paymongo').default('manual_bank'),
  idempotency_key: Joi.string().trim().min(8).max(180).required(),
  provider_reference: Joi.string().trim().max(160).allow('', null).optional(),
  proof_reference: Joi.string().trim().max(500).allow('', null).optional()
});

const confirmPayoutBodySchema = Joi.object({
  provider_reference: Joi.string().trim().min(3).max(160).required(),
  proof_reference: Joi.string().trim().min(3).max(500).required()
});

const scheduleBodySchema = Joi.object({
  scheduled_payout_at: Joi.date().iso().required(),
  reason: Joi.string().trim().min(3).max(500).required()
});

const retryPayoutBodySchema = Joi.object({
  idempotency_key: Joi.string().trim().min(8).max(180).required(),
  reason: Joi.string().trim().min(3).max(500).required()
});

const adjustmentBodySchema = Joi.object({
  tenant_id: tenantId.required(),
  revenue_transaction_id: databaseId.required(),
  amount_centavos: Joi.number().integer().min(-9007199254740991).max(9007199254740991).invalid(0).required(),
  idempotency_key: Joi.string().trim().min(8).max(180).required(),
  reason: Joi.string().trim().min(3).max(500).required()
});

const providerReconciliationBodySchema = Joi.object({
  tenant_id: tenantId.optional(),
  source: Joi.string().valid('api', 'statement').default('statement'),
  statement_reference: Joi.string().trim().min(3).max(160).required(),
  rows: Joi.array().items(Joi.object({
    provider_payment_id: Joi.string().trim().min(3).max(160).required(),
    provider_balance_transaction_id: Joi.string().trim().max(160).allow('', null).optional(),
    gross_amount_centavos: Joi.number().integer().min(1).required(),
    provider_fee_centavos: Joi.number().integer().min(0).required(),
    provider_fee_vat_centavos: Joi.number().integer().min(0).allow(null).optional(),
    provider_net_centavos: Joi.number().integer().min(0).required()
  })).min(1).max(500).required()
});

export const validateTenantRevenueListQuery = validateSchema(listQuerySchema, 'query', 'validatedQuery');
export const validateTenantRevenueTenantParam = validateSchema(tenantParamSchema, 'params', 'validatedParams');
export const validateTenantRevenueSettlementBatchParam = validateSchema(settlementBatchParamSchema, 'params', 'validatedParams');
export const validateTenantRevenuePayoutParam = validateSchema(payoutParamSchema, 'params', 'validatedParams');
export const validateTenantRevenueReconciliationParam = validateSchema(reconciliationParamSchema, 'params', 'validatedParams');
export const validateTenantRevenueAdjustmentParam = validateSchema(adjustmentParamSchema, 'params', 'validatedParams');
export const validateTenantRevenueFeePolicyBody = validateSchema(feePolicyBodySchema, 'body', 'validatedBody');
export const validateTenantRevenueSettlementBatchBody = validateSchema(settlementBatchBodySchema, 'body', 'validatedBody');
export const validateTenantRevenueReasonBody = validateSchema(reasonBodySchema, 'body', 'validatedBody');
export const validateTenantRevenueManualPayoutBody = validateSchema(manualPayoutBodySchema, 'body', 'validatedBody');
export const validateTenantRevenueConfirmPayoutBody = validateSchema(confirmPayoutBodySchema, 'body', 'validatedBody');
export const validateTenantRevenueAdjustmentBody = validateSchema(adjustmentBodySchema, 'body', 'validatedBody');
export const validateTenantRevenueProviderReconciliationBody = validateSchema(providerReconciliationBodySchema, 'body', 'validatedBody');
export const validateTenantRevenueScheduleBody = validateSchema(scheduleBodySchema, 'body', 'validatedBody');
export const validateTenantRevenueRetryPayoutBody = validateSchema(retryPayoutBodySchema, 'body', 'validatedBody');
