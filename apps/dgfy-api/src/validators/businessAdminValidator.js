import Joi from 'joi';

const updateBusinessNameSchema = Joi.object({
    name: Joi.string().trim().min(2).max(255).required()
}).unknown(false);

const endAttendanceShiftSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).optional(),
    closing_cash_amount: Joi.number().min(0).precision(4).required(),
    reason: Joi.string().trim().min(8).max(255).required()
}).unknown(false);

export const validateUpdateBusinessAdminCompanyName = (req, res, next) => {
    const { error, value } = updateBusinessNameSchema.validate(req?.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        return res.status(422).json({
            success: false,
            message: 'Validation failed',
            errors: error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message
            })),
            timestamp: new Date().toISOString()
        });
    }

    req.validatedData = value;
    return next();
};

export const validateBusinessAdminEndAttendanceShift = (req, res, next) => {
    const { error, value } = endAttendanceShiftSchema.validate(req?.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        return res.status(422).json({
            success: false,
            message: 'Validation failed',
            errors: error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message
            })),
            timestamp: new Date().toISOString()
        });
    }

    req.validatedData = value;
    return next();
};
