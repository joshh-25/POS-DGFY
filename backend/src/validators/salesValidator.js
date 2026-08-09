import Joi from 'joi';
import { ALL_ORDER_METHODS } from '../modules/shared/constants/orderMethods.js';

const PAYMENT_TYPES = ['cash', 'gcash', 'maya', 'card', 'bank_transfer'];
const ORDER_METHOD_FILTERS = ALL_ORDER_METHODS;
const POS_ORDER_SOURCES = ['in_store', 'online_store'];
const SALES_SOURCES = ['ALL', 'POS', 'DISPATCH'];
const SORT_BY_VALUES = ['occurred_at', 'gross_sales', 'cogs', 'gross_profit', 'reference_no'];
const SORT_ORDER_VALUES = ['asc', 'desc'];

const listSalesTransactionsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(200).default(20),
    source: Joi.string().trim().uppercase().valid(...SALES_SOURCES).optional(),
    source_id: Joi.number().integer().positive().optional(),
    search: Joi.string().trim().allow('', null).optional(),
    status: Joi.string().trim().max(60).optional(),
    payment_type: Joi.string().valid(...PAYMENT_TYPES).optional(),
    order_method: Joi.string().valid(...ORDER_METHOD_FILTERS).optional(),
    pos_order_source: Joi.string().valid(...POS_ORDER_SOURCES).optional(),
    date_from: Joi.date().iso().optional(),
    date_to: Joi.date().iso().min(Joi.ref('date_from')).optional(),
    sort_by: Joi.string().valid(...SORT_BY_VALUES).optional(),
    sort_order: Joi.string().lowercase().valid(...SORT_ORDER_VALUES).optional(),
    export: Joi.string().trim().lowercase().valid('csv').optional()
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

export const validateSalesTransactionsQuery = (req, res, next) => {
    const { error, value } = listSalesTransactionsQuerySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        return res.status(422).json(buildValidationErrorResponse(error));
    }

    req.validatedQuery = value;
    return next();
};

export default {
    validateSalesTransactionsQuery
};
