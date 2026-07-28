import crypto from 'crypto';
import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import logger from '../../../config/logger.js';
import { deriveImageAssetVariantUrls } from '../../shared/utils/imageAssetStorage.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import { assertStoreRepositoryContract } from '../contracts/storeRepository.contract.js';
import { isCatalogItemVisible, resolveStorefrontCatalogVisibility } from '../../shared/utils/catalogVisibilityPolicy.js';
import { hasExplicitSalePrice } from '../../shared/utils/itemFinancialPolicy.js';
import {
    detectBarcodeSymbology,
    isBarcodeScopeAllowedForSurface,
    normalizeBarcodeValue
} from '../../shared/utils/barcodePolicy.js';
import {
    AVAILABILITY_SOURCE,
    isStockExemptServiceItem,
    resolveStockBearingDescriptor
} from '../../shared/utils/stockBearingPolicy.js';

// Availability for an item whose descriptor says it isn't stock-tracked
// (untracked, toggle, or capacity/service): no per-location stock row should
// ever collapse it to "out of stock" (that was bug 5's "?? 0" conflation for
// these modes specifically) - it gates on the declared toggle boolean instead,
// or is simply always available/bookable.
const resolveDescriptorAvailability = (descriptor) => {
    const isAvailable = descriptor.is_toggle_available !== false;
    return {
        is_available: isAvailable,
        availability_status: descriptor.availability_source === AVAILABILITY_SOURCE.CAPACITY
            ? 'bookable'
            : (isAvailable ? 'in_stock' : 'out_of_stock')
    };
};

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
                attributes: ['item_id', 'name', 'sku_code', 'category', 'unit_of_measure']
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
        attributes: ['customer_id', 'dgfy_account_id', 'email', 'name', 'phone']
    },
    {
        model: dbStore.get('PosTransactionDiscount'),
        as: 'discount',
        required: false,
        include: [{
            model: dbStore.get('PosTransactionDiscountLine'),
            as: 'lines',
            required: false
        }]
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
    return code === 'ER_NO_SUCH_TABLE' && message.includes('pos_catalog_overrides');
};

const isMissingStorefrontCatalogOverrideTableError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' && message.includes('storefront_catalog_overrides');
};

const isMissingStorefrontCatalogGalleryColumnError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_BAD_FIELD_ERROR'
        && message.includes('storefrontCatalogOverride.storefront_image_gallery');
};

const isMissingServiceItemDetailTableError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' && message.includes('service_item_details');
};

const isMissingOptionalCatalogIncludeTableError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' && (
        message.includes('pos_catalog_overrides')
        || message.includes('storefront_catalog_overrides')
        || message.includes('service_item_details')
        || message.includes('item_allergens')
        || message.includes('item_nutrition')
        || message.includes('fnb_modifier_groups')
        || message.includes('fnb_modifier_options')
        || message.includes('fnb_item_modifier_groups')
    ) || isMissingStorefrontCatalogGalleryColumnError(error);
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

const isMissingStorefrontLocationItemOverrideTableError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' && message.includes('storefront_location_item_overrides');
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
        const descriptor = resolveStockBearingDescriptor(payload);
        if (!descriptor.tracks_quantity) {
            return { ...payload, ...resolveDescriptorAvailability(descriptor) };
        }
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

const loadStorefrontLocationAvailabilityMap = async (itemIds = [], locationId = null, options = {}) => {
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) {
        return {
            availabilityMap: new Map(),
            locationAvailabilityResolved: false
        };
    }
    const normalizedItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
        .map((itemId) => Number.parseInt(itemId, 10))
        .filter((itemId) => Number.isInteger(itemId) && itemId > 0))];
    if (normalizedItemIds.length === 0) {
        return {
            availabilityMap: new Map(),
            locationAvailabilityResolved: true
        };
    }

    let StorefrontLocationItemOverride = null;
    try {
        StorefrontLocationItemOverride = dbStore.get('StorefrontLocationItemOverride');
    } catch {
        // Optional tenant model; older schemas may not expose branch-level overrides.
    }
    if (!StorefrontLocationItemOverride?.findAll) {
        return {
            availabilityMap: new Map(),
            locationAvailabilityResolved: false
        };
    }

    try {
        const rows = await StorefrontLocationItemOverride.findAll({
            where: {
                location_id: normalizedLocationId,
                item_id: { [Op.in]: normalizedItemIds }
            },
            attributes: ['item_id', 'storefront_available'],
            transaction: options.transaction
        });
        return {
            availabilityMap: new Map(rows.map((row) => {
                const payload = toPlain(row);
                return [Number(payload.item_id), payload.storefront_available !== false];
            })),
            locationAvailabilityResolved: true
        };
    } catch (error) {
        if (isMissingStorefrontLocationItemOverrideTableError(error)) {
            return {
                availabilityMap: new Map(),
                locationAvailabilityResolved: false
            };
        }
        throw error;
    }
};

