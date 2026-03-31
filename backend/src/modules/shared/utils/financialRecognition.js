import { Op } from 'sequelize';

export const FINANCIALLY_RECOGNIZED_SALES_OR_CLAUSE = Object.freeze([
    { order_source: 'in_store' },
    { order_source: null },
    { order_source: 'online_store', fulfillment_status: 'completed' }
]);

export const buildFinanciallyRecognizedSalesWhere = (baseWhere = {}) => ({
    ...baseWhere,
    status: 'completed',
    [Op.or]: FINANCIALLY_RECOGNIZED_SALES_OR_CLAUSE
});
