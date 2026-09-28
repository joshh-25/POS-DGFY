import Joi from 'joi';

const CUSTOMER_ACTIVITY_TYPES = ['order', 'pos_order', 'service_booking', 'hospitality_booking', 'fnb_order', 'booking', 'all'];

const customerActivityQuerySchema = Joi.object({
    type: Joi.string().trim().lowercase().valid(...CUSTOMER_ACTIVITY_TYPES).optional(),
    tenant_id: Joi.string().trim().max(80).optional(),
    store_slug: Joi.string().trim().max(160).optional(),
    location_id: Joi.number().integer().positive().optional(),
    status: Joi.string().trim().max(60).optional(),
    payment_status: Joi.string().trim().max(60).optional(),
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().min(Joi.ref('date_from')).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25)
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

export const validateDgfyCustomerActivityQuery = (req, res, next) => {
    const { error, value } = customerActivityQuerySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
    });
    if (error) return res.status(422).json(buildValidationErrorResponse(error));
    req.validatedQuery = value;
    return next();
};
