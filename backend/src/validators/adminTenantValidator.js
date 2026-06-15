import Joi from 'joi';

const CUSTOMER_ACCESS_MODES = ['ghost', 'catalog', 'inquiry', 'transaction'];

const capabilityPatchSchema = Joi.object({
    ims_enabled: Joi.boolean().strict().optional(),
    pos_enabled: Joi.boolean().strict().optional(),
    storefront_visible: Joi.boolean().strict().optional(),
    customer_access_mode: Joi.string().trim().lowercase().valid(...CUSTOMER_ACCESS_MODES).optional(),
    reason: Joi.string().trim().min(3).max(500).required()
}).or('ims_enabled', 'pos_enabled', 'storefront_visible', 'customer_access_mode').unknown(false);

const capabilityAuditLogQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20)
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

export const validateTenantCapabilityPatch = (req, res, next) => {
    const { error, value } = capabilityPatchSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req.validatedData = value;
    return next();
};

export const validateTenantCapabilityAuditLogQuery = (req, res, next) => {
    const { error, value } = capabilityAuditLogQuerySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req.validatedQuery = value;
    return next();
};