const applyStorefrontLocationAvailability = (rows = [], availabilityMap = new Map()) => (
    (Array.isArray(rows) ? rows : [])
        .filter((row) => availabilityMap.get(Number(row?.item_id)) !== false)
);

const buildStorefrontOverrideInclude = (StorefrontCatalogOverride, PosCatalogOverride, { includeLegacyPosFallback = false, includeGallery = true } = {}) => {
    const includes = [];
    if (StorefrontCatalogOverride) {
        includes.push({
            model: StorefrontCatalogOverride,
            as: 'storefrontCatalogOverride',
            attributes: [
                'storefront_visible',
                'storefront_image_url',
                ...(includeGallery ? ['storefront_image_gallery'] : [])
            ],
            required: false
        });
    }
    if (includeLegacyPosFallback && PosCatalogOverride) {
        includes.push({
            model: PosCatalogOverride,
            as: 'posCatalogOverride',
            attributes: ['pos_visible', 'pos_image_url'],
            required: false
        });
    }
    return includes;
};

const buildStorefrontCatalogDetailIncludes = () => {
    const includes = [];
    const ServiceItemDetail = dbStore.get('ServiceItemDetail');
    const ItemNutrition = dbStore.get('ItemNutrition');
    const ItemAllergen = dbStore.get('ItemAllergen');
    const ItemFolder = dbStore.get('ItemFolder');
    const FnbModifierGroup = dbStore.get('FnbModifierGroup');
    const FnbModifierOption = dbStore.get('FnbModifierOption');

    if (ServiceItemDetail) {
        includes.push({
            model: ServiceItemDetail,
            as: 'serviceDetail',
            required: false
        });
    }

    if (ItemNutrition) {
        includes.push({
            model: ItemNutrition,
            as: 'nutrition',
            required: false
        });
    }

    if (ItemAllergen) {
        includes.push({
            model: ItemAllergen,
            as: 'allergens',
            required: false
        });
    }

    if (ItemFolder) {
        includes.push({
            model: ItemFolder,
            as: 'folder',
            attributes: ['folder_id', 'name'],
            required: false
        });
    }

    if (FnbModifierGroup) {
        includes.push({
            model: FnbModifierGroup,
            as: 'fnbModifierGroups',
            required: false,
            through: { attributes: ['is_required_override', 'sort_order'] },
            include: FnbModifierOption
                ? [{
                    model: FnbModifierOption,
                    as: 'options',
                    required: false
                }]
                : []
        });
    }

    return includes;
};

const mapStorefrontCatalogVisibility = (row = {}, { allowLegacyPosFallback = false } = {}) => (
    resolveStorefrontCatalogVisibility({
        item: row,
        override: row?.storefrontCatalogOverride || null,
        legacyPosOverride: allowLegacyPosFallback ? (row?.posCatalogOverride || null) : null
    })
);

const isStorefrontPublicCatalogReady = (row = {}, options = {}) => (
    mapStorefrontCatalogVisibility(row, options) && hasExplicitSalePrice(row)
);

const mapStorefrontCatalogImageUrl = (row = {}, { allowLegacyPosFallback = false } = {}) => (
    row?.storefrontCatalogOverride?.storefront_image_url
    || (allowLegacyPosFallback ? row?.posCatalogOverride?.pos_image_url : null)
    || null
);

const normalizeStorefrontImageGallery = (value) => {
    const source = typeof value === 'string'
        ? (() => {
            try {
                return JSON.parse(value);
            } catch {
                return [];
            }
        })()
        : value;
    return (Array.isArray(source) ? source : [])
        .map((entry, index) => ({
            path: entry?.path || null,
            url: entry?.url || null,
            variants: entry?.variants && typeof entry.variants === 'object'
                ? {
                    thumbnail_url: entry.variants.thumbnail_url || null,
                    medium_url: entry.variants.medium_url || null,
                    large_url: entry.variants.large_url || null
                }
                : deriveImageAssetVariantUrls({
                    storedPath: entry?.path || null,
                    storedUrl: entry?.url || null
                }),
            is_primary: entry?.is_primary === true,
            sort_order: Number.isFinite(Number(entry?.sort_order)) ? Number(entry.sort_order) : index
        }))
        .filter((entry) => entry.url || entry.path)
        .sort((a, b) => {
            if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
            return a.sort_order - b.sort_order;
        })
        .map((entry, index) => ({
            ...entry,
            is_primary: index === 0,
            sort_order: index
        }));
};

