import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import { assertPosRepositoryContract } from '../contracts/posRepository.contract.js';
import { buildFinanciallyRecognizedSalesWhere } from '../../shared/utils/financialRecognition.js';
import { resolveCatalogVisibility } from '../../shared/utils/catalogVisibilityPolicy.js';
import {
    detectBarcodeSymbology,
    isBarcodeScopeAllowedForSurface,
    normalizeBarcodeValue
} from '../../shared/utils/barcodePolicy.js';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toDateStart = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const toDateEnd = (value) => new Date(`${String(value).slice(0, 10)}T23:59:59.999Z`);
const toNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};
const toPositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};
const TERMINAL_REGISTRY_MODE_VALUES = new Set(['warn', 'enforce']);
const LOW_CONFIDENCE_BACKFILL_SOURCES = new Set(['active_location_fallback', 'no_resolution']);
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const parseJsonLoosely = (value) => {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
        const first = JSON.parse(value);
        if (typeof first === 'string') {
            try {
                return JSON.parse(first);
            } catch {
                return first;
            }
        }
        return first;
    } catch {
        return null;
    }
};
const normalizeTerminalRegistry = (rawValue) => {
    const parsed = parseJsonLoosely(rawValue);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set();
    const normalized = [];
    parsed.forEach((entry) => {
        const terminalId = String(entry?.terminal_id || '')
            .trim()
            .toUpperCase();
        if (!terminalId || !TERMINAL_ID_PATTERN.test(terminalId) || seen.has(terminalId)) {
            return;
        }
        if (entry?.is_active === false) {
            return;
        }
        const locationId = toPositiveInt(entry?.location_id);
        seen.add(terminalId);
        normalized.push({
            terminal_id: terminalId,
            label: String(entry?.label || '').trim(),
            location_id: locationId
        });
    });
    return normalized;
};
const toPositiveNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};
const toBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (value == null) return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    return fallback;
};
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

const safeGetModel = (name) => {
    try {
        return dbStore.get(name);
    } catch {
        return null;
    }
};

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

const isMissingItemLocationStockSchemaError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    if (code === 'ER_NO_SUCH_TABLE' && message.includes('item_location_stocks')) {
        return true;
    }
    if (code === 'ER_BAD_FIELD_ERROR' && (
        message.includes('item_location_stocks')
        || message.includes("Unknown column 'quantity_on_hand'")
        || message.includes("Unknown column 'location_id'")
        || message.includes("Unknown column 'item_id'")
    )) {
        return true;
    }
    return false;
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

const buildServiceDetailInclude = () => {
    const ServiceItemDetail = safeGetModel('ServiceItemDetail');
    return ServiceItemDetail
        ? [{
            model: ServiceItemDetail,
            as: 'serviceDetail',
            attributes: ['bookable', 'visible_in_pos', 'visible_in_storefront'],
            required: false
        }]
        : [];
};

const buildFnbCatalogIncludes = () => {
    const FnbModifierGroup = safeGetModel('FnbModifierGroup');
    const FnbModifierOption = safeGetModel('FnbModifierOption');
    const FnbItemKitchenRoute = safeGetModel('FnbItemKitchenRoute');
    const FnbKitchenStation = safeGetModel('FnbKitchenStation');
    const includes = [];
    if (FnbModifierGroup && FnbModifierOption) {
        includes.push({
            model: FnbModifierGroup,
            as: 'fnbModifierGroups',
            required: false,
            through: {
                attributes: ['is_required_override', 'sort_order']
            },
            include: [{
                model: FnbModifierOption,
                as: 'options',
                required: false
            }]
        });
    }
    if (FnbItemKitchenRoute) {
        includes.push({
            model: FnbItemKitchenRoute,
            as: 'fnbKitchenRoutes',
            required: false,
            include: FnbKitchenStation
                ? [{ model: FnbKitchenStation, as: 'station', required: false }]
                : []
        });
    }
    return includes;
};

