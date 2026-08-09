import Joi from 'joi';

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

const validateWith = (schema, source = 'body') => (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });
    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }
    req[source === 'body' ? 'validatedData' : 'validatedQuery'] = value;
    return next();
};

// reason is required on both hide and unhide - mirroring
// adminTemplateValidator.js's templateActionSchema, every audited
// platform-admin write in this codebase requires one.
const setVisibilitySchema = Joi.object({
    hidden: Joi.boolean().strict().required(),
    reason: Joi.string().trim().min(3).max(500).required()
}).unknown(false);

const auditLogQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(200).default(50)
}).unknown(false);

export const validateSetRegistrationIndustryVisibility = validateWith(setVisibilitySchema);
export const validateRegistrationIndustryAuditLogQuery = validateWith(auditLogQuerySchema, 'query');
