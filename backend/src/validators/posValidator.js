import Joi from 'joi';

const ORDER_METHODS = ['dine_in', 'takeout', 'delivery', 'online'];
const PAYMENT_TYPES = ['cash', 'gcash', 'maya', 'card', 'bank_transfer'];

const checkoutLineSchema = Joi.object({
    item_id: Joi.number().integer().positive().required().messages({
        'any.required': 'Item ID is required',
        'number.positive': 'Item ID must be positive'
    }),
    quantity: Joi.number().positive().required().messages({
        'any.required': 'Quantity is required',
        'number.positive': 'Quantity must be positive'
    }),
    sale_price: Joi.number().min(0).precision(4).allow(null).optional().messages({
        'number.min': 'Sale price must be 0 or greater'
    })
});

const checkoutPosSchema = Joi.object({
    idempotency_key: Joi.string().trim().min(8).max(120).required().messages({
        'any.required': 'idempotency_key is required'
    }),
    terminal_id: Joi.string().trim().max(100).allow(null, ''),
    order_method: Joi.string().valid(...ORDER_METHODS).default('dine_in'),
    payment_type: Joi.string().valid(...PAYMENT_TYPES).default('cash'),
    discount_amount: Joi.number().min(0).precision(4).default(0),
    lines: Joi.array().items(checkoutLineSchema).min(1).required().messages({
        'array.min': 'At least one line item is required'
    })
});

const listTransactionsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(20),
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().min(Joi.ref('date_from')).optional(),
    cashier_id: Joi.number().integer().positive().optional(),
    payment_type: Joi.string().valid(...PAYMENT_TYPES).optional(),
    order_method: Joi.string().valid(...ORDER_METHODS).optional()
});

const posCatalogQuerySchema = Joi.object({
    search: Joi.string().allow('', null).default(''),
    limit: Joi.number().integer().min(1).max(500).default(100)
});

const posTransactionIdParamSchema = Joi.object({
    id: Joi.number().integer().positive().required()
});

const zReadingDateParamSchema = Joi.object({
    date: Joi.date().iso().required()
});

const closeDaySchema = Joi.object({
    business_date: Joi.date().iso().optional()
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

export const validatePosCheckout = validateSchema(checkoutPosSchema, 'body', 'validatedData');
export const validatePosTransactionsQuery = validateSchema(listTransactionsQuerySchema, 'query', 'validatedQuery');
export const validatePosCatalogQuery = validateSchema(posCatalogQuerySchema, 'query', 'validatedQuery');
export const validatePosTransactionIdParam = validateSchema(posTransactionIdParamSchema, 'params', 'validatedParams');
export const validateZReadingDateParam = validateSchema(zReadingDateParamSchema, 'params', 'validatedParams');
export const validateCloseDayBody = validateSchema(closeDaySchema, 'body', 'validatedData');