const buildPosReadiness = ({ item, override }) => {
    const payload = toPlain(item) || {};
    const isServiceItem = String(payload.category || '').trim().toLowerCase() === 'service';
    const currentStock = toNumber(payload.current_stock, 0);
    const defaultSalePrice = toPositiveNumber(payload.default_sale_price);
    const status = String(payload.status || '').trim().toLowerCase();

    const checks = {
        pos_visible: resolveCatalogVisibility({ item: payload, override, surface: 'pos' }) !== false,
        has_sale_price: defaultSalePrice > 0,
        stock_non_negative: currentStock >= 0,
        status_active: status === 'active',
        has_available_stock: isServiceItem || currentStock > 0
    };

    const missingRequirements = [];
    if (!checks.pos_visible) {
        missingRequirements.push({
            code: 'POS_VISIBILITY_DISABLED',
            label: 'Enable POS visibility',
            fix_hint: 'Turn on Show in POS Menu for this item.'
        });
    }
    if (!checks.has_sale_price) {
        missingRequirements.push({
            code: 'SALE_PRICE_MISSING',
            label: 'Set a sale price',
            fix_hint: 'Set default_sale_price above zero before selling in POS.'
        });
    }
    if (!checks.stock_non_negative) {
        missingRequirements.push({
            code: 'STOCK_INVALID',
            label: 'Fix stock value',
            fix_hint: 'Stock cannot be negative.'
        });
    }
    if (!checks.status_active) {
        missingRequirements.push({
            code: 'ITEM_NOT_ACTIVE',
            label: 'Activate item',
            fix_hint: 'Only active items are considered POS-ready.'
        });
    }

    const checkValues = Object.values(checks);
    const passingCount = checkValues.filter(Boolean).length;
    const score = Math.round((passingCount / checkValues.length) * 100);

    return {
        ready: missingRequirements.length === 0,
        state: missingRequirements.length === 0 ? 'ready' : 'needs_attention',
        score,
        checks,
        missing_requirements: missingRequirements
    };
};

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
            const posVisible = resolveCatalogVisibility({ item, override, surface: 'pos' });
            return {
                ...item,
                pos_visible: posVisible,
                pos_image_path: override?.pos_image_path || null,
                pos_image_url: override?.pos_image_url || null
            };
        })
        .filter((item) => item.pos_visible !== false);
};

const loadLocationStockMap = async (itemIds = [], locationId = null, options = {}) => {
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) {
        return {
            stockMap: new Map(),
            locationScopeResolved: false
        };
    }
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return {
            stockMap: new Map(),
            locationScopeResolved: true
        };
    }

    const ItemLocationStock = dbStore.get('ItemLocationStock');
    if (!ItemLocationStock) {
        return {
            stockMap: new Map(),
            locationScopeResolved: false
        };
    }
    try {
        const rows = await ItemLocationStock.findAll({
            where: {
                location_id: normalizedLocationId,
                item_id: { [Op.in]: itemIds }
            },
            attributes: ['item_id', 'quantity_on_hand'],
            transaction: options.transaction
        });

        return {
            stockMap: new Map(rows.map((row) => {
                const payload = toPlain(row);
                return [Number(payload.item_id), Number(payload.quantity_on_hand || 0)];
            })),
            locationScopeResolved: true
        };
    } catch (error) {
        if (isMissingItemLocationStockSchemaError(error)) {
            return {
                stockMap: new Map(),
                locationScopeResolved: false
            };
        }
        throw error;
    }
};

const applyLocationStockMap = (items = [], locationStockMap = new Map()) => (
    (Array.isArray(items) ? items : []).map((item) => {
        const payload = toPlain(item);
        const isServiceItem = String(payload.category || '').trim().toLowerCase() === 'service';
        const mappedStock = locationStockMap.get(Number(payload.item_id));
        const stockValue = Number.isFinite(mappedStock) ? Math.max(0, mappedStock) : 0;
        return {
            ...payload,
            current_stock: isServiceItem ? 0 : stockValue
        };
    })
);

