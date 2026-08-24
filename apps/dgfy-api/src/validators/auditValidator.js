import Joi from 'joi';

const dateOnly = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/);

const auditQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).max(100000).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
    event_type: Joi.string().trim().max(100).allow(''),
    action: Joi.string().trim().uppercase().valid('CREATE', 'UPDATE', 'DELETE', 'VIEW').allow(''),
    entity_type: Joi.string().trim().max(50).allow(''),
    user_id: Joi.number().integer().positive(),
    terminal_id: Joi.string().trim().max(100).allow(''),
    shift_id: Joi.number().integer().positive(),
    date_from: dateOnly.allow(''),
    date_to: dateOnly.allow(''),
    search: Joi.string().trim().max(120).allow('')
}).unknown(false);

const validationError = (error) => ({
    success: false,
    data: null,
    message: 'Validation failed',
    errors: error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message
    })),
    timestamp: new Date().toISOString()
});

export const validateAuditQuery = (req, res, next) => {
    const { error, value } = auditQuerySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });
    if (error) return res.status(422).json(validationError(error));
    req.validatedQuery = value;
    return next();
};
