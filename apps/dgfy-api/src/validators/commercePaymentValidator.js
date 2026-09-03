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
  target_type: Joi.string().valid('store_checkout', 'service_booking', 'dglaundry_booking').optional(),
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

const bookingReferenceSchema = Joi.string()
  .trim()
  .min(1)
  .max(200)
  .pattern(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

const bookingDateTimeSchema = Joi.string()
  .trim()
  .max(80)
  .isoDate()
  .messages({ 'string.isoDate': '{{#label}} must be a valid ISO date-time.' });

const bookingServiceInputsSchema = Joi.object()
  .pattern(/^[A-Za-z0-9_.:-]{1,80}$/, Joi.any())
  .max(100)
  .default({});

const dglaundryBookingLineSchema = Joi.object({
  mode: Joi.string().valid('fixed', 'per_kilo').optional(),
  variantId: Joi.string().trim().min(1).max(160).required(),
  quantity: Joi.number().integer().positive().max(100000).required(),
  measurementGrams: Joi.number().integer().positive().max(1000000).allow(null).optional(),
  externalLineReference: bookingReferenceSchema.required(),
  serviceInputs: bookingServiceInputsSchema
});

const dglaundryBookingFulfillmentSchema = Joi.object({
  mode: Joi.string().valid('pickup', 'delivery').required(),
  scheduledAt: bookingDateTimeSchema.allow(null).optional(),
  addressSnapshot: Joi.string().trim().max(1000).allow('', null).optional()
});

const dglaundryBookingCustomerSchema = Joi.object({
  displayName: Joi.string().trim().max(160).allow('', null).optional(),
  name: Joi.string().trim().max(160).allow('', null).optional(),
  email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().max(255).allow('', null).optional(),
  phone: Joi.string().trim().max(80).allow('', null).optional()
}).allow(null);

const dglaundryBookingPaymentSessionSchema = Joi.object({
  // The controller replaces company_id and tenant_id with the authenticated
  // tenant context. Keeping company_id optional preserves the context-only
  // request shape without trusting a client-supplied company identifier.
  company_id: Joi.string().trim().max(160).optional(),
  location_id: Joi.string().trim().min(1).max(160).required(),
  mode: Joi.string().valid('fixed', 'per_kilo', 'mixed').default('fixed'),
  external_order_reference: bookingReferenceSchema.required(),
  external_tracking_reference: bookingReferenceSchema.required(),
  external_order_group_reference: bookingReferenceSchema.optional(),
  external_tracking_group_reference: bookingReferenceSchema.optional(),
  catalog_version: Joi.string().trim().min(1).max(120).optional(),
  idempotency_key: Joi.string().trim().min(1).max(160).pattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).required(),
  store_slug: Joi.string().trim().lowercase().max(120).pattern(/^[a-z0-9][a-z0-9-]*$/).optional(),
  return_url: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(1000).allow('', null).optional(),
  lines: Joi.array().items(dglaundryBookingLineSchema).min(1).max(100).required(),
  fulfillment: dglaundryBookingFulfillmentSchema.required(),
  customer: dglaundryBookingCustomerSchema.optional()
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
export const validateCreateDglaundryBookingPaymentSessionBody = validateSchema(dglaundryBookingPaymentSessionSchema, 'body', 'validatedBody');
