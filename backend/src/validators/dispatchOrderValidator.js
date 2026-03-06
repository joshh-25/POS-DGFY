import Joi from 'joi';

const dispatchLineSchema = Joi.object({
    item_id: Joi.number().integer().positive().required().messages({
        'any.required': 'Item ID is required per line',
        'number.positive': 'Item ID must be positive'
    }),
    qty_ordered: Joi.number().positive().required().messages({
        'any.required': 'Quantity ordered is required per line',
        'number.positive': 'Quantity ordered must be positive'
    }),
    notes: Joi.string().max(500).allow(null, '').messages({
        'string.max': 'Line notes must not exceed 500 characters'
    })
});

const dispatchExecuteLineSchema = Joi.object({
    line_id: Joi.number().integer().positive().required().messages({
        'any.required': 'Line ID is required',
        'number.positive': 'Line ID must be positive'
    }),
    qty_to_dispatch: Joi.number().positive().required().messages({
        'any.required': 'Quantity to dispatch is required',
        'number.positive': 'Quantity to dispatch must be positive'
    }),
    batch_id: Joi.number().integer().positive().allow(null).messages({
        'number.positive': 'Batch ID must be positive'
    })
});

export const createDispatchOrderSchema = Joi.object({
    recipient_name: Joi.string().min(1).max(200).required().messages({
        'any.required': 'Recipient name is required',
        'string.max': 'Recipient name must not exceed 200 characters',
        'string.min': 'Recipient name cannot be empty'
    }),
    recipient_type: Joi.string().valid('external', 'internal').default('external').messages({
        'any.only': 'Recipient type must be external or internal'
    }),
    reference_jo: Joi.string().max(50).allow(null, '').messages({
        'string.max': 'JO reference must not exceed 50 characters'
    }),
    reference_po: Joi.string().max(50).allow(null, '').messages({
        'string.max': 'PO reference must not exceed 50 characters'
    }),
    dispatch_date: Joi.date().iso().required().messages({
        'any.required': 'Dispatch date is required',
        'date.format': 'Dispatch date must be a valid ISO date'
    }),
    notes: Joi.string().max(2000).allow(null, '').messages({
        'string.max': 'Notes must not exceed 2000 characters'
    }),
    lines: Joi.array().items(dispatchLineSchema).min(1).required().messages({
        'array.min': 'At least one line item is required',
        'any.required': 'Line items are required'
    })
});

export const updateDispatchOrderSchema = Joi.object({
    recipient_name: Joi.string().min(1).max(200).messages({
        'string.max': 'Recipient name must not exceed 200 characters'
    }),
    recipient_type: Joi.string().valid('external', 'internal').messages({
        'any.only': 'Recipient type must be external or internal'
    }),
    reference_jo: Joi.string().max(50).allow(null, ''),
    reference_po: Joi.string().max(50).allow(null, ''),
    dispatch_date: Joi.date().iso().messages({
        'date.format': 'Dispatch date must be a valid ISO date'
    }),
    notes: Joi.string().max(2000).allow(null, ''),
    lines: Joi.array().items(dispatchLineSchema).min(1).messages({
        'array.min': 'At least one line item is required'
    })
}).min(1);

export const dispatchLinesSchema = Joi.object({
    lines: Joi.array().items(dispatchExecuteLineSchema).min(1).required().messages({
        'array.min': 'At least one line dispatch entry is required',
        'any.required': 'Lines array is required'
    })
});

export const cancelDispatchOrderSchema = Joi.object({
    reason: Joi.string().min(1).max(500).allow(null, '').messages({
        'string.max': 'Cancellation reason must not exceed 500 characters'
    })
});

// ─────────────────────────────────────────────────────────────
// Middleware wrappers
// ─────────────────────────────────────────────────────────────

const makeValidator = (schema) => (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));
        return res.status(422).json({
            success: false,
            data: null,
            message: 'Validation failed',
            errors,
            timestamp: new Date().toISOString()
        });
    }

    req.validatedData = value;
    next();
};

export const validateCreateDispatchOrder = makeValidator(createDispatchOrderSchema);
export const validateUpdateDispatchOrder = makeValidator(updateDispatchOrderSchema);
export const validateDispatchLines = makeValidator(dispatchLinesSchema);
export const validateCancelDispatchOrder = makeValidator(cancelDispatchOrderSchema);
