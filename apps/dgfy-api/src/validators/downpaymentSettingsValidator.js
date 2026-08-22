import Joi from 'joi';

const MAX_CENTAVOS = 999999999999;
const MAX_RATE_BPS = 10000; // 100.00%

// Shape/bounds/cross-field conditionals only. The two DB-dependent business rules Joi can't
// express -- non-Retail workflow_mode rejection and customer_choice rejection -- live in
// downpaymentSettingsUseCases.js instead (Phase 138 plan, decision 3).
const updateDownpaymentSettingsSchema = Joi.object({
    payment_mode: Joi.string().trim().lowercase().valid('full_payment', 'downpayment_required', 'customer_choice').messages({
        'any.only': 'payment_mode must be one of: full_payment, downpayment_required, customer_choice'
    }),
    downpayment_type: Joi.string().trim().lowercase().valid('percentage', 'fixed').allow(null).messages({
        'any.only': 'downpayment_type must be one of: percentage, fixed'
    }),
    // No .when('downpayment_type', ...) requiredness gate here on purpose: a PUT can legitimately
    // submit a partial payload (e.g. only downpayment_rate_bps, with downpayment_type already set
    // by an earlier request), so Joi -- which only ever sees this one request body, never the
    // stored row -- cannot correctly judge "required given the *effective* type." That
    // merged-against-current-row check lives in downpaymentSettingsUseCases.js instead. Joi's job
    // here is shape/bounds only.
    downpayment_rate_bps: Joi.number().integer().min(1).max(MAX_RATE_BPS).allow(null),
    downpayment_fixed_centavos: Joi.number().integer().min(1).max(MAX_CENTAVOS).allow(null),
    min_downpayment_centavos: Joi.number().integer().min(0).max(MAX_CENTAVOS),
    downpayment_refundable: Joi.boolean(),
    allowed_capture_methods: Joi.array().items(Joi.string().trim()).allow(null)
}).min(1).messages({
    'object.min': 'At least one setting must be provided'
});

// Middleware to validate a downpayment-settings update. Same 422 shape/convention as
// settingsValidator.js's validateUpdateSettings.
export const validateUpdateDownpaymentSettings = (req, res, next) => {
    const { error, value } = updateDownpaymentSettingsSchema.validate(req?.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        const errors = error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return res.status(422).json({
            success: false,
            message: 'Validation failed',
            errors,
            timestamp: new Date().toISOString()
        });
    }

    req.validatedData = value;
    next();
};
