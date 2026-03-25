import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import { assertPosRepositoryContract } from '../contracts/posRepository.contract.js';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const buildTransactionInclude = () => ([
    {
        model: dbStore.get('PosTransactionLine'),
        as: 'lines',
        include: [
            {
                model: dbStore.get('Item'),
                as: 'item',
                attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure']
            }
        ]
    },
    {
        model: dbStore.get('User'),
        as: 'cashier',
        attributes: ['user_id', 'username', 'email']
    },
    {
        model: dbStore.get('User'),
        as: 'voidedByUser',
        attributes: ['user_id', 'username']
    }
]);

export const posRepository = {
    async findTransactionByIdempotencyKey(idempotencyKey, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const queryOptions = {
            where: { idempotency_key: idempotencyKey },
            include: buildTransactionInclude()
        };

        if (options.transaction) {
            queryOptions.transaction = options.transaction;
            if (options.lock) {
                queryOptions.lock = options.transaction.LOCK.UPDATE;
            }
        }

        return PosTransaction.findOne(queryOptions);
    },

    async findSellableItemsByIds(itemIds, options = {}) {
        const Item = dbStore.get('Item');
        const queryOptions = {
            where: buildVisibleWhere(
                {
                    item_id: { [Op.in]: itemIds },
                    category: 'product',
                    product_type: 'finished_goods'
                },
                { statusField: 'status', excludeInactiveStatus: true }
            ),
            attributes: [
                'item_id',
                'name',
                'sku_code',
                'unit_of_measure',
                'current_stock',
                'cost_per_unit',
                'default_sale_price',
                'vat_type'
            ]
        };

        if (options.transaction) {
            queryOptions.transaction = options.transaction;
            if (options.lock) {
                queryOptions.lock = options.transaction.LOCK.UPDATE;
            }
        }

        return Item.findAll(queryOptions);
    },

    async nextInvoiceNumber(counterKey, options = {}) {
        const PosInvoiceCounter = dbStore.get('PosInvoiceCounter');
        const transaction = options.transaction;

        let counter = await PosInvoiceCounter.findByPk(counterKey, {
            transaction,
            lock: transaction ? transaction.LOCK.UPDATE : undefined
        });

        if (!counter) {
            counter = await PosInvoiceCounter.create(
                { counter_key: counterKey, current_value: 0 },
                { transaction }
            );
        }

        const currentValue = Number.parseInt(counter.current_value, 10) || 0;
        const nextValue = currentValue + 1;

        await counter.update(
            { current_value: nextValue },
            { transaction }
        );

        return `INV-${String(nextValue).padStart(6, '0')}`;
    },

    async createTransactionWithLines({ header, lines }, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const PosTransactionLine = dbStore.get('PosTransactionLine');
        const transaction = options.transaction;

        const created = await PosTransaction.create(header, { transaction });

        const lineRows = lines.map((line) => ({
            ...line,
            pos_transaction_id: created.pos_transaction_id
        }));
        await PosTransactionLine.bulkCreate(lineRows, { transaction });

        return created.pos_transaction_id;
    },

    async getTransactionById(posTransactionId, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const queryOptions = {
            where: { pos_transaction_id: posTransactionId },
            include: buildTransactionInclude()
        };

        if (options.transaction) {
            queryOptions.transaction = options.transaction;
            if (options.lock) {
                queryOptions.lock = options.transaction.LOCK.UPDATE;
            }
        }

        return PosTransaction.findOne(queryOptions);
    },

    async listTransactions(filters = {}) {
        const PosTransaction = dbStore.get('PosTransaction');

        const page = Number.parseInt(filters.page, 10) || 1;
        const limit = Number.parseInt(filters.limit, 10) || 20;
        const offset = (page - 1) * limit;

        const where = {};
        if (filters.cashier_id) where.cashier_id = Number.parseInt(filters.cashier_id, 10);
        if (filters.payment_type) where.payment_type = filters.payment_type;
        if (filters.order_method) where.order_method = filters.order_method;

        if (filters.date_from || filters.date_to) {
            where.created_at = {};
            if (filters.date_from) where.created_at[Op.gte] = filters.date_from;
            if (filters.date_to) where.created_at[Op.lte] = filters.date_to;
        }

        const { rows, count } = await PosTransaction.findAndCountAll({
            where,
            include: [
                {
                    model: dbStore.get('User'),
                    as: 'cashier',
                    attributes: ['user_id', 'username']
                }
            ],
            order: [['created_at', 'DESC']],
            limit,
            offset
        });

        return {
            transactions: rows,
            pagination: {
                page,
                limit,
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        };
    },

    async getZReadingSummary({ startAt, endAt }) {
        const PosTransaction = dbStore.get('PosTransaction');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

        const where = {
            status: 'completed',
            created_at: {
                [Op.gte]: startAt,
                [Op.lt]: endAt
            }
        };

        const [summaryRow] = await PosTransaction.findAll({
            where,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'transaction_count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('subtotal_amount')), 0), 'subtotal_amount'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('discount_amount')), 0), 'discount_amount'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('vatable_sales')), 0), 'vatable_sales'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('vat_amount')), 0), 'vat_amount'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('vat_exempt_sales')), 0), 'vat_exempt_sales'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('zero_rated_sales')), 0), 'zero_rated_sales'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_amount']
            ],
            raw: true
        });

        const paymentBreakdownRows = await PosTransaction.findAll({
            where,
            attributes: [
                'payment_type',
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'amount']
            ],
            group: ['payment_type'],
            raw: true
        });

        return {
            transaction_count: Number.parseInt(summaryRow?.transaction_count || 0, 10),
            subtotal_amount: round4(summaryRow?.subtotal_amount),
            discount_amount: round4(summaryRow?.discount_amount),
            vatable_sales: round4(summaryRow?.vatable_sales),
            vat_amount: round4(summaryRow?.vat_amount),
            vat_exempt_sales: round4(summaryRow?.vat_exempt_sales),
            zero_rated_sales: round4(summaryRow?.zero_rated_sales),
            total_amount: round4(summaryRow?.total_amount),
            payment_breakdown: paymentBreakdownRows.map((row) => ({
                payment_type: row.payment_type,
                count: Number.parseInt(row.count || 0, 10),
                amount: round4(row.amount)
            }))
        };
    },

    async listCatalog({ search = '', limit = 100 } = {}) {
        const Item = dbStore.get('Item');
        const where = buildVisibleWhere(
            {
                category: 'product',
                product_type: 'finished_goods'
            },
            { statusField: 'status', excludeInactiveStatus: true }
        );

        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { sku_code: { [Op.like]: `%${search}%` } }
            ];
        }

        return Item.findAll({
            where,
            attributes: [
                'item_id',
                'name',
                'sku_code',
                'unit_of_measure',
                'current_stock',
                'cost_per_unit',
                'default_sale_price',
                'vat_type'
            ],
            order: [['name', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 100, 500)
        });
    }
};

assertPosRepositoryContract(posRepository);

