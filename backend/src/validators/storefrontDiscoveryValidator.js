import Joi from 'joi';

const discoveryQuerySchema = Joi.object({
    search: Joi.string().trim().allow('', null).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    latitude: Joi.number().min(-90).max(90).allow(null).optional(),
    longitude: Joi.number().min(-180).max(180).allow(null).optional()
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
export const validateStorefrontSlugParam = validateSchema(storefrontSlugParamSchema, 'params', 'validatedParams');
