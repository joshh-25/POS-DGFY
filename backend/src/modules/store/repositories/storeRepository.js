import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import { assertStoreRepositoryContract } from '../contracts/storeRepository.contract.js';
import { isCatalogItemVisible } from '../../shared/utils/catalogVisibilityPolicy.js';

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const buildOrderInclude = () => ([
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
        model: dbStore.get('TenantLocation'),
        as: 'location',
        attributes: ['location_id', 'name', 'address_line', 'delivery_radius_km', 'is_open', 'is_active']
    },
    {
        model: dbStore.get('StoreCustomer'),
        as: 'storeCustomer',
        attributes: ['customer_id', 'email', 'name', 'phone']
    },
    {
        model: dbStore.get('User'),
        as: 'acceptedByUser',
        attributes: ['user_id', 'username', 'email']
    }
]);

const toDateStart = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const toDateEnd = (value) => new Date(`${String(value).slice(0, 10)}T23:59:59.999Z`);
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

const applyLocationStock = (rows = [], stockMap = new Map()) => (
    (Array.isArray(rows) ? rows : []).map((row) => {
        const payload = toPlain(row);
        const stock = stockMap.get(Number(payload.item_id));
        const currentStock = Number.isFinite(stock) ? Math.max(0, stock) : 0;
        return {
            ...payload,
            current_stock: currentStock,
            is_available: currentStock > 0,
            availability_status: currentStock > 0 ? 'in_stock' : 'out_of_stock'
        };
    })
);
export const storeRepository = {
    async beginTransaction() {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        return sequelize.transaction();
    },

    async findCustomerByEmail(email, options = {}) {
        const StoreCustomer = dbStore.get('StoreCustomer');
        const row = await StoreCustomer.findOne({
            where: {
                email: String(email || '').trim().toLowerCase()
            },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findCustomerById(customerId, options = {}) {
        const StoreCustomer = dbStore.get('StoreCustomer');
        const row = await StoreCustomer.findByPk(customerId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createCustomer(payload = {}, options = {}) {
        const StoreCustomer = dbStore.get('StoreCustomer');
        const row = await StoreCustomer.create(payload, {
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async updateCustomerById(customerId, payload = {}, options = {}) {
        const StoreCustomer = dbStore.get('StoreCustomer');
        const row = await StoreCustomer.findByPk(customerId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async listCustomerAddresses(customerId, options = {}) {
        const StoreCustomerAddress = dbStore.get('StoreCustomerAddress');
        const rows = await StoreCustomerAddress.findAll({
            where: { customer_id: customerId },
            order: [
                ['is_default', 'DESC'],
                ['address_id', 'ASC']
            ],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async findAddressById(addressId, options = {}) {
        const StoreCustomerAddress = dbStore.get('StoreCustomerAddress');
        const row = await StoreCustomerAddress.findByPk(addressId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createAddress(payload = {}, options = {}) {
        const StoreCustomerAddress = dbStore.get('StoreCustomerAddress');
        const row = await StoreCustomerAddress.create(payload, {
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async updateAddressById(addressId, payload = {}, options = {}) {
        const StoreCustomerAddress = dbStore.get('StoreCustomerAddress');
        const row = await StoreCustomerAddress.findByPk(addressId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async clearDefaultAddress(customerId, options = {}) {
        const StoreCustomerAddress = dbStore.get('StoreCustomerAddress');
        await StoreCustomerAddress.update(
            { is_default: false },
            {
                where: { customer_id: customerId },
                transaction: options.transaction
            }
        );
    },

    async deleteAddressById(addressId, options = {}) {
        const StoreCustomerAddress = dbStore.get('StoreCustomerAddress');
        return StoreCustomerAddress.destroy({
            where: { address_id: addressId },
            transaction: options.transaction
        });
    },

    async findSellableItemsByIds(itemIds, options = {}) {
        const Item = dbStore.get('Item');
        const PosCatalogOverride = dbStore.get('PosCatalogOverride');
        const normalizedLocationId = Number.parseInt(options.locationId, 10);
        const baseQuery = {
            where: buildVisibleWhere(
                {
                    item_id: { [Op.in]: itemIds }
                },
                { statusField: 'status', excludeInactiveStatus: true }
            ),
            attributes: [
                'item_id',
                'name',
                'category',
                'product_type',
                'unit_of_measure',
                'current_stock',
                'default_sale_price',
                'cost_per_unit',
                'vat_type'
            ],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        };
        const includeOverride = PosCatalogOverride
            ? [{
                model: PosCatalogOverride,
                as: 'posCatalogOverride',
                attributes: ['pos_visible'],
                required: false
            }]
            : [];

        try {
            const rows = await Item.findAll({
                ...baseQuery,
                include: includeOverride
            });
            const catalogRows = rows
                .map(toPlain)
                .filter((row) => isCatalogItemVisible(row));
            const locationStock = await loadLocationStockMap(
                catalogRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationStock.locationScopeResolved
                ? applyLocationStock(catalogRows, locationStock.stockMap)
                : catalogRows;
        } catch (error) {
            if (!isMissingPosCatalogOverrideTableError(error)) {
                throw error;
            }
            const rows = await Item.findAll(baseQuery);
            const catalogRows = rows
                .map(toPlain)
                .filter((row) => isCatalogItemVisible(row));
            const locationStock = await loadLocationStockMap(
                catalogRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationStock.locationScopeResolved
                ? applyLocationStock(catalogRows, locationStock.stockMap)
                : catalogRows;
        }
    },

    async listStoreCatalog({ search = '', limit = 60, location_id = null } = {}, options = {}) {
        const Item = dbStore.get('Item');
        const PosCatalogOverride = dbStore.get('PosCatalogOverride');
        const normalizedLocationId = Number.parseInt(location_id, 10);
        const normalizedLimit = Number.isFinite(Number(limit))
            ? Math.max(1, Math.min(200, Number(limit)))
            : 60;
        const normalizedSearch = String(search || '').trim();

        const where = buildVisibleWhere(
            {},
            { statusField: 'status', excludeInactiveStatus: true }
        );
        if (normalizedSearch) {
            where[Op.or] = [
                { name: { [Op.like]: `%${normalizedSearch}%` } },
                { sku_code: { [Op.like]: `%${normalizedSearch}%` } },
                { description: { [Op.like]: `%${normalizedSearch}%` } }
            ];
        }

        const baseQuery = {
            where,
            attributes: [
                'item_id',
                'name',
                'category',
                'product_type',
                'unit_of_measure',
                'current_stock',
                'default_sale_price',
                'cost_per_unit',
                'vat_type'
            ],
            order: [['name', 'ASC']],
            limit: normalizedLimit,
            transaction: options.transaction
        };
        const includeOverride = PosCatalogOverride
            ? [{
                model: PosCatalogOverride,
                as: 'posCatalogOverride',
                attributes: ['pos_visible', 'pos_image_url'],
                required: false
            }]
            : [];

        const mapCatalogRows = (rows) => rows
            .map(toPlain)
            .filter((row) => isCatalogItemVisible(row))
            .map((row) => ({
                item_id: row.item_id,
                name: row.name,
                category: row.category,
                unit_of_measure: row.unit_of_measure,
                current_stock: row.current_stock,
                default_sale_price: row.default_sale_price,
                cost_per_unit: row.cost_per_unit,
                vat_type: row.vat_type,
                image_url: row?.posCatalogOverride?.pos_image_url || null
            }));

        try {
            const rows = await Item.findAll({
                ...baseQuery,
                include: includeOverride
            });
            const catalogRows = mapCatalogRows(rows);
            const locationStock = await loadLocationStockMap(
                catalogRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationStock.locationScopeResolved
                ? applyLocationStock(catalogRows, locationStock.stockMap)
                : catalogRows.map((row) => ({
                    ...row,
                    is_available: Number(row.current_stock || 0) > 0,
                    availability_status: Number(row.current_stock || 0) > 0 ? 'in_stock' : 'out_of_stock'
                }));
        } catch (error) {
            if (!isMissingPosCatalogOverrideTableError(error)) {
                throw error;
            }
            const rows = await Item.findAll(baseQuery);
            const catalogRows = mapCatalogRows(rows);
            const locationStock = await loadLocationStockMap(
                catalogRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationStock.locationScopeResolved
                ? applyLocationStock(catalogRows, locationStock.stockMap)
                : catalogRows.map((row) => ({
                    ...row,
                    is_available: Number(row.current_stock || 0) > 0,
                    availability_status: Number(row.current_stock || 0) > 0 ? 'in_stock' : 'out_of_stock'
                }));
        }
    },

    async getLocationStocksByItemIds(itemIds = [], locationId = null, options = {}) {
        const normalizedLocationId = Number.parseInt(locationId, 10);
        if (!Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) {
            return [];
        }
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return [];
        }

        const ItemLocationStock = dbStore.get('ItemLocationStock');
        const rows = await ItemLocationStock.findAll({
            where: {
                location_id: normalizedLocationId,
                item_id: { [Op.in]: itemIds }
            },
            attributes: ['item_id', 'location_id', 'quantity_on_hand'],
            transaction: options.transaction
        });

        return rows.map(toPlain);
    },

    async listActiveLocations(options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const rows = await TenantLocation.findAll({
            where: { is_active: true },
            attributes: [
                'location_id',
                'name',
                'address_line',
                'latitude',
                'longitude',
                'delivery_radius_km',
                'current_wait_time_minutes',
                'is_open',
                'is_active',
                'is_primary_storefront',
                'supports_delivery',
                'supports_pickup',
                'supports_dine_in'
            ],
            order: [
                ['is_primary_storefront', 'DESC'],
                ['is_open', 'DESC'],
                ['updated_at', 'DESC'],
                ['location_id', 'DESC']
            ],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async findLocationById(locationId, options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const row = await TenantLocation.findByPk(locationId, {
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async findDefaultActiveLocation(options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const row = await TenantLocation.findOne({
            where: { is_active: true },
            order: [
                ['is_primary_storefront', 'DESC'],
                ['is_open', 'DESC'],
                ['updated_at', 'DESC'],
                ['location_id', 'DESC']
            ],
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async getSettingsByKeys(keys = [], options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        const rows = await SystemSetting.findAll({
            where: {
                setting_key: { [Op.in]: keys }
            },
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async findTransactionByIdempotencyKey(idempotencyKey, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const row = await PosTransaction.findOne({
            where: { idempotency_key: idempotencyKey },
            include: buildOrderInclude(),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async isTrackingPinTaken(trackingPin, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const count = await PosTransaction.count({
            where: { tracking_pin: trackingPin },
            transaction: options.transaction
        });
        return Number(count) > 0;
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
        await counter.update({ current_value: nextValue }, { transaction });
        return `INV-${String(nextValue).padStart(6, '0')}`;
    },

    async createOnlineTransactionWithLines({ header, lines }, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const PosTransactionLine = dbStore.get('PosTransactionLine');
        const transaction = options.transaction;

        const created = await PosTransaction.create(header, { transaction });
        await PosTransactionLine.bulkCreate(
            (lines || []).map((line) => ({
                ...line,
                pos_transaction_id: created.pos_transaction_id
            })),
            { transaction }
        );

        return created.pos_transaction_id;
    },

    async getOrderByTrackingPin(trackingPin, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const row = await PosTransaction.findOne({
            where: { tracking_pin: trackingPin },
            include: buildOrderInclude(),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async updateOrderByTrackingPin(trackingPin, payload = {}, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const row = await PosTransaction.findOne({
            where: { tracking_pin: trackingPin },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async listOrdersByCustomer(customerId, filters = {}) {
        const PosTransaction = dbStore.get('PosTransaction');

        const page = Number.parseInt(filters.page, 10) || 1;
        const limit = Number.parseInt(filters.limit, 10) || 20;
        const offset = (page - 1) * limit;

        const where = {
            order_source: 'online_store',
            store_customer_id: customerId
        };

        if (filters.fulfillment_status) {
            where.fulfillment_status = String(filters.fulfillment_status).trim();
        }

        if (filters.date_from || filters.date_to) {
            where.created_at = {};
            if (filters.date_from) where.created_at[Op.gte] = toDateStart(filters.date_from);
            if (filters.date_to) where.created_at[Op.lte] = toDateEnd(filters.date_to);
        }

        const result = await PosTransaction.findAndCountAll({
            where,
            include: buildOrderInclude(),
            order: [['created_at', 'DESC']],
            limit,
            offset
        });

        return {
            rows: result.rows.map(toPlain),
            pagination: {
                page,
                limit,
                total: Number(result.count) || 0,
                totalPages: Math.ceil((Number(result.count) || 0) / limit)
            }
        };
    },

    async getOrderById(orderId, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const row = await PosTransaction.findByPk(orderId, {
            include: buildOrderInclude(),
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
    },

    async findStorefrontFollow({ tenantId, storefrontSlug, visitorFingerprint }, options = {}) {
        const StorefrontFollow = dbStore.get('StorefrontFollow');
        const row = await StorefrontFollow.findOne({
            where: {
                tenant_id: tenantId,
                storefront_slug: storefrontSlug,
                visitor_fingerprint: visitorFingerprint
            },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async upsertStorefrontFollow({ tenantId, storefrontSlug, visitorFingerprint }, options = {}) {
        const StorefrontFollow = dbStore.get('StorefrontFollow');
        const existing = await StorefrontFollow.findOne({
            where: {
                tenant_id: tenantId,
                storefront_slug: storefrontSlug,
                visitor_fingerprint: visitorFingerprint
            },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (existing) return toPlain(existing);
        const row = await StorefrontFollow.create({
            tenant_id: tenantId,
            storefront_slug: storefrontSlug,
            visitor_fingerprint: visitorFingerprint
        }, {
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async deleteStorefrontFollow({ tenantId, storefrontSlug, visitorFingerprint }, options = {}) {
        const StorefrontFollow = dbStore.get('StorefrontFollow');
        return StorefrontFollow.destroy({
            where: {
                tenant_id: tenantId,
                storefront_slug: storefrontSlug,
                visitor_fingerprint: visitorFingerprint
            },
            transaction: options.transaction
        });
    },

    async countStorefrontFollowsBySlug({ tenantId, storefrontSlug }, options = {}) {
        const StorefrontFollow = dbStore.get('StorefrontFollow');
        const count = await StorefrontFollow.count({
            where: {
                tenant_id: tenantId,
                storefront_slug: storefrontSlug
            },
            transaction: options.transaction
        });
        return Number(count) || 0;
    }
};

assertStoreRepositoryContract(storeRepository);
