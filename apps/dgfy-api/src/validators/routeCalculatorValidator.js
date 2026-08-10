import Joi from 'joi';
import { ROUTE_CALCULATOR_SUPPORTED_PROFILES } from '../config/routeCalculatorFeature.js';

const routeCalculatorQuerySchema = Joi.object({
    origin_lat: Joi.number().min(-90).max(90).required(),
    origin_lng: Joi.number().min(-180).max(180).required(),
    dest_lat: Joi.number().min(-90).max(90).required(),
    dest_lng: Joi.number().min(-180).max(180).required(),
    profile: Joi.string().valid(...ROUTE_CALCULATOR_SUPPORTED_PROFILES).optional()
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

export const validateRouteCalculatorQuery = (req, res, next) => {
    const { error, value } = routeCalculatorQuerySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
    });
    if (error) return res.status(422).json(buildValidationErrorResponse(error));
    req.validatedQuery = value;
    return next();
};
