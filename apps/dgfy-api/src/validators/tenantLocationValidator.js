import Joi from 'joi';

const tenantLocationIdParamSchema = Joi.object({
    id: Joi.number().integer().positive().required()
});

const operatingHoursSchema = Joi.alternatives().try(
    Joi.object().unknown(true),
    Joi.array().items(Joi.object().unknown(true))
).allow(null);

const tenantLocationBaseSchema = Joi.object({
    name: Joi.string().trim().min(2).max(255).required().messages({
        'any.required': 'Location name is required'
    }),
    address_line: Joi.string().trim().min(3).max(2000).required().messages({
        'any.required': 'Location address is required'
    }),
    latitude: Joi.number().min(-90).max(90).required().messages({
        'any.required': 'Latitude is required'
    }),
    longitude: Joi.number().min(-180).max(180).required().messages({
        'any.required': 'Longitude is required'
    }),
    delivery_radius_km: Joi.number().min(0).max(100).precision(2).default(5),
    is_open: Joi.boolean().default(true),
    is_active: Joi.boolean().default(true),
    is_primary_storefront: Joi.boolean().default(false),
    last_known_updated_at: Joi.date().iso(),
    expected_updated_at: Joi.date().iso(),
    operating_hours: operatingHoursSchema.optional(),
    current_wait_time_minutes: Joi.number().integer().min(0).max(720).default(15),
    allow_out_of_stock_sales: Joi.boolean().default(false),
    supports_delivery: Joi.boolean().default(true),
    supports_pickup: Joi.boolean().default(true),
    supports_dine_in: Joi.boolean().default(true),
    scheduling_enabled: Joi.boolean().default(true),
    immediate_fulfillment_enabled: Joi.boolean().default(true),
    fulfillment_lead_time_min_days: Joi.number().integer().min(0).max(365).allow(null),
    fulfillment_lead_time_max_days: Joi.number().integer().min(0).max(365).allow(null)
});

const createTenantLocationSchema = tenantLocationBaseSchema;

const updateTenantLocationSchema = tenantLocationBaseSchema
    .fork(['name', 'address_line', 'latitude', 'longitude'], (schema) => schema.optional())
    .min(1)
    .messages({
        'object.min': 'At least one field is required for update'
    });

const tenantLocationsQuerySchema = Joi.object({
    include_inactive: Joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(true)
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

export const validateTenantLocationIdParam = validateSchema(tenantLocationIdParamSchema, 'params', 'validatedParams');
export const validateCreateTenantLocation = validateSchema(createTenantLocationSchema, 'body', 'validatedData');
export const validateUpdateTenantLocation = validateSchema(updateTenantLocationSchema, 'body', 'validatedData');
export const validateTenantLocationsQuery = validateSchema(tenantLocationsQuerySchema, 'query', 'validatedQuery');
