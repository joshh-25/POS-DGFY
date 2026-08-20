// Request validation for the pricelist admin API (#696). Conventions lifted directly from
// voucherValidator.js -- same 422 + errors[] response shape, same `validateSchema` factory, same
// explicit-forbidden (not stripUnknown) treatment of server-owned fields.

import Joi from 'joi';

// BIGINT centavos, same ceiling voucherValidator.js uses -- comfortably above any real price and
// comfortably below Number.MAX_SAFE_INTEGER.
const MAX_CENTAVOS = 999999999999;

const FORBIDDEN_FIELDS = Object.freeze([
    'pricelist_id',
    'status',
    'draft_of_pricelist_id',
    'created_at',
    'updated_at'
]);

const forbiddenFieldSchemas = () => FORBIDDEN_FIELDS.reduce((accumulator, field) => {
    accumulator[field] = Joi.any().forbidden();
    return accumulator;
}, {});

const pricelistItemSchema = Joi.object({
    item_id: Joi.number().integer().positive().required(),
    unit_price_centavos: Joi.number().integer().min(0).max(MAX_CENTAVOS).required(),
    is_manual_override: Joi.boolean().default(false)
});

const pricelistItemsSchema = Joi.array()
    .items(pricelistItemSchema)
    .max(2000)
    .unique((a, b) => a.item_id === b.item_id);

const createPricelistSchema = Joi.object({
    ...forbiddenFieldSchemas(),
    name: Joi.string().trim().min(2).max(120).required(),
    description: Joi.string().trim().max(255).allow(null, ''),
    // One-time row duplication into the new pricelist, never a live link (#698's own scope note).
    copy_from_pricelist_id: Joi.number().integer().positive().allow(null)
});

const updatePricelistSchema = Joi.object({
    ...forbiddenFieldSchemas(),
    name: Joi.string().trim().min(2).max(120),
    description: Joi.string().trim().max(255).allow(null, ''),
    version: Joi.number().integer().min(0).required()
})
    .min(2)
    .messages({
        'object.min': 'At least one field besides version is required for update'
    });

const replacePricelistItemsSchema = Joi.object({
    ...forbiddenFieldSchemas(),
    items: pricelistItemsSchema.required(),
    // Optional on purpose: writing to a `draft` pricelist for the first time (no prior version to
    // know) and writing to an `active` pricelist (which transparently creates/reuses a draft
    // revision the caller does not yet have a version for) both need to work without one. The use
    // case enforces it wherever a stored row's version is actually being compared against.
    version: Joi.number().integer().min(0)
});

const pricelistIdParamSchema = Joi.object({
    pricelist_id: Joi.number().integer().positive().required()
});

const pricelistListQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().trim().custom((value, helpers) => {
        const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
        if (parts.length === 0) return helpers.error('any.invalid');
        if (parts.some((part) => !['draft', 'active', 'archived'].includes(part))) return helpers.error('any.invalid');
        return parts;
    }),
    search: Joi.string().trim().max(255)
});

const buildValidationErrorResponse = (errors) => ({
    success: false,
    data: null,
    message: 'Validation failed',
    errors,
    timestamp: new Date().toISOString()
});

const validateSchema = (schema, source, target) => (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message
        }))));
    }

    req[target] = value;
    return next();
};

export const validateCreatePricelist = validateSchema(createPricelistSchema, 'body', 'validatedData');
export const validateUpdatePricelist = validateSchema(updatePricelistSchema, 'body', 'validatedData');
export const validateReplacePricelistItems = validateSchema(replacePricelistItemsSchema, 'body', 'validatedData');
export const validatePricelistIdParam = validateSchema(pricelistIdParamSchema, 'params', 'validatedParams');
export const validatePricelistListQuery = validateSchema(pricelistListQuerySchema, 'query', 'validatedQuery');

// Exported for direct unit testing of the schema layer, without an Express round trip.
export const __testables = Object.freeze({
    createPricelistSchema,
    updatePricelistSchema,
    replacePricelistItemsSchema,
    pricelistIdParamSchema,
    pricelistListQuerySchema
});
