import Joi from 'joi';

const PAYMENT_SESSION_PATTERN = /^CPS-[A-Z0-9]{10}$/;
const REFUND_STRATEGIES = ['proportional', 'tenant', 'dgfy', 'custom'];
const REFUND_REASONS = ['requested_by_customer', 'duplicate', 'fraudulent', 'others'];
const PAYMENT_SESSION_STATUSES = [
  'awaiting_payment',
  'paid',
  'finalized',
  'failed',
  'expired',
  'refund_pending',
  'partial_refunded',
  'refunded',
  'paid_manual_resolution_required',
  'split_failed_manual_settlement_required'
];
const REPORT_STATUSES = [...PAYMENT_SESSION_STATUSES, 'cancelled'];
const tenantIdSchema = Joi.string().trim().guid({ version: ['uuidv4', 'uuidv5'] });

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

  if (error) {
    return res.status(422).json(buildValidationErrorResponse(error));
  }

  req[target] = value;
  return next();
};

const paymentSessionParamSchema = Joi.object({
  payment_session_id: Joi.string().trim().uppercase().pattern(PAYMENT_SESSION_PATTERN).required()
});

const listPaymentSessionsQuerySchema = Joi.object({
  tenant_id: tenantIdSchema.optional(),
  status: Joi.alternatives().try(
    Joi.string().trim().custom((value, helpers) => {
      const statuses = value.split(',').map((entry) => entry.trim()).filter(Boolean);
      const invalid = statuses.find((status) => !REPORT_STATUSES.includes(status));
      if (invalid) return helpers.error('any.invalid');
      return statuses.join(',');
    }),
    Joi.array().items(Joi.string().valid(...REPORT_STATUSES))
  ).optional(),
  target_type: Joi.string().valid('store_checkout', 'service_booking').optional(),
  limit: Joi.number().integer().min(1).max(250).default(100),
  offset: Joi.number().integer().min(0).default(0)
});

const tenantPaymentAccountsQuerySchema = Joi.object({
  tenant_id: tenantIdSchema.optional()
});

const tenantPaymentAccountParamSchema = Joi.object({
  tenant_id: tenantIdSchema.required()
});

const tenantPayMongoChildAccountActionParamSchema = tenantPaymentAccountParamSchema.keys({
  action: Joi.string().valid('sync-requirements', 'submit-review', 'activate').required()
});

const tenantPaymentAccountBodySchema = Joi.object({
  provider_merchant_id: Joi.string().trim().min(3).max(255).required(),
  provider_wallet_id: Joi.string().trim().max(255).allow('', null).optional(),
  wallet_status: Joi.string().valid('unknown', 'closed_loop', 'enabled', 'restricted').default('unknown'),
  wallet_verified_at: Joi.date().iso().allow(null).optional(),
  onboarding_status: Joi.string().valid('not_started', 'pending', 'active', 'restricted').default('pending'),
  qrph_enabled: Joi.boolean().default(false),
  split_enabled: Joi.boolean().default(false),
  charges_enabled: Joi.boolean().default(false),
  verification_reference: Joi.string().trim().max(255).allow('', null).optional(),
  verified_at: Joi.date().iso().allow(null).optional(),
  verified_by: Joi.string().trim().max(120).allow('', null).optional(),
  requirements_due: Joi.alternatives().try(Joi.array().items(Joi.string().trim().max(255)), Joi.object()).allow(null).optional(),
  metadata: Joi.object().allow(null).optional()
});

const tenantPayMongoChildAccountBodySchema = Joi.object({
  trade_name: Joi.string().trim().min(2).max(120).allow('', null).optional()
});

const refundSourceSchema = Joi.object({
  merchant_id: Joi.string().trim().min(3).max(255).required(),
  split_type: Joi.string().valid('fixed').default('fixed'),
  value: Joi.number().integer().positive().required()
}).unknown(false);

const refundBodySchema = Joi.object({
  amount: Joi.number().positive().precision(2).optional(),
  amount_centavos: Joi.number().integer().positive().optional(),
  refund_strategy: Joi.string().valid(...REFUND_STRATEGIES).default('proportional'),
  reason: Joi.string().valid(...REFUND_REASONS).default('requested_by_customer'),
  notes: Joi.string().trim().max(255).allow('', null).optional(),
  refund_sources: Joi.array().items(refundSourceSchema).max(10).optional()
}).xor('amount', 'amount_centavos');

export const validateCommercePaymentSessionParam = validateSchema(paymentSessionParamSchema, 'params', 'validatedParams');
export const validateListCommercePaymentSessionsQuery = validateSchema(listPaymentSessionsQuerySchema, 'query', 'validatedQuery');
export const validateTenantPaymentAccountsQuery = validateSchema(tenantPaymentAccountsQuerySchema, 'query', 'validatedQuery');
export const validateTenantPaymentAccountParam = validateSchema(tenantPaymentAccountParamSchema, 'params', 'validatedParams');
export const validateTenantPayMongoChildAccountActionParam = validateSchema(tenantPayMongoChildAccountActionParamSchema, 'params', 'validatedParams');
export const validateTenantPaymentAccountBody = validateSchema(tenantPaymentAccountBodySchema, 'body', 'validatedBody');
export const validateTenantPayMongoChildAccountBody = validateSchema(tenantPayMongoChildAccountBodySchema, 'body', 'validatedBody');
export const validateCommercePaymentRefundBody = validateSchema(refundBodySchema, 'body', 'validatedBody');
