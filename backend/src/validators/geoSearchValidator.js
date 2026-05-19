import Joi from 'joi';

const geoSearchQuerySchema = Joi.object({
    query: Joi.string().trim().min(1).max(100).required(),
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    // Default 5 km matches the delivery_radius_km default on TenantLocation
    radius: Joi.number().min(0.1).max(50).default(5),
    stock_filter: Joi.string()
        .valid('in_stock_only', 'include_out_of_stock')
        .default('include_out_of_stock'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20)
});

const inventoryPushSchema = Joi.object({
    // location_id is optional; NULL means "all locations for this tenant"
    location_id: Joi.number().integer().positive().allow(null).optional(),
    items: Joi.array()
        .items(
            Joi.object({
                name: Joi.string().trim().min(1).max(255).required(),
                sku_code: Joi.string().trim().max(100).allow(null, '').optional(),
                price: Joi.number().min(0).allow(null).optional(),
                quantity: Joi.number().integer().min(0).default(0),
                in_stock: Joi.boolean().default(true)
            })
        )
        .min(1)
        .max(500) // guard against oversized payloads
        .required()
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
    if (error) return res.status(422).json(buildValidationErrorResponse(error));
    req[target] = value;
    return next();
};

export const validateGeoSearchQuery = validateSchema(geoSearchQuerySchema, 'query', 'validatedQuery');
export const validateInventoryPush = validateSchema(inventoryPushSchema, 'body', 'validatedBody');
