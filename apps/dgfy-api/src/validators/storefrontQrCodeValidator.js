import Joi from 'joi';

const idParamSchema = Joi.object({
    id: Joi.number().integer().positive().required()
});

const hexColor = Joi.string().trim().pattern(/^#[0-9a-fA-F]{6}$/).messages({
    'string.pattern.base': 'must be a six-digit hexadecimal color such as #0f172a'
});

const designSchema = Joi.object({
    foreground: hexColor,
    background: hexColor,
    width: Joi.number().integer().min(180).max(800),
    margin: Joi.number().integer().min(0).max(8),
    error_correction_level: Joi.string().uppercase().valid('L', 'M', 'Q', 'H')
}).default({}).unknown(false);

const createSchema = Joi.object({
    location_id: Joi.number().integer().positive().required(),
    target_type: Joi.string().lowercase().valid('catalog', 'category').default('catalog'),
    folder_id: Joi.number().integer().positive().allow(null).optional(),
    label: Joi.string().trim().max(120).allow('', null).optional(),
    design: designSchema
});

const updateSchema = Joi.object({
    label: Joi.string().trim().max(120).allow('', null).optional(),
    design: designSchema.optional(),
    is_active: Joi.boolean().optional()
}).min(1);

const listQuerySchema = Joi.object({
    location_id: Joi.number().integer().positive().optional()
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

export const validateStorefrontQrCodeIdParam = validateSchema(idParamSchema, 'params', 'validatedParams');
export const validateListStorefrontQrCodesQuery = validateSchema(listQuerySchema, 'query', 'validatedQuery');
export const validateCreateStorefrontQrCode = validateSchema(createSchema, 'body', 'validatedData');
export const validateUpdateStorefrontQrCode = validateSchema(updateSchema, 'body', 'validatedData');