const mapStorefrontCatalogImageGallery = (row = {}, options = {}) => {
    const primaryUrl = mapStorefrontCatalogImageUrl(row, options);
    const normalized = normalizeStorefrontImageGallery(row?.storefrontCatalogOverride?.storefront_image_gallery || []);
    const hasPrimaryInGallery = normalized.some((entry) => entry.url === primaryUrl);
    const gallery = primaryUrl && !hasPrimaryInGallery
        ? [{ path: null, url: primaryUrl, is_primary: true, sort_order: 0 }, ...normalized]
        : normalized;
    return gallery
        .filter((entry) => entry.url)
        .map((entry, index) => ({
            url: entry.url,
            variants: entry.variants || deriveImageAssetVariantUrls({
                storedPath: entry.path || null,
                storedUrl: entry.url || null
            }),
            is_primary: index === 0,
            sort_order: index
        }));
};

const warnStorefrontOverrideFallback = (error) => {
    logger.warn('[StoreRepository] Falling back to POS-derived storefront catalog visibility while storefront override table is unavailable', {
        event_type: 'storefront_catalog_override_fallback',
        reason: error?.original?.code || error?.parent?.code || error?.code || 'unknown'
    });
};
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
        const StorefrontCatalogOverride = dbStore.get('StorefrontCatalogOverride');
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
                'description',
                'category',
                'product_type',
                'mode_item_preset',
                'tracking_mode',
                'tracking_toggle_available',
                'product_folder',
                'unit_of_measure',
                'current_stock',
                'default_sale_price',
                'cost_per_unit',
                'vat_type'
            ],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        };
        const catalogDetailIncludes = buildStorefrontCatalogDetailIncludes();
        const includeOverride = buildStorefrontOverrideInclude(StorefrontCatalogOverride, PosCatalogOverride);

        try {
            const rows = await Item.findAll({
                ...baseQuery,
                include: [
                    ...includeOverride,
                    ...catalogDetailIncludes
                ]
            });
            const catalogRows = rows
                .map(toPlain)
                .filter((row) => mapStorefrontCatalogVisibility(row));
            const locationAvailability = await loadStorefrontLocationAvailabilityMap(
                catalogRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            const branchAvailableRows = Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationAvailability.locationAvailabilityResolved
                ? applyStorefrontLocationAvailability(catalogRows, locationAvailability.availabilityMap)
                : catalogRows;
            const locationStock = await loadLocationStockMap(
                branchAvailableRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationStock.locationScopeResolved
                ? applyLocationStock(branchAvailableRows, locationStock.stockMap)
                : branchAvailableRows;
        } catch (error) {
            if (!isMissingOptionalCatalogIncludeTableError(error)) {
                throw error;
            }
            if (isMissingStorefrontCatalogOverrideTableError(error)) {
                warnStorefrontOverrideFallback(error);
            }
            const legacyInclude = buildStorefrontOverrideInclude(null, PosCatalogOverride, {
                includeLegacyPosFallback: !isMissingPosCatalogOverrideTableError(error)
            });
            const rows = await Item.findAll({
                ...baseQuery,
                include: legacyInclude
            });
            const catalogRows = rows
                .map(toPlain)
                .filter((row) => isCatalogItemVisible(row) && hasExplicitSalePrice(row));
            const locationAvailability = await loadStorefrontLocationAvailabilityMap(
                catalogRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            const branchAvailableRows = Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationAvailability.locationAvailabilityResolved
                ? applyStorefrontLocationAvailability(catalogRows, locationAvailability.availabilityMap)
                : catalogRows;
            const locationStock = await loadLocationStockMap(
                branchAvailableRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationStock.locationScopeResolved
                ? applyLocationStock(branchAvailableRows, locationStock.stockMap)
                : branchAvailableRows;
        }
    },

    async listStoreCatalog({ search = '', limit = 60, location_id = null } = {}, options = {}) {
        const Item = dbStore.get('Item');
        const StorefrontCatalogOverride = dbStore.get('StorefrontCatalogOverride');
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
                'description',
                'category',
                'product_type',
                'mode_item_preset',
                'tracking_mode',
                'tracking_toggle_available',
                'product_folder',
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
        const includeOverride = buildStorefrontOverrideInclude(StorefrontCatalogOverride, PosCatalogOverride);
        const catalogDetailIncludes = buildStorefrontCatalogDetailIncludes();

        const mapCatalogRows = (rows, { allowLegacyPosFallback = false } = {}) => rows
            .map(toPlain)
            .filter((row) => isStorefrontPublicCatalogReady(row, { allowLegacyPosFallback }))
            .map((row) => ({
                item_id: row.item_id,
                name: row.name,
                description: row.description,
                category: row.category,
                mode_item_preset: row.mode_item_preset,
                tracking_mode: row.tracking_mode,
                tracking_toggle_available: row.tracking_toggle_available,
                folder_name: row.product_folder || row?.folder?.name || null,
                unit_of_measure: row.unit_of_measure,
                current_stock: isStockExemptServiceItem(row) ? 0 : row.current_stock,
                default_sale_price: row.default_sale_price,
                cost_per_unit: row.cost_per_unit,
                vat_type: row.vat_type,
                image_url: mapStorefrontCatalogImageUrl(row, { allowLegacyPosFallback }),
                image_variants: deriveImageAssetVariantUrls({
                    storedUrl: mapStorefrontCatalogImageUrl(row, { allowLegacyPosFallback })
                }),
                image_gallery: mapStorefrontCatalogImageGallery(row, { allowLegacyPosFallback }),
                service_detail: row?.serviceDetail || null,
                nutrition: row?.nutrition || null,
                allergens: Array.isArray(row?.allergens) ? row.allergens : [],
                fnb_modifier_groups: Array.isArray(row?.fnbModifierGroups) ? row.fnbModifierGroups : []
            }));

        try {
            const rows = await Item.findAll({
                ...baseQuery,
                include: [
                    ...includeOverride,
                    ...catalogDetailIncludes
                ]
            });
            const catalogRows = mapCatalogRows(rows);
            const locationAvailability = await loadStorefrontLocationAvailabilityMap(
                catalogRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            const branchAvailableRows = Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationAvailability.locationAvailabilityResolved
                ? applyStorefrontLocationAvailability(catalogRows, locationAvailability.availabilityMap)
                : catalogRows;
            const locationStock = await loadLocationStockMap(
                branchAvailableRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationStock.locationScopeResolved
                ? applyLocationStock(branchAvailableRows, locationStock.stockMap)
                : branchAvailableRows.map((row) => {
                    const descriptor = resolveStockBearingDescriptor(row);
                    if (!descriptor.tracks_quantity) {
                        return { ...row, ...resolveDescriptorAvailability(descriptor) };
                    }
                    const currentStock = Number(row.current_stock || 0);
                    return {
                        ...row,
                        is_available: currentStock > 0,
                        availability_status: currentStock > 0 ? 'in_stock' : 'out_of_stock'
                    };
                });
        } catch (error) {
            if (!isMissingOptionalCatalogIncludeTableError(error)) {
                throw error;
            }
            if (isMissingStorefrontCatalogOverrideTableError(error)) {
                warnStorefrontOverrideFallback(error);
            }
            const optionalDetailIncludes = (
                isMissingServiceItemDetailTableError(error)
                || String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '').includes('item_allergens')
                || String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '').includes('item_nutrition')
                || String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '').includes('fnb_')
            )
                ? []
                : catalogDetailIncludes;
            const fallbackInclude = [
                ...buildStorefrontOverrideInclude(
                    isMissingStorefrontCatalogOverrideTableError(error) ? null : StorefrontCatalogOverride,
                    PosCatalogOverride,
                    {
                        includeLegacyPosFallback: isMissingStorefrontCatalogOverrideTableError(error)
                            && !isMissingPosCatalogOverrideTableError(error),
                        includeGallery: !isMissingStorefrontCatalogGalleryColumnError(error)
                    }
                ),
                ...optionalDetailIncludes
            ];
            let rows;
            try {
                rows = await Item.findAll({
                    ...baseQuery,
                    include: fallbackInclude
                });
            } catch (fallbackError) {
                if (!isMissingStorefrontCatalogGalleryColumnError(fallbackError)) {
                    throw fallbackError;
                }
                rows = await Item.findAll({
                    ...baseQuery,
                    include: [
                        ...buildStorefrontOverrideInclude(
                            isMissingStorefrontCatalogOverrideTableError(error) ? null : StorefrontCatalogOverride,
                            PosCatalogOverride,
                            {
                                includeLegacyPosFallback: isMissingStorefrontCatalogOverrideTableError(error)
                                    && !isMissingPosCatalogOverrideTableError(error),
                                includeGallery: false
                            }
                        ),
                        ...optionalDetailIncludes
                    ]
                });
            }
            const catalogRows = mapCatalogRows(rows, {
                allowLegacyPosFallback: isMissingStorefrontCatalogOverrideTableError(error)
            });
            const locationAvailability = await loadStorefrontLocationAvailabilityMap(
                catalogRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            const branchAvailableRows = Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationAvailability.locationAvailabilityResolved
                ? applyStorefrontLocationAvailability(catalogRows, locationAvailability.availabilityMap)
                : catalogRows;
            const locationStock = await loadLocationStockMap(
                branchAvailableRows.map((row) => Number(row.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationStock.locationScopeResolved
                ? applyLocationStock(branchAvailableRows, locationStock.stockMap)
                : branchAvailableRows.map((row) => {
                    const descriptor = resolveStockBearingDescriptor(row);
                    if (!descriptor.tracks_quantity) {
                        return { ...row, ...resolveDescriptorAvailability(descriptor) };
                    }
                    const currentStock = Number(row.current_stock || 0);
                    return {
                        ...row,
                        is_available: currentStock > 0,
                        availability_status: currentStock > 0 ? 'in_stock' : 'out_of_stock'
                    };
                });
        }
    },

    async resolvePublicBarcode({ code, location_id = null } = {}, options = {}) {
        const ItemBarcode = dbStore.get('ItemBarcode');
        const Item = dbStore.get('Item');
        const StorefrontCatalogOverride = dbStore.get('StorefrontCatalogOverride');
        const PosCatalogOverride = dbStore.get('PosCatalogOverride');
        const ServiceItemDetail = dbStore.get('ServiceItemDetail');
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
                where: buildVisibleWhere({}, { statusField: 'status', excludeInactiveStatus: true }),
                attributes: [
                    'item_id',
                    'name',
                    'category',
                    'product_type',
                    'unit_of_measure',
                    'current_stock',
                    'default_sale_price',
                    'vat_type'
                ],
                include: [
                    ...buildStorefrontOverrideInclude(StorefrontCatalogOverride, PosCatalogOverride),
                    ...(ServiceItemDetail ? [{
                        model: dbStore.get('ServiceItemDetail'),
                        as: 'serviceDetail',
                        required: false
                    }] : [])
                ],
                required: true
            }],
            order: [
                ['is_primary', 'DESC'],
                ['updated_at', 'DESC'],
                ['item_barcode_id', 'DESC']
            ],
            limit: 5,
            transaction: options.transaction
        });

        if (rows.length === 0) {
            return {
                status: 'not_found',
                reason_code: 'BARCODE_NOT_FOUND',
                normalized_code: normalizedCode,
                symbology: detectBarcodeSymbology(code)
            };
        }

        const visibleMatches = rows
            .map((row) => toPlain(row))
            .filter((barcode) => isBarcodeScopeAllowedForSurface(barcode.scope, 'storefront'))
            .map((barcode) => {
                const item = barcode.item || {};
                const storefrontVisible = mapStorefrontCatalogVisibility(item);
                return {
                    barcode,
                    item: {
                        item_id: item.item_id,
                        name: item.name,
                        category: item.category,
                        product_type: item.product_type || null,
                        unit_of_measure: item.unit_of_measure || null,
                        current_stock: isStockExemptServiceItem(item) ? 0 : item.current_stock,
                        default_sale_price: item.default_sale_price,
                        vat_type: item.vat_type,
                        image_url: mapStorefrontCatalogImageUrl(item),
                        image_variants: deriveImageAssetVariantUrls({
                            storedUrl: mapStorefrontCatalogImageUrl(item)
                        }),
                        image_gallery: mapStorefrontCatalogImageGallery(item),
                        service_detail: item.serviceDetail || null
                    },
                    storefront_visible: storefrontVisible
                };
            })
            .filter((entry) => entry.storefront_visible && hasExplicitSalePrice(entry.item));

        if (visibleMatches.length === 0 && rows.length > 0) {
            const disallowedScopes = rows
                .map((row) => row.scope)
                .filter((scope) => !isBarcodeScopeAllowedForSurface(scope, 'storefront'));
            if (disallowedScopes.length > 0) {
                return {
                    status: 'blocked',
                    reason_code: 'BARCODE_SCOPE_NOT_STOREFRONT',
                    normalized_code: normalizedCode
                };
            }
        }

        const normalizedLocationId = Number.parseInt(location_id, 10);
        const locationAvailability = await loadStorefrontLocationAvailabilityMap(
            visibleMatches.map((entry) => Number(entry.item.item_id)),
            normalizedLocationId,
            options
        );
        const branchVisibleMatches = Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationAvailability.locationAvailabilityResolved
            ? visibleMatches.filter((entry) => locationAvailability.availabilityMap.get(Number(entry.item.item_id)) !== false)
            : visibleMatches;

        const itemIds = Array.from(new Set(branchVisibleMatches.map((entry) => Number(entry.item.item_id))));
        if (itemIds.length > 1) {
            return {
                status: 'conflict',
                reason_code: 'BARCODE_CONFLICT',
                normalized_code: normalizedCode
            };
        }
        if (branchVisibleMatches.length === 0) {
            return {
                status: 'blocked',
                reason_code: 'NOT_STOREFRONT_VISIBLE',
                normalized_code: normalizedCode
            };
        }

        const [match] = branchVisibleMatches;
        const locationStock = await loadLocationStockMap(
            [Number(match.item.item_id)],
            normalizedLocationId,
            options
        );
        const [item] = Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && locationStock.locationScopeResolved
            ? applyLocationStock([match.item], locationStock.stockMap)
            : [match.item];

        return {
            status: 'resolved',
            reason_code: null,
            normalized_code: normalizedCode,
            barcode: {
                item_barcode_id: match.barcode.item_barcode_id,
                code: match.barcode.code,
                normalized_code: match.barcode.normalized_code,
                symbology: match.barcode.symbology,
                source: match.barcode.source,
                scope: match.barcode.scope,
                packaging_level: match.barcode.packaging_level,
                quantity_multiplier: Number(match.barcode.quantity_multiplier || 1)
            },
            item
        };
    },

    async resolvePublicServiceBookingReference(publicReference, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const Item = dbStore.get('Item');
        const ServiceItemDetail = dbStore.get('ServiceItemDetail');
        const TenantLocation = dbStore.get('TenantLocation');
        const reference = String(publicReference || '').trim();
        if (!reference) {
            return {
                status: 'not_found',
                reason_code: 'BOOKING_REFERENCE_REQUIRED'
            };
        }

        const booking = await ServiceBooking.findOne({
            where: { public_reference: reference },
            include: [
                {
                    model: Item,
                    as: 'serviceItem',
                    attributes: ['item_id', 'name', 'category', 'default_sale_price', 'vat_type', 'unit_of_measure'],
                    required: false,
                    include: ServiceItemDetail ? [{
                        model: ServiceItemDetail,
                        as: 'serviceDetail',
                        required: false
                    }] : []
                },
                {
                    model: TenantLocation,
                    as: 'location',
                    attributes: ['location_id', 'name'],
                    required: false
                }
            ],
            transaction: options.transaction
        });

        if (!booking) {
            return {
                status: 'not_found',
                reason_code: 'BOOKING_NOT_FOUND'
            };
        }

        const row = toPlain(booking);
        const serviceItem = row.serviceItem || null;
        const detail = row.serviceDetail || serviceItem?.serviceDetail || null;
        return {
            status: 'resolved',
            reason_code: null,
            booking: {
                booking_id: row.booking_id,
                public_reference: row.public_reference,
                service_item_id: row.service_item_id,
                service_name: serviceItem?.name || null,
                service_category: detail?.service_category || null,
                location_id: row.location_id || null,
                location: row.location || null,
                start_at: row.start_at,
                end_at: row.end_at,
                status: row.status,
                payment_timing: row.payment_timing,
                payment_status: row.payment_status,
                total_amount: Number(serviceItem?.default_sale_price || 0),
                ticket: {
                    type: 'booking_ticket',
                    reference: row.public_reference,
                    tracking_pin: row.public_reference,
                    fiscal_label: row.payment_status === 'paid'
                        ? 'Payment receipt available separately'
                        : 'Booking ticket - not a fiscal receipt'
                }
            }
        };
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

    async listProductCompositionsForItems(itemIds = [], options = {}) {
        const ProductComposition = dbStore.get('ProductComposition');
        const Item = dbStore.get('Item');
        const normalizedLocationId = Number.parseInt(options.locationId, 10);
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

        const payload = rows.map(toPlain);
        const ingredientIds = [...new Set(payload
            .map((row) => Number.parseInt(row?.ingredient_id, 10))
            .filter((itemId) => Number.isInteger(itemId) && itemId > 0))];
        const locationStock = await loadLocationStockMap(ingredientIds, normalizedLocationId, options);
        if (!(
            Number.isInteger(normalizedLocationId)
            && normalizedLocationId > 0
            && locationStock.locationScopeResolved
        )) {
            return payload;
        }

        return payload.map((row) => {
            const ingredient = row.ingredient ? { ...row.ingredient } : row.ingredient;
            const ingredientId = Number.parseInt(row?.ingredient_id, 10);
            const scopedStock = locationStock.stockMap.get(ingredientId);
            return {
                ...row,
                ingredient: ingredient
                    ? {
                        ...ingredient,
                        current_stock: Number.isFinite(scopedStock) ? Math.max(0, scopedStock) : 0
                    }
                    : ingredient
            };
        });
    },

    async createFnbKitchenOrderForOnlineTransaction(payload = {}, options = {}) {
        const FnbCheck = dbStore.get('FnbCheck');
        const FnbCheckLine = dbStore.get('FnbCheckLine');
        const FnbKitchenTicket = dbStore.get('FnbKitchenTicket');
        const PosTransaction = dbStore.get('PosTransaction');
        if (!FnbCheck || !FnbCheckLine || !FnbKitchenTicket || !PosTransaction) return null;

        const transaction = options.transaction;
        const posTransactionId = Number.parseInt(payload.pos_transaction_id, 10);
        if (!Number.isInteger(posTransactionId) || posTransactionId <= 0) return null;

        let check = await FnbCheck.findOne({
            where: { pos_transaction_id: posTransactionId },
            transaction,
            lock: options.lock && transaction ? transaction.LOCK.UPDATE : undefined
        });
        if (check) {
            const existingTicket = await FnbKitchenTicket.findOne({
                where: {
                    check_id: check.check_id,
                    status: { [Op.ne]: 'cancelled' }
                },
                order: [['created_at', 'DESC']],
                transaction,
                lock: options.lock && transaction ? transaction.LOCK.UPDATE : undefined
            });
            if (existingTicket) {
                return {
                    check: toPlain(check),
                    kitchen_ticket: toPlain(existingTicket),
                    idempotent_existing_ticket: true
                };
            }
        } else {
            check = await FnbCheck.create({
                table_id: null,
                dining_area_id: null,
                server_id: null,
                guest_count: 1,
                order_method: ['dine_in', 'takeout', 'pickup', 'delivery'].includes(payload.order_method)
                    ? payload.order_method
                    : 'pickup',
                status: 'sent_to_kitchen',
                pos_transaction_id: posTransactionId,
                notes: [
                    'Online storefront order',
                    payload.customer_name ? `Customer: ${payload.customer_name}` : null,
                    payload.special_instructions ? `Instructions: ${payload.special_instructions}` : null
                ].filter(Boolean).join('\n') || null
            }, { transaction });
        }

        const checkId = Number(check.check_id);
        let lineRows = (Array.isArray(payload.lines) ? payload.lines : [])
            .map((line) => ({
                check_id: checkId,
                item_id: Number.parseInt(line.item_id, 10),
                quantity: Number(line.quantity),
                course: ['appetizer', 'main', 'dessert', 'drink', 'other'].includes(line.fnb_course_snapshot)
                    ? line.fnb_course_snapshot
                    : 'main',
                modifiers_snapshot: line.fnb_modifiers_snapshot || null,
                special_instructions: line.fnb_special_instructions || null,
                kitchen_station_id: Number.parseInt(line.fnb_kitchen_station_snapshot?.kitchen_station_id, 10) || null,
                status: 'sent'
            }))
            .filter((line) => Number.isInteger(line.item_id) && line.item_id > 0 && Number.isFinite(line.quantity) && line.quantity > 0);

        const existingLines = await FnbCheckLine.findAll({
            where: { check_id: checkId },
            order: [['created_at', 'ASC']],
            transaction,
            lock: options.lock && transaction ? transaction.LOCK.UPDATE : undefined
        });
        if (existingLines.length > 0) {
            lineRows = existingLines.map(toPlain).map((line) => ({
                check_line_id: Number.parseInt(line.check_line_id, 10) || null,
                check_id: checkId,
                item_id: Number.parseInt(line.item_id, 10),
                quantity: Number(line.quantity),
                course: ['appetizer', 'main', 'dessert', 'drink', 'other'].includes(line.course) ? line.course : 'main',
                modifiers_snapshot: line.modifiers_snapshot || null,
                special_instructions: line.special_instructions || null,
                kitchen_station_id: Number.parseInt(line.kitchen_station_id, 10) || null,
                status: line.status || 'sent'
            })).filter((line) => Number.isInteger(line.item_id) && line.item_id > 0 && Number.isFinite(line.quantity) && line.quantity > 0);
            await FnbCheckLine.update(
                { status: 'sent' },
                {
                    where: {
                        check_id: checkId,
                        status: { [Op.in]: ['pending', 'sent'] }
                    },
                    transaction
                }
            );
        } else if (lineRows.length > 0) {
            await FnbCheckLine.bulkCreate(lineRows, { transaction });
        }

        const ticket = await FnbKitchenTicket.create({
            check_id: checkId,
            kitchen_station_id: lineRows.find((line) => line.kitchen_station_id)?.kitchen_station_id || null,
            ticket_number: `WEB-${posTransactionId}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
            status: 'queued',
            lines_snapshot: {
                source: 'storefront_checkout',
                pos_transaction_id: posTransactionId,
                lines: lineRows,
                recipe_movements: Array.isArray(payload.recipe_movements) ? payload.recipe_movements : []
            },
            fired_at: new Date()
        }, { transaction });

        await PosTransaction.update(
            {
                fnb_check_id: checkId,
                fnb_metadata: {
                    source: 'storefront_checkout',
                    check_id: checkId,
                    kitchen_ticket_id: ticket.kitchen_ticket_id
                }
            },
            {
                where: { pos_transaction_id: posTransactionId },
                transaction
            }
        );

        return {
            check: toPlain(check),
            kitchen_ticket: toPlain(ticket)
        };
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
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async updateSettingByKey(key, value, options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        const transaction = options.transaction;
        let row = await SystemSetting.findOne({
            where: { setting_key: key },
            transaction,
            lock: options.lock && transaction ? transaction.LOCK.UPDATE : undefined
        });

        if (!row) {
            row = await SystemSetting.create({
                setting_key: key,
                setting_value: typeof value === 'string' ? value : JSON.stringify(value)
            }, { transaction });
            return toPlain(row);
        }

        await row.update({
            setting_value: typeof value === 'string' ? value : JSON.stringify(value)
        }, { transaction });
        return toPlain(row);
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

    async createOnlineTransactionWithLines({ header, lines, discount = null }, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const PosTransactionLine = dbStore.get('PosTransactionLine');
        const PosTransactionDiscount = dbStore.get('PosTransactionDiscount');
        const PosTransactionDiscountLine = dbStore.get('PosTransactionDiscountLine');
        const DeliveryJob = dbStore.get('DeliveryJob');
        const transaction = options.transaction;

        const created = await PosTransaction.create(header, { transaction });
        await PosTransactionLine.bulkCreate(
            (lines || []).map((line) => ({
                ...line,
                pos_transaction_id: created.pos_transaction_id
            })),
            { transaction }
        );

        if (discount && PosTransactionDiscount && PosTransactionDiscountLine) {
            const createdDiscount = await PosTransactionDiscount.create({
                transaction_id: created.pos_transaction_id,
                discount_rule_id: null,
                discount_type: 'promo',
                discount_method: 'percentage',
                discount_rate: discount.discount_rate,
                discount_amount: discount.discount_amount,
                vat_removed: 0,
                vat_exempt_amount: 0,
                promo_code: discount.promo_code,
                calculation_version: 'pos-discount.v2'
            }, { transaction });
            const transactionLines = await PosTransactionLine.findAll({
                where: { pos_transaction_id: created.pos_transaction_id },
                order: [['line_id', 'ASC']],
                transaction
            });
            const allocations = Array.isArray(discount.lines) ? discount.lines : [];
            const allocationRows = transactionLines.map((line, index) => {
                const allocation = allocations[index] || {};
                return {
                    transaction_discount_id: createdDiscount.id,
                    transaction_line_id: line.line_id,
                    item_id: line.item_id,
                    eligible_quantity: allocation.eligible_quantity || 0,
                    gross_eligible_amount: allocation.gross_eligible_amount || 0,
                    vat_removed: 0,
                    vat_exempt_amount: 0,
                    discount_amount: allocation.discount_amount || 0,
                    final_line_amount: allocation.final_line_amount ?? line.line_subtotal
                };
            });
            if (allocationRows.length > 0) {
                await PosTransactionDiscountLine.bulkCreate(allocationRows, { transaction });
            }
        }

        if (header.order_method === 'delivery' && DeliveryJob) {
            await DeliveryJob.create({
                pos_transaction_id: created.pos_transaction_id,
                location_id: header.location_id || null,
                provider: 'manual',
                status: 'pending_dispatch'
            }, { transaction });
        }

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
