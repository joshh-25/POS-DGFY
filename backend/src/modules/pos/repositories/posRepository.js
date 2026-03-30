import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import { assertPosRepositoryContract } from '../contracts/posRepository.contract.js';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toDateStart = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const toDateEnd = (value) => new Date(`${String(value).slice(0, 10)}T23:59:59.999Z`);
const BASE_POS_ITEM_ATTRIBUTES = [
    'item_id',
    'name',
    'sku_code',
    'category',
    'product_type',
    'unit_of_measure',
    'current_stock',
    'cost_per_unit',
    'default_sale_price'
];
const POS_ITEM_ATTRIBUTES_WITH_VAT = [...BASE_POS_ITEM_ATTRIBUTES, 'vat_type'];
const POS_CATALOG_OVERRIDE_ATTRIBUTES = [
    'item_id',
    'pos_visible',
    'pos_image_path',
    'pos_image_url'
];

const isMissingVatTypeColumnError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_BAD_FIELD_ERROR' && message.includes("Unknown column 'vat_type'");
};

const isMissingPosCatalogOverrideTableError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' || message.includes('pos_catalog_overrides');
};

const withLegacyVatFallback = (rows) => rows.map((row) => {
    if (!row) return row;
    if (typeof row.get === 'function' && typeof row.setDataValue === 'function') {
        if (!row.get('vat_type')) {
            row.setDataValue('vat_type', 'vatable');
        }
        return row;
    }
    return {
        ...row,
        vat_type: row.vat_type || 'vatable'
    };
});

const toPlain = (row) => (
    row && typeof row.toJSON === 'function'
        ? row.toJSON()
        : row
);

const resolveDefaultPosVisibility = (item = {}) => (
    item?.category === 'product' && item?.product_type === 'finished_goods'
);

const loadCatalogOverridesMap = async (itemIds = [], options = {}) => {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return new Map();
    }

    const PosCatalogOverride = dbStore.get('PosCatalogOverride');
    if (!PosCatalogOverride) {
        return new Map();
    }

    try {
        const rows = await PosCatalogOverride.findAll({
            where: { item_id: { [Op.in]: itemIds } },
            attributes: POS_CATALOG_OVERRIDE_ATTRIBUTES,
            transaction: options.transaction
        });

        return new Map(rows.map((row) => {
            const payload = toPlain(row);
            return [payload.item_id, payload];
        }));
    } catch (error) {
        if (isMissingPosCatalogOverrideTableError(error)) {
            return new Map();
        }
        throw error;
    }
};

const applyCatalogOverrides = async (items, options = {}) => {
    const normalizedItems = (Array.isArray(items) ? items : []).map((item) => toPlain(item));
    const itemIds = normalizedItems.map((item) => item.item_id);
    const overrideMap = await loadCatalogOverridesMap(itemIds, options);

    return normalizedItems
        .map((item) => {
            const override = overrideMap.get(item.item_id);
            const posVisible = override ? override.pos_visible !== false : resolveDefaultPosVisibility(item);
            return {
                ...item,
                pos_visible: posVisible,
                pos_image_path: override?.pos_image_path || null,
                pos_image_url: override?.pos_image_url || null
            };
        })
        .filter((item) => item.pos_visible !== false);
};

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
    },
    {
        model: dbStore.get('PosTerminalShift'),
        as: 'shift',
        attributes: [
            'pos_terminal_shift_id',
            'business_date',
            'terminal_id',
            'cashier_id',
            'status',
            'opened_at',
            'closed_at'
        ]
    }
]);