const buildTransactionInclude = () => ([
    {
        model: dbStore.get('PosTransactionLine'),
        as: 'lines',
        include: [
            {
                model: dbStore.get('Item'),
                as: 'item',
                attributes: ['item_id', 'name', 'sku_code', 'category', 'unit_of_measure']
            }
        ]
    },
    {
        model: dbStore.get('TenantLocation'),
        as: 'location',
        attributes: [
            'location_id',
            'name',
            'address_line',
            'delivery_radius_km',
            'is_open',
            'is_active'
        ]
    },
    {
        model: dbStore.get('StoreCustomer'),
        as: 'storeCustomer',
        attributes: ['customer_id', 'email', 'name', 'phone']
    },
    {
        model: dbStore.get('FnbCheck'),
        as: 'fnbCheck',
        required: false,
        attributes: ['check_id', 'table_id', 'server_id', 'guest_count', 'status', 'order_method']
    },
    {
        model: dbStore.get('FnbDiningTable'),
        as: 'fnbTable',
        required: false,
        attributes: ['table_id', 'table_number', 'label', 'seat_count', 'status']
    },
    {
        model: dbStore.get('User'),
        as: 'fnbServer',
        required: false,
        attributes: ['user_id', 'username', 'email']
    },
    {
        model: dbStore.get('FnbRestaurantServiceChargeSnapshot'),
        as: 'restaurantServiceChargeSnapshot',
        required: false
    },
    {
        model: dbStore.get('User'),
        as: 'acceptedByUser',
        attributes: ['user_id', 'username', 'email']
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
            'location_id',
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
        const normalizedLocationId = Number.parseInt(options.locationId, 10);
        const queryOptions = {
            where: buildVisibleWhere(
                {
                    item_id: { [Op.in]: itemIds }
                },
                { statusField: 'status', excludeInactiveStatus: true }
            ),
            attributes: POS_ITEM_ATTRIBUTES_WITH_VAT,
            include: [
                ...buildServiceDetailInclude(),
                ...buildFnbCatalogIncludes()
            ]
        };

        if (options.transaction) {
            queryOptions.transaction = options.transaction;
            if (options.lock) {
                queryOptions.lock = options.transaction.LOCK.UPDATE;
            }
        }

        try {
            const catalogItems = await applyCatalogOverrides(await Item.findAll(queryOptions), options);
            const stockMap = await loadLocationStockMap(
                catalogItems.map((item) => Number(item.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && stockMap.locationScopeResolved
                ? applyLocationStockMap(catalogItems, stockMap.stockMap)
                : catalogItems;
        } catch (error) {
            if (!isMissingVatTypeColumnError(error)) {
                throw error;
            }

            const catalogItems = await applyCatalogOverrides(withLegacyVatFallback(await Item.findAll({
                ...queryOptions,
                attributes: BASE_POS_ITEM_ATTRIBUTES
            })), options);
            const stockMap = await loadLocationStockMap(
                catalogItems.map((item) => Number(item.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && stockMap.locationScopeResolved
                ? applyLocationStockMap(catalogItems, stockMap.stockMap)
                : catalogItems;
        }
    },

    async nextInvoiceNumber(counterKey, options = {}) {
        const PosInvoiceCounter = dbStore.get('PosInvoiceCounter');
        const transaction = options.transaction;
        const prefix = String(options.prefix || 'INV').trim().toUpperCase() || 'INV';

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

        return `${prefix}-${String(nextValue).padStart(6, '0')}`;
    },

    async incrementPersistentCounter(counterKey, incrementBy = 1, options = {}) {
        const PosInvoiceCounter = dbStore.get('PosInvoiceCounter');
        const transaction = options.transaction;
        const key = String(counterKey || '').trim();
        const safeIncrement = Number.parseInt(incrementBy, 10);

        if (!key) {
            throw new Error('counterKey is required');
        }
        if (!Number.isInteger(safeIncrement) || safeIncrement <= 0) {
            throw new Error('incrementBy must be a positive integer');
        }

        let counter = await PosInvoiceCounter.findByPk(key, {
            transaction,
            lock: transaction ? transaction.LOCK.UPDATE : undefined
        });

        if (!counter) {
            counter = await PosInvoiceCounter.create(
                { counter_key: key, current_value: 0 },
                { transaction }
            );
        }

        const currentValue = Number.parseInt(counter.current_value, 10) || 0;
        const nextValue = currentValue + safeIncrement;
        await counter.update(
            { current_value: nextValue },
            { transaction }
        );

        return nextValue;
    },

    async getPersistentCounterValue(counterKey, options = {}) {
        const PosInvoiceCounter = dbStore.get('PosInvoiceCounter');
        const key = String(counterKey || '').trim();
        if (!key) return 0;

        const counter = await PosInvoiceCounter.findByPk(key, {
            transaction: options.transaction
        });
        if (!counter) return 0;

        return Number.parseInt(counter.current_value, 10) || 0;
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

    async listProductCompositionsForItems(itemIds = [], options = {}) {
        const ProductComposition = safeGetModel('ProductComposition');
        const Item = safeGetModel('Item');
        const normalizedItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
            .map((itemId) => Number.parseInt(itemId, 10))
            .filter((itemId) => Number.isInteger(itemId) && itemId > 0))];
        if (!ProductComposition || normalizedItemIds.length === 0) return [];
        const rows = await ProductComposition.findAll({
            where: {
                product_id: { [Op.in]: normalizedItemIds },
                composition_type: 'ingredient'
            },
            include: Item
                ? [{
                    model: Item,
                    as: 'ingredient',
                    required: false,
                    attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'current_stock', 'category']
                }]
                : [],
            order: [['product_id', 'ASC'], ['composition_id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async getFnbTableById(tableId, options = {}) {
        const FnbDiningTable = dbStore.get('FnbDiningTable');
        if (!FnbDiningTable) return null;
        const row = await FnbDiningTable.findByPk(tableId, {
            include: [{ model: dbStore.get('FnbDiningArea'), as: 'area', required: false }],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createFnbServiceChargeSnapshot(payload = {}, options = {}) {
        const FnbRestaurantServiceChargeSnapshot = dbStore.get('FnbRestaurantServiceChargeSnapshot');
        if (!FnbRestaurantServiceChargeSnapshot) return null;
        const row = await FnbRestaurantServiceChargeSnapshot.create(payload, {
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async settleFnbCheck({ checkId, posTransactionId }, options = {}) {
        const FnbCheck = dbStore.get('FnbCheck');
        if (!FnbCheck) return null;
        const normalizedCheckId = toPositiveInt(checkId);
        if (!normalizedCheckId) return null;
        const row = await FnbCheck.findByPk(normalizedCheckId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update({
            status: 'paid',
            pos_transaction_id: toPositiveInt(posTransactionId),
            closed_at: new Date()
        }, { transaction: options.transaction });
        return toPlain(row);
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
        const cashierId = Number.parseInt(filters.cashier_id, 10);
        if (Number.isInteger(cashierId) && cashierId > 0) {
            where[Op.or] = [
                { cashier_id: cashierId },
                { accepted_by: cashierId }
            ];
        }
        if (filters.payment_type) where.payment_type = filters.payment_type;
        if (filters.order_method) where.order_method = filters.order_method;
        if (filters.order_source) where.order_source = filters.order_source;
        if (filters.status) where.status = filters.status;
        if (filters.search) {
            where.invoice_number = { [Op.like]: `%${String(filters.search).trim()}%` };
        }
        const locationId = Number.parseInt(filters.location_id, 10);
        if (Number.isInteger(locationId) && locationId > 0) {
            where.location_id = locationId;
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
                    model: dbStore.get('User'),
                    as: 'acceptedByUser',
                    attributes: ['user_id', 'username']
                },
                {
                    model: dbStore.get('PosTerminalShift'),
                    as: 'shift',
                    attributes: ['pos_terminal_shift_id', 'business_date', 'terminal_id', 'location_id', 'status']
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

    async getZReadingSummary({ startAt, endAt, terminalId = null, cashierId = null, shiftId = null, locationId = null }, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

        const where = buildFinanciallyRecognizedSalesWhere({
            created_at: {
                [Op.gte]: startAt,
                [Op.lt]: endAt
            }
        });
        if (terminalId) where.terminal_id = terminalId;
        if (cashierId) where.cashier_id = cashierId;
        if (shiftId) where.shift_id = shiftId;
        if (locationId) where.location_id = locationId;

        const [summaryRow] = await PosTransaction.findAll({
            where,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'transaction_count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('subtotal_amount')), 0), 'subtotal_amount'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('discount_amount')), 0), 'discount_amount'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('service_fee_amount')), 0), 'service_fee_total'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('restaurant_service_charge_amount')), 0), 'restaurant_service_charge_total'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('vatable_sales')), 0), 'vatable_sales'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('vat_amount')), 0), 'vat_amount'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('vat_exempt_sales')), 0), 'vat_exempt_sales'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('zero_rated_sales')), 0), 'zero_rated_sales'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_amount']
            ],
            raw: true,
            transaction: options.transaction
        });

        const paymentBreakdownRows = await PosTransaction.findAll({
            where,
            attributes: [
                'payment_type',
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'amount']
            ],
            group: ['payment_type'],
            raw: true,
            transaction: options.transaction
        });
        const orderMethodBreakdownRows = await PosTransaction.findAll({
            where,
            attributes: [
                'order_method',
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'amount']
            ],
            group: ['order_method'],
            raw: true,
            transaction: options.transaction
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

    async createZReadingSnapshot(payload = {}, options = {}) {
        const PosZReadingSnapshot = dbStore.get('PosZReadingSnapshot');
        const created = await PosZReadingSnapshot.create(payload, {
            transaction: options.transaction
        });
        return toPlain(created);
    },

    async getLatestZReadingSnapshotByBusinessDate(businessDate, options = {}) {
        const PosZReadingSnapshot = dbStore.get('PosZReadingSnapshot');
        const row = await PosZReadingSnapshot.findOne({
            where: {
                business_date: businessDate,
                reading_identifier: { [Op.like]: 'ZR-%' }
            },
            order: [['generated_at', 'DESC'], ['pos_z_reading_snapshot_id', 'DESC']],
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async getTerminalIdentityPolicySettings(options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        if (!SystemSetting) {
            return {
                mode: 'warn',
                active_registry: [],
                binding_enforced: false
            };
        }

        const rows = await SystemSetting.findAll({
            where: {
                setting_key: {
                    [Op.in]: [
                        'pos_terminal_registry_mode',
                        'pos_terminal_registry',
                        'pos_terminal_location_binding_enforced'
                    ]
                }
            },
            attributes: ['setting_key', 'setting_value', 'data_type'],
            transaction: options.transaction
        });

        const lookup = new Map(rows.map((row) => [
            String(row.setting_key || ''),
            toPlain(row)
        ]));
        const rawMode = String(lookup.get('pos_terminal_registry_mode')?.setting_value || '')
            .trim()
            .toLowerCase();
        const mode = TERMINAL_REGISTRY_MODE_VALUES.has(rawMode) ? rawMode : 'warn';

        const rawRegistrySetting = lookup.get('pos_terminal_registry');
        const parsedRegistry = rawRegistrySetting?.data_type === 'json'
            ? parseJsonLoosely(rawRegistrySetting.setting_value)
            : rawRegistrySetting?.setting_value;
        const bindingEnforced = toBoolean(
            lookup.get('pos_terminal_location_binding_enforced')?.setting_value,
            false
        );

        return {
            mode,
            active_registry: normalizeTerminalRegistry(parsedRegistry),
            binding_enforced: bindingEnforced
        };
    },

    async getShiftLocationBindingReadinessSummary(options = {}) {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        if (!sequelize) {
            return {
                total_shifts: 0,
                unresolved_count: 0,
                low_confidence_count: 0,
                source_counts: {},
                ready_for_strict_mode: false
            };
        }

        try {
            const [latestMigrationTagRows] = await sequelize.query(`
                SELECT migration_tag
                FROM pos_shift_location_backfill_audit
                ORDER BY pos_shift_location_backfill_audit_id DESC
                LIMIT 1
            `, { transaction: options.transaction });
            const latestMigrationTag = latestMigrationTagRows?.[0]?.migration_tag || null;

            if (!latestMigrationTag) {
                const [fallbackCountsRows] = await sequelize.query(`
                    SELECT
                        COUNT(*) AS total_shifts,
                        SUM(CASE WHEN location_id IS NULL THEN 1 ELSE 0 END) AS unresolved_count
                    FROM pos_terminal_shifts
                `, { transaction: options.transaction });
                const totalShifts = Number.parseInt(fallbackCountsRows?.[0]?.total_shifts || 0, 10) || 0;
                const unresolvedCount = Number.parseInt(fallbackCountsRows?.[0]?.unresolved_count || 0, 10) || 0;
                return {
                    total_shifts: totalShifts,
                    unresolved_count: unresolvedCount,
                    low_confidence_count: unresolvedCount,
                    source_counts: {},
                    ready_for_strict_mode: unresolvedCount === 0
                };
            }

            const [summaryRows] = await sequelize.query(`
                SELECT
                    COUNT(*) AS total_shifts,
                    SUM(CASE WHEN s.location_id IS NULL THEN 1 ELSE 0 END) AS unresolved_count,
                    SUM(CASE WHEN a.resolution_source IN ('active_location_fallback', 'no_resolution') THEN 1 ELSE 0 END) AS low_confidence_count
                FROM pos_terminal_shifts s
                LEFT JOIN (
                    SELECT audit.*
                    FROM pos_shift_location_backfill_audit audit
                    INNER JOIN (
                        SELECT shift_id, MAX(pos_shift_location_backfill_audit_id) AS latest_id
                        FROM pos_shift_location_backfill_audit
                        WHERE migration_tag = :migrationTag
                        GROUP BY shift_id
                    ) latest ON latest.latest_id = audit.pos_shift_location_backfill_audit_id
                ) a ON a.shift_id = s.pos_terminal_shift_id
            `, {
                replacements: { migrationTag: latestMigrationTag },
                transaction: options.transaction
            });

            const [sourceRows] = await sequelize.query(`
                SELECT
                    a.resolution_source AS resolution_source,
                    COUNT(*) AS count
                FROM (
                    SELECT audit.*
                    FROM pos_shift_location_backfill_audit audit
                    INNER JOIN (
                        SELECT shift_id, MAX(pos_shift_location_backfill_audit_id) AS latest_id
                        FROM pos_shift_location_backfill_audit
                        WHERE migration_tag = :migrationTag
                        GROUP BY shift_id
                    ) latest ON latest.latest_id = audit.pos_shift_location_backfill_audit_id
                ) a
                GROUP BY a.resolution_source
            `, {
                replacements: { migrationTag: latestMigrationTag },
                transaction: options.transaction
            });

            const sourceCounts = {};
            sourceRows.forEach((row) => {
                const source = String(row?.resolution_source || '').trim();
                if (!source) return;
                sourceCounts[source] = Number.parseInt(row?.count || 0, 10) || 0;
            });

            const totalShifts = Number.parseInt(summaryRows?.[0]?.total_shifts || 0, 10) || 0;
            const unresolvedCount = Number.parseInt(summaryRows?.[0]?.unresolved_count || 0, 10) || 0;
            const lowConfidenceCount = Number.parseInt(summaryRows?.[0]?.low_confidence_count || 0, 10) || 0;
            const lowConfidenceFromSources = Array.from(LOW_CONFIDENCE_BACKFILL_SOURCES).reduce(
                (acc, source) => acc + (sourceCounts[source] || 0),
                0
            );
            const normalizedLowConfidenceCount = Math.max(lowConfidenceCount, lowConfidenceFromSources);

            return {
                migration_tag: latestMigrationTag,
                total_shifts: totalShifts,
                unresolved_count: unresolvedCount,
                low_confidence_count: normalizedLowConfidenceCount,
                source_counts: sourceCounts,
                ready_for_strict_mode: unresolvedCount === 0 && normalizedLowConfidenceCount === 0
            };
        } catch {
            return {
                total_shifts: 0,
                unresolved_count: 0,
                low_confidence_count: 0,
                source_counts: {},
                ready_for_strict_mode: false,
                error: 'READINESS_SUMMARY_UNAVAILABLE'
            };
        }
    },

    async resolveCatalogScan({ code, location_id = null } = {}) {
        const ItemBarcode = dbStore.get('ItemBarcode');
        const Item = dbStore.get('Item');
        const normalizedCode = normalizeBarcodeValue(code);
        if (!normalizedCode) {
            return {
                status: 'not_found',
                reason_code: 'BARCODE_NOT_FOUND',
                normalized_code: null
            };
        }

        const rows = await ItemBarcode.findAll({
            where: {
                normalized_code: normalizedCode,
                is_active: true
            },
            include: [{
                model: Item,
                as: 'item',
                attributes: POS_ITEM_ATTRIBUTES_WITH_VAT.includes('status')
                    ? POS_ITEM_ATTRIBUTES_WITH_VAT
                    : [...POS_ITEM_ATTRIBUTES_WITH_VAT, 'status'],
                include: buildServiceDetailInclude(),
                required: false
            }],
            order: [
                ['is_primary', 'DESC'],
                ['updated_at', 'DESC'],
                ['item_barcode_id', 'DESC']
            ],
            limit: 5
        });

        if (rows.length === 0) {
            return {
                status: 'not_found',
                reason_code: 'BARCODE_NOT_FOUND',
                normalized_code: normalizedCode,
                symbology: detectBarcodeSymbology(code)
            };
        }

        const surfaceRows = rows.filter((row) => (
            isBarcodeScopeAllowedForSurface(row.scope, 'pos')
        ));
        if (surfaceRows.length === 0) {
            return {
                status: 'blocked',
                reason_code: 'BARCODE_SCOPE_NOT_POS',
                normalized_code: normalizedCode,
                symbology: detectBarcodeSymbology(code),
                blocked_scopes: rows.map((row) => row.scope).filter(Boolean)
            };
        }

        const itemIds = Array.from(new Set(surfaceRows
            .map((row) => Number(row.item_id))
            .filter((itemId) => Number.isInteger(itemId) && itemId > 0)));
        if (itemIds.length > 1) {
            return {
                status: 'conflict',
                reason_code: 'BARCODE_CONFLICT',
                normalized_code: normalizedCode,
                matches: surfaceRows.map((row) => {
                    const payload = toPlain(row);
                    return {
                        item_barcode_id: payload.item_barcode_id,
                        item_id: payload.item_id,
                        code: payload.code,
                        source: payload.source,
                        scope: payload.scope,
                        packaging_level: payload.packaging_level,
                        quantity_multiplier: Number(payload.quantity_multiplier || 1),
                        item: payload.item || null
                    };
                })
            };
        }

        const barcode = toPlain(surfaceRows[0]);
        const itemPayload = barcode?.item || null;
        if (!itemPayload) {
            return {
                status: 'not_found',
                reason_code: 'BARCODE_ITEM_NOT_FOUND',
                normalized_code: normalizedCode
            };
        }

        const overrideMap = await loadCatalogOverridesMap([itemPayload.item_id]);
        const override = overrideMap.get(itemPayload.item_id);
        const stockMap = await loadLocationStockMap([itemPayload.item_id], location_id);
        const [itemWithLocationStock] = Number.isInteger(Number.parseInt(location_id, 10)) && stockMap.locationScopeResolved
            ? applyLocationStockMap([itemPayload], stockMap.stockMap)
            : [itemPayload];
        const posVisible = resolveCatalogVisibility({ item: itemWithLocationStock, override, surface: 'pos' });
        const readiness = buildPosReadiness({ item: itemWithLocationStock, override });

        return {
            status: 'resolved',
            reason_code: null,
            normalized_code: normalizedCode,
            barcode: {
                item_barcode_id: barcode.item_barcode_id,
                item_id: barcode.item_id,
                code: barcode.code,
                normalized_code: barcode.normalized_code,
                symbology: barcode.symbology,
                source: barcode.source,
                scope: barcode.scope,
                packaging_level: barcode.packaging_level,
                quantity_multiplier: Number(barcode.quantity_multiplier || 1),
                is_primary: barcode.is_primary === true
            },
            item: {
                ...itemWithLocationStock,
                pos_visible: posVisible,
                pos_image_path: override?.pos_image_path || null,
                pos_image_url: override?.pos_image_url || null,
                pos_readiness: readiness
            }
        };
    },

    async listCatalog({ search = '', limit = 100, folder_id = null, location_id = null } = {}) {
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
            include: [
                ...buildServiceDetailInclude(),
                ...buildFnbCatalogIncludes()
            ],
            order: [['name', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 100, 500)
        };

        try {
            const catalogItems = await applyCatalogOverrides(await Item.findAll(queryOptions));
            const stockMap = await loadLocationStockMap(
                catalogItems.map((item) => Number(item.item_id)),
                location_id
            );
            const normalizedLocationId = Number.parseInt(location_id, 10);
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && stockMap.locationScopeResolved
                ? applyLocationStockMap(catalogItems, stockMap.stockMap)
                : catalogItems;
        } catch (error) {
            if (!isMissingVatTypeColumnError(error)) {
                throw error;
            }

            const catalogItems = await applyCatalogOverrides(withLegacyVatFallback(await Item.findAll({
                ...queryOptions,
                attributes: BASE_POS_ITEM_ATTRIBUTES
            })));
            const stockMap = await loadLocationStockMap(
                catalogItems.map((item) => Number(item.item_id)),
                location_id
            );
            const normalizedLocationId = Number.parseInt(location_id, 10);
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && stockMap.locationScopeResolved
                ? applyLocationStockMap(catalogItems, stockMap.stockMap)
                : catalogItems;
        }
    },

    async listCatalogOverrides({ search = '', limit = 200 } = {}) {
        const Item = dbStore.get('Item');
        const ItemFolder = dbStore.get('ItemFolder');
        const where = buildVisibleWhere({}, { statusField: 'status', excludeInactiveStatus: false });
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { sku_code: { [Op.like]: `%${search}%` } }
            ];
        }

        const items = await Item.findAll({
            where,
            attributes: [
                'item_id',
                'name',
                'sku_code',
                'category',
                'product_type',
                'status',
                'default_sale_price',
                'current_stock',
                'folder_id',
                'product_folder'
            ],
            include: [
                ...buildServiceDetailInclude(),
                {
                    model: ItemFolder,
                    as: 'folder',
                    attributes: ['folder_id', 'name', 'show_in_pos_filter'],
                    required: false
                }
            ],
            order: [['name', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 200, 1000)
        });

        const overrideMap = await loadCatalogOverridesMap(items.map((item) => item.item_id));
        return items.map((item) => {
            const payload = toPlain(item);
            const override = overrideMap.get(payload.item_id);
            const readiness = buildPosReadiness({ item: payload, override });
            return {
                ...payload,
                pos_visible: resolveCatalogVisibility({ item: payload, override, surface: 'pos' }),
                pos_image_url: override?.pos_image_url || null,
                pos_image_path: override?.pos_image_path || null,
                has_override: Boolean(override),
                pos_readiness: readiness
            };
        });
    },

    async getCatalogReadinessByItemId(itemId, { forcedPosVisible = null } = {}) {
        const Item = dbStore.get('Item');
        const ItemFolder = dbStore.get('ItemFolder');
        const normalizedItemId = Number.parseInt(itemId, 10);
        if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0) return null;

        const item = await Item.findOne({
            where: buildVisibleWhere(
                { item_id: normalizedItemId },
                { statusField: 'status', excludeInactiveStatus: false }
            ),
            attributes: [
                'item_id',
                'name',
                'sku_code',
                'category',
                'product_type',
                'status',
                'default_sale_price',
                'current_stock',
                'folder_id',
                'product_folder'
            ],
            include: [
                ...buildServiceDetailInclude(),
                {
                    model: ItemFolder,
                    as: 'folder',
                    attributes: ['folder_id', 'name', 'show_in_pos_filter'],
                    required: false
                }
            ]
        });
        if (!item) return null;

        const payload = toPlain(item);
        const override = toPlain(await this.findCatalogOverrideByItemId(normalizedItemId));
        const effectiveOverride = forcedPosVisible === null
            ? override
            : { ...(override || {}), pos_visible: forcedPosVisible === true };
        const readiness = buildPosReadiness({ item: payload, override: effectiveOverride });

        return {
            item_id: payload.item_id,
            pos_visible: resolveCatalogVisibility({ item: payload, override: effectiveOverride, surface: 'pos' }),
            pos_image_url: effectiveOverride?.pos_image_url || null,
            pos_image_path: effectiveOverride?.pos_image_path || null,
            pos_readiness: readiness
        };
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
            pos_visible: Object.prototype.hasOwnProperty.call(payload, 'pos_visible')
                ? payload.pos_visible !== false
                : (existing?.pos_visible ?? true),
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
        const payload = {
            pos_image_path: imageData.path || null,
            pos_image_url: imageData.url || null
        };
        if (typeof options.keepVisible === 'boolean') {
            payload.pos_visible = options.keepVisible;
        }
        return this.upsertCatalogOverride(itemId, payload, options);
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

    async findOperationReplayByKey({ operationKey, idempotencyKey } = {}, options = {}) {
        const PosOperationReplay = dbStore.get('PosOperationReplay');
        if (!PosOperationReplay) return null;

        const normalizedOperationKey = String(operationKey || '').trim();
        const normalizedIdempotencyKey = String(idempotencyKey || '').trim();
        if (!normalizedOperationKey || !normalizedIdempotencyKey) return null;

        return PosOperationReplay.findOne({
            where: {
                operation_key: normalizedOperationKey,
                idempotency_key: normalizedIdempotencyKey
            },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
    },

    async createOperationReplay(payload = {}, options = {}) {
        const PosOperationReplay = dbStore.get('PosOperationReplay');
        if (!PosOperationReplay) {
            throw new Error('PosOperationReplay model is unavailable');
        }

        try {
            const created = await PosOperationReplay.create(payload, {
                transaction: options.transaction
            });
            return toPlain(created);
        } catch (error) {
            if (error?.name !== 'SequelizeUniqueConstraintError') {
                throw error;
            }

            const existing = await this.findOperationReplayByKey({
                operationKey: payload.operation_key,
                idempotencyKey: payload.idempotency_key
            }, options);
            return toPlain(existing);
        }
    },

    async findOpenTerminalShift({ terminalId = null, cashierId = null, locationId = null } = {}, options = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        const where = { status: 'open' };
        if (terminalId) where.terminal_id = terminalId;
        if (cashierId) where.cashier_id = cashierId;
        if (locationId) where.location_id = locationId;
        return PosTerminalShift.findOne({
            where,
            include: [
                {
                    model: dbStore.get('PosCashDrawerEvent'),
                    as: 'cashEvents',
                    required: false
                },
                {
                    model: dbStore.get('TenantLocation'),
                    as: 'location',
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

    async createShiftLocationTransition(payload = {}, options = {}) {
        const PosShiftLocationTransition = dbStore.get('PosShiftLocationTransition');
        if (!PosShiftLocationTransition) {
            throw new Error('PosShiftLocationTransition model is unavailable');
        }
        return PosShiftLocationTransition.create(payload, { transaction: options.transaction });
    },

    async getTerminalShiftById(shiftId, options = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        return PosTerminalShift.findByPk(shiftId, {
            include: [
                {
                    model: dbStore.get('PosCashDrawerEvent'),
                    as: 'cashEvents',
                    required: false
                },
                {
                    model: dbStore.get('TenantLocation'),
                    as: 'location',
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
        const where = buildFinanciallyRecognizedSalesWhere({
            shift_id: shiftId,
            payment_type: 'cash'
        });
        const [row] = await PosTransaction.findAll({
            where,
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
    },

    async listIncomingOnlineOrders({ locationId = null, limit = 200 } = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const where = {
            order_source: 'online_store',
            fulfillment_status: {
                [Op.in]: ['placed', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery']
            }
        };
        if (locationId) {
            where.location_id = locationId;
        }

        const rows = await PosTransaction.findAll({
            where,
            include: buildTransactionInclude(),
            order: [['created_at', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 200, 500)
        });
        return rows.map(toPlain);
    },

    async getOrderByIdForLifecycle(orderId, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const row = await PosTransaction.findByPk(orderId, {
            include: buildTransactionInclude(),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async updateOrderById(orderId, payload = {}, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const row = await PosTransaction.findByPk(orderId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    }
};

assertPosRepositoryContract(posRepository);
