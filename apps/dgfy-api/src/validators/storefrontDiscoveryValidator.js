import Joi from 'joi';

const discoveryQuerySchema = Joi.object({
    search: Joi.string().trim().allow('', null).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    latitude: Joi.number().min(-90).max(90).allow(null).optional(),
    longitude: Joi.number().min(-180).max(180).allow(null).optional(),
    result_mode: Joi.string().trim().lowercase().valid('union', 'item_only', 'store_only').default('union'),
    stock_filter: Joi.string().trim().lowercase().valid('in_stock_only', 'include_out_of_stock').optional(),
    pin_scope: Joi.string().trim().lowercase().valid('nearest_matching_branch', 'all_matching_branches', 'tenant_primary').optional(),
    include_match_meta: Joi.boolean().truthy('true', '1').falsy('false', '0').default(true)
});

const mapPinsQuerySchema = discoveryQuerySchema.keys({
    limit: Joi.number().integer().min(1).max(100).default(100),
    include_match_meta: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),
    include_items: Joi.boolean().truthy('true', '1').falsy('false', '0').default(false),
    item_limit: Joi.number().integer().min(1).max(10).default(5)
});

const storefrontSlugParamSchema = Joi.object({
    slug: Joi.string().trim().lowercase().max(80).pattern(/^[a-z0-9-]+$/).required()
});

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
        stripUnknown: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req[target] = value;
    return next();
};

export const validateStorefrontDiscoveryQuery = validateSchema(discoveryQuerySchema, 'query', 'validatedQuery');
export const validateStorefrontMapPinsQuery = validateSchema(mapPinsQuerySchema, 'query', 'validatedQuery');
export const validateStorefrontSlugParam = validateSchema(storefrontSlugParamSchema, 'params', 'validatedParams');