export const posRepository = {
    async getItemById(itemId, options = {}) {
        const Item = dbStore.get('Item');
        return Item.findOne({
            where: buildVisibleWhere(
                { item_id: itemId },
                { statusField: 'status', excludeInactiveStatus: false }
            ),
            attributes: ['item_id', 'name', 'category', 'product_type', 'status'],
            transaction: options.transaction
        });
    },

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
                    item_id: { [Op.in]: itemIds }
                },
                { statusField: 'status', excludeInactiveStatus: true }
            ),
            attributes: POS_ITEM_ATTRIBUTES_WITH_VAT
        };

        if (options.transaction) {
            queryOptions.transaction = options.transaction;
            if (options.lock) {
                queryOptions.lock = options.transaction.LOCK.UPDATE;
            }
        }

        try {
            return await applyCatalogOverrides(await Item.findAll(queryOptions), options);
        } catch (error) {
            if (!isMissingVatTypeColumnError(error)) {
                throw error;
            }

            return applyCatalogOverrides(withLegacyVatFallback(await Item.findAll({
                ...queryOptions,
                attributes: BASE_POS_ITEM_ATTRIBUTES
            })), options);
        }
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
        if (filters.status) where.status = filters.status;
        if (filters.search) {
            where.invoice_number = { [Op.like]: `%${String(filters.search).trim()}%` };
        }

        if (filters.date_from || filters.date_to) {
            where.created_at = {};
            if (filters.date_from) where.created_at[Op.gte] = toDateStart(filters.date_from);
            if (filters.date_to) where.created_at[Op.lte] = toDateEnd(filters.date_to);
        }

        const { rows, count } = await PosTransaction.findAndCountAll({
            where,
            include: [
                {
                    model: dbStore.get('User'),
                    as: 'cashier',
                    attributes: ['user_id', 'username']
                },
                {
                    model: dbStore.get('PosTerminalShift'),
                    as: 'shift',
                    attributes: ['pos_terminal_shift_id', 'business_date', 'terminal_id', 'status']
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

    async getZReadingSummary({ startAt, endAt, terminalId = null, cashierId = null, shiftId = null }) {
        const PosTransaction = dbStore.get('PosTransaction');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

        const where = {
            status: 'completed',
            created_at: {
                [Op.gte]: startAt,
                [Op.lt]: endAt
            }
        };
        if (terminalId) where.terminal_id = terminalId;
        if (cashierId) where.cashier_id = cashierId;
        if (shiftId) where.shift_id = shiftId;

        const [summaryRow] = await PosTransaction.findAll({
            where,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'transaction_count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('subtotal_amount')), 0), 'subtotal_amount'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('discount_amount')), 0), 'discount_amount'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('service_fee_amount')), 0), 'service_fee_total'],
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
        const orderMethodBreakdownRows = await PosTransaction.findAll({
            where,
            attributes: [
                'order_method',
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'amount']
            ],
            group: ['order_method'],
            raw: true
        });

        return {
            transaction_count: Number.parseInt(summaryRow?.transaction_count || 0, 10),
            subtotal_amount: round4(summaryRow?.subtotal_amount),
            discount_amount: round4(summaryRow?.discount_amount),
            service_fee_total: round4(summaryRow?.service_fee_total),
            vatable_sales: round4(summaryRow?.vatable_sales),
            vat_amount: round4(summaryRow?.vat_amount),
            vat_exempt_sales: round4(summaryRow?.vat_exempt_sales),
            zero_rated_sales: round4(summaryRow?.zero_rated_sales),
            total_amount: round4(summaryRow?.total_amount),
            payment_breakdown: paymentBreakdownRows.map((row) => ({
                payment_type: row.payment_type,
                count: Number.parseInt(row.count || 0, 10),
                amount: round4(row.amount)
            })),
            order_method_breakdown: orderMethodBreakdownRows.map((row) => ({
                order_method: row.order_method,
                count: Number.parseInt(row.count || 0, 10),
                amount: round4(row.amount)
            }))
        };
    },

    async listCatalog({ search = '', limit = 100, folder_id = null } = {}) {
        const Item = dbStore.get('Item');
        const where = buildVisibleWhere(
            {},
            { statusField: 'status', excludeInactiveStatus: true }
        );

        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { sku_code: { [Op.like]: `%${search}%` } }
            ];
        }
        const folderId = Number.parseInt(folder_id, 10);
        if (Number.isInteger(folderId) && folderId > 0) {
            where.folder_id = folderId;
        }

        const queryOptions = {
            where,
            attributes: POS_ITEM_ATTRIBUTES_WITH_VAT,
            order: [['name', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 100, 500)
        };

        try {
            return await applyCatalogOverrides(await Item.findAll(queryOptions));
        } catch (error) {
            if (!isMissingVatTypeColumnError(error)) {
                throw error;
            }

            return applyCatalogOverrides(withLegacyVatFallback(await Item.findAll({
                ...queryOptions,
                attributes: BASE_POS_ITEM_ATTRIBUTES
            })));
        }
    },

    async listCatalogOverrides({ search = '', limit = 200 } = {}) {
        const Item = dbStore.get('Item');
        const where = buildVisibleWhere({}, { statusField: 'status', excludeInactiveStatus: false });
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { sku_code: { [Op.like]: `%${search}%` } }
            ];
        }

        const items = await Item.findAll({
            where,
            attributes: ['item_id', 'name', 'sku_code', 'category', 'product_type', 'status'],
            order: [['name', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 200, 1000)
        });

        const overrideMap = await loadCatalogOverridesMap(items.map((item) => item.item_id));
        return items.map((item) => {
            const payload = toPlain(item);
            const override = overrideMap.get(payload.item_id);
            return {
                ...payload,
                pos_visible: override ? override.pos_visible !== false : resolveDefaultPosVisibility(payload),
                pos_image_url: override?.pos_image_url || null,
                pos_image_path: override?.pos_image_path || null,
                has_override: Boolean(override)
            };
        });
    },

    async findCatalogOverrideByItemId(itemId, options = {}) {
        const PosCatalogOverride = dbStore.get('PosCatalogOverride');
        if (!PosCatalogOverride) return null;

        try {
            return await PosCatalogOverride.findOne({
                where: { item_id: itemId },
                transaction: options.transaction
            });
        } catch (error) {
            if (isMissingPosCatalogOverrideTableError(error)) {
                return null;
            }
            throw error;
        }
    },

    async upsertCatalogOverride(itemId, payload = {}, options = {}) {
        const PosCatalogOverride = dbStore.get('PosCatalogOverride');
        if (!PosCatalogOverride) {
            throw new Error('POS catalog override model is unavailable');
        }

        const transaction = options.transaction;
        const existing = await this.findCatalogOverrideByItemId(itemId, { transaction });

        const nextPayload = {
            item_id: itemId,
            pos_visible: payload.pos_visible !== false,
            pos_image_path: payload.pos_image_path ?? (existing?.pos_image_path ?? null),
            pos_image_url: payload.pos_image_url ?? (existing?.pos_image_url ?? null)
        };

        if (existing) {
            await existing.update(nextPayload, { transaction });
            return existing;
        }

        return PosCatalogOverride.create(nextPayload, { transaction });
    },

    async updateCatalogImage(itemId, imageData = {}, options = {}) {
        return this.upsertCatalogOverride(itemId, {
            pos_visible: options.keepVisible === false ? false : true,
            pos_image_path: imageData.path || null,
            pos_image_url: imageData.url || null
        }, options);
    },

    async clearCatalogImage(itemId, options = {}) {
        const existing = await this.findCatalogOverrideByItemId(itemId, options);
        if (!existing) return null;
        await existing.update({
            pos_image_path: null,
            pos_image_url: null
        }, { transaction: options.transaction });
        return existing;
    },

    async findOpenTerminalShift({ terminalId = null, cashierId = null } = {}, options = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        const where = { status: 'open' };
        if (terminalId) where.terminal_id = terminalId;
        if (cashierId) where.cashier_id = cashierId;
        return PosTerminalShift.findOne({
            where,
            include: [
                {
                    model: dbStore.get('PosCashDrawerEvent'),
                    as: 'cashEvents',
                    required: false
                }
            ],
            order: [['opened_at', 'DESC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
    },

    async createTerminalShift(payload = {}, options = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        return PosTerminalShift.create(payload, { transaction: options.transaction });
    },

    async getTerminalShiftById(shiftId, options = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        return PosTerminalShift.findByPk(shiftId, {
            include: [
                {
                    model: dbStore.get('PosCashDrawerEvent'),
                    as: 'cashEvents',
                    required: false
                }
            ],
            order: [[{ model: dbStore.get('PosCashDrawerEvent'), as: 'cashEvents' }, 'created_at', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
    },

    async createCashDrawerEvent(payload = {}, options = {}) {
        const PosCashDrawerEvent = dbStore.get('PosCashDrawerEvent');
        return PosCashDrawerEvent.create(payload, { transaction: options.transaction });
    },

    async listCashDrawerEventsByShiftId(shiftId, options = {}) {
        const PosCashDrawerEvent = dbStore.get('PosCashDrawerEvent');
        return PosCashDrawerEvent.findAll({
            where: { pos_terminal_shift_id: shiftId },
            order: [['created_at', 'ASC']],
            transaction: options.transaction
        });
    },

    async getShiftCashSalesTotal(shiftId, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const [row] = await PosTransaction.findAll({
            where: {
                shift_id: shiftId,
                status: 'completed',
                payment_type: 'cash'
            },
            attributes: [
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'cash_sales_total']
            ],
            raw: true,
            transaction: options.transaction
        });
        return round4(row?.cash_sales_total);
    },

    async closeTerminalShift(shiftId, payload = {}, options = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        const shift = await PosTerminalShift.findByPk(shiftId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!shift) return null;
        await shift.update(payload, { transaction: options.transaction });
        return shift;
    }
};

assertPosRepositoryContract(posRepository);
