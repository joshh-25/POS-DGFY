import Joi from 'joi';

const reference = Joi.string().trim().min(1).max(200).pattern(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const scopeQuery = Joi.object({
  location_id: Joi.string().trim().min(1).max(160).required(),
  external_tracking_reference: Joi.string().trim().min(16).max(200).optional()
});
const serviceInputs = Joi.object().pattern(/^[A-Za-z0-9_.:-]{1,80}$/, Joi.any()).max(100).default({});
const line = Joi.object({
  variantId: Joi.string().trim().min(1).max(160).required(),
  mode: Joi.string().valid('fixed', 'per_kilo').required(),
  quantity: Joi.number().positive().max(100000).required(),
  measurementGrams: Joi.number().integer().positive().max(1000000).allow(null).optional(),
  externalLineReference: reference.optional(),
  serviceInputs
}).unknown(false);
const fulfillment = Joi.object({
  mode: Joi.string().valid('pickup', 'delivery').required(),
  scheduledAt: Joi.string().isoDate().allow(null).optional(),
  addressSnapshot: Joi.string().trim().max(1000).allow('', null).optional()
}).unknown(false);
const customer = Joi.object({
  displayName: Joi.string().trim().max(160).allow('', null).optional(),
  email: Joi.string().email({ tlds: { allow: false } }).trim().lowercase().max(255).allow('', null).optional(),
  phone: Joi.string().trim().max(80).allow('', null).optional()
}).unknown(false);
const submitFields = {
  location_id: Joi.string().trim().min(1).max(160).required(),
  catalog_version: Joi.string().trim().max(120).allow('', null).optional(),
  mode: Joi.string().valid('per_kilo').default('per_kilo'),
  lines: Joi.array().items(line).min(1).max(100).required(),
  fulfillment: fulfillment.required(),
  customer: customer.optional()
};

const validationResponse = (error) => ({
  success: false,
  data: null,
  message: 'Validation failed',
  errors: error.details.map((detail) => ({ field: detail.path.join('.'), message: detail.message })),
  timestamp: new Date().toISOString()
});

const validate = (schema, source, target) => (req, res, next) => {
  const { error, value } = schema.validate(req[source], { abortEarly: false, convert: true, stripUnknown: true });
  if (error) return res.status(422).json(validationResponse(error));
  req[target] = value;
  return next();
};

const paramSchema = Joi.object({ externalOrderReference: reference.required() });
const quoteSchema = Joi.object({ ...submitFields, mode: Joi.string().valid('fixed', 'per_kilo', 'mixed').optional() }).unknown(false);
const orderSchema = Joi.object(submitFields).unknown(false);
const mutationSchema = Joi.object({
  location_id: Joi.string().trim().min(1).max(160).required(),
  external_tracking_reference: Joi.string().trim().min(16).max(200).optional(),
  fulfillment: fulfillment.optional(),
  lines: Joi.array().items(line).min(1).max(100).optional(),
  reason: Joi.string().trim().max(160).allow('', null).optional()
}).min(1).unknown(false);

export const validateDgfyLaundryStoreScopeQuery = validate(scopeQuery, 'query', 'validatedLaundryQuery');
export const validateDgfyLaundryStoreQuote = validate(quoteSchema, 'body', 'validatedLaundryBody');
export const validateDgfyLaundryStoreOrder = validate(orderSchema, 'body', 'validatedLaundryBody');
export const validateDgfyLaundryStoreOrderParam = validate(paramSchema, 'params', 'validatedLaundryParams');
export const validateDgfyLaundryStoreMutation = validate(mutationSchema, 'body', 'validatedLaundryBody');
