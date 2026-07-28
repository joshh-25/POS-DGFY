import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import logger from '../../../config/logger.js';
import { validateComposition as validateCompositionDependency, invalidateDependencyGraphCache } from '../../../services/compositionValidationService.js';
import { getAllSettingsUseCase } from '../../settings/index.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { createStockMovement } from '../../../services/stockMovementService.js';
import { searchByMeaning, syncItemEmbedding } from '../../../services/embeddingService.js';
import { getVariations } from '../../../config/searchSynonyms.js';
import { buildVisibleWhere, notFoundError } from '../../../utils/softDeletePolicy.js';
import { assertItemRepositoryContract } from '../contracts/itemRepository.contract.js';
import {
    DEFAULT_WORKFLOW_MODE,
    normalizeWorkflowMode,
    resolveWorkflowModeFamily,
    ENABLED_CAPABILITIES_SETTING_KEY,
    normalizeEnabledCapabilities
} from '../../shared/constants/workflowModes.js';
import { resolveStorefrontCatalogVisibility } from '../../shared/utils/catalogVisibilityPolicy.js';
import {
    buildCatalogSetupRecommendation,
    buildStorefrontReadiness
} from '../../shared/utils/catalogSetupPolicy.js';
import { deriveImageAssetVariantUrls } from '../../shared/utils/imageAssetStorage.js';
import {
    buildBarcodeConflictPayload,
    detectBarcodeSymbology,
    generateInternalBarcodeValue,
    normalizeBarcodeMultiplier,
    normalizeBarcodePackagingLevel,
    normalizeBarcodeScope,
    normalizeBarcodeSource,
    normalizeBarcodeValue
} from '../../shared/utils/barcodePolicy.js';
import {
    getItemCostMetrics,
    getItemsCostMetrics,
    invalidateItemCostMetricsCache
} from '../services/costValuationService.js';

const settingsCache = new Map();
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const MANUFACTURING_PURCHASABLE_CATEGORIES = Object.freeze(['raw_material', 'packaging', 'supplies']);
const MSME_PURCHASABLE_CATEGORIES = Object.freeze(['raw_material', 'packaging', 'supplies', 'product']);

export const inventoryRepositoryDependencies = {
    validateComposition: validateCompositionDependency,
    invalidateDependencyGraphCache,
    getAllSettings: async () => unwrapApplicationResultOrThrow(
        await getAllSettingsUseCase(),
        'Failed to retrieve settings'
    ),
    createStockMovement,
    syncItemEmbedding,
    searchByMeaning
};

const visibleItemWhere = (where = {}) => {
    return buildVisibleWhere(where, {
        statusField: 'status',
        excludeInactiveStatus: true
    });
};

const activeFolderWhere = (where = {}) => ({
    ...where,
    is_active: true,
    deleted_at: null
});

const hasOwn = (obj, key) => Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);

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
        && message.includes('storefront_image_gallery');
};

const withoutStorefrontImageGallery = (payload = {}) => {
    const rest = { ...payload };
    delete rest.storefront_image_gallery;
    return rest;
};

const isMissingStorefrontLocationItemOverrideTableError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' && message.includes('storefront_location_item_overrides');
};

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeLocationAvailabilityEntries = (entries = []) => (
    (Array.isArray(entries) ? entries : [])
        .map((entry) => ({
            location_id: parsePositiveInt(entry?.location_id),
            storefront_available: entry?.storefront_available !== false
        }))
        .filter((entry) => entry.location_id)
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
            path: String(entry?.path || '').trim() || null,
            url: String(entry?.url || '').trim() || null,
            variants: entry?.variants && typeof entry.variants === 'object'
                ? {
                    thumbnail_url: entry.variants.thumbnail_url || null,
                    medium_url: entry.variants.medium_url || null,
                    large_url: entry.variants.large_url || null
                }
                : deriveImageAssetVariantUrls({
                    storedPath: String(entry?.path || '').trim() || null,
                    storedUrl: String(entry?.url || '').trim() || null
                }),
            original_path: String(entry?.original_path || '').trim() || null,
            classification: String(entry?.classification || '').trim() || null,
            source: entry?.source && typeof entry.source === 'object'
                ? {
                    type: String(entry.source.type || '').trim() || null,
                    provider: String(entry.source.provider || '').trim() || null,
                    barcode: String(entry.source.barcode || '').trim() || null,
                    product_url: String(entry.source.product_url || '').trim() || null,
                    source_image_url: String(entry.source.source_image_url || '').trim() || null,
                    attribution_label: String(entry.source.attribution_label || '').trim() || null,
                    attribution_url: String(entry.source.attribution_url || '').trim() || null,
                    database_license: String(entry.source.database_license || '').trim() || null,
                    image_license: String(entry.source.image_license || '').trim() || null,
                    imported_at: String(entry.source.imported_at || '').trim() || null
                }
                : null,
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

const buildStorefrontImageGallery = ({ primaryPath = null, primaryUrl = null, gallery = [] } = {}) => {
    const normalized = normalizeStorefrontImageGallery(gallery);
    const primary = {
        path: primaryPath || normalized[0]?.path || null,
        url: primaryUrl || normalized[0]?.url || null,
        is_primary: true,
        sort_order: 0
    };
    const dedupeKey = `${primary.path || ''}|${primary.url || ''}`;
    const rest = normalized
        .filter((entry) => `${entry.path || ''}|${entry.url || ''}` !== dedupeKey)
        .map((entry, index) => ({
            path: entry.path || null,
            url: entry.url || null,
            variants: entry.variants || deriveImageAssetVariantUrls({
                storedPath: entry.path || null,
                storedUrl: entry.url || null
            }),
            original_path: entry.original_path || null,
            classification: entry.classification || null,
            source: entry.source || null,
            is_primary: false,
            sort_order: index + 1
        }));
    const enrichedPrimary = (primary.path || primary.url)
        ? {
            ...primary,
            variants: deriveImageAssetVariantUrls({
                storedPath: primary.path || null,
                storedUrl: primary.url || null
            }),
            original_path: normalized[0]?.original_path || null,
            classification: normalized[0]?.classification || null,
            source: normalized[0]?.source || null
        }
        : null;
    return enrichedPrimary ? [enrichedPrimary, ...rest] : rest;
};

const getCachedSettingsForTenant = async () => {
    const store = dbStore.getStore();
    const tenantKey = store?.tenantId ?? 'default';
    const cached = settingsCache.get(tenantKey);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.settings;
    }

    const settings = await inventoryRepositoryDependencies.getAllSettings();
    settingsCache.set(tenantKey, {
        settings,
        expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS
    });
    return settings;
};

/**
 * Resolve the current workflow mode using the tenant-scoped settings cache (5-minute TTL).
 * Exported for use by the inventory module composition root to avoid redundant uncached
 * settings reads per item during bulk operations such as CSV batch imports.
 */
export const resolveCachedWorkflowMode = async () => {
    const settings = await getCachedSettingsForTenant();
    const configuredMode = settings?.[WORKFLOW_MODE_SETTING_KEY]?.value;
    return normalizeWorkflowMode(configuredMode ?? DEFAULT_WORKFLOW_MODE);
};

/**
 * Resolve the tenant's enabled_capabilities overlay using the same
 * tenant-scoped settings cache as resolveCachedWorkflowMode (5-minute TTL,
 * no extra query - it's the same cached settings object). Exported for use
 * by the inventory module composition root so item-taxonomy validation can
 * honor capabilities composed onto the base workflow mode.
 */
export const resolveCachedEnabledCapabilities = async () => {
    const settings = await getCachedSettingsForTenant();
    return normalizeEnabledCapabilities(settings?.[ENABLED_CAPABILITIES_SETTING_KEY]?.value);
};

const calculateThresholds = async (maxCapacity) => {
    const settings = await getCachedSettingsForTenant();

    const autoCalc = settings.enable_auto_reorder?.value ?? true;
    if (!autoCalc) {
        return { min_threshold: null, purchase_allowance: null };
    }
    if (!maxCapacity || maxCapacity <= 0) {
        return { min_threshold: null, purchase_allowance: null };
    }

    const minPercent = (settings.min_stock_threshold_percent?.value || 40) / 100;
    const allowancePercent = (settings.purchase_allowance_percent?.value || 20) / 100;
    return {
        min_threshold: Math.round(maxCapacity * minPercent),
        purchase_allowance: Math.round(maxCapacity * allowancePercent)
    };
};

const findVisibleItemById = async (Item, itemId, queryOptions = {}) => {
    const { where = {}, ...rest } = queryOptions;
    return Item.findOne({
        ...rest,
        where: visibleItemWhere({ ...where, item_id: itemId })
    });
};

const normalizeOptionalNumber = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSkuKey = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized || null;
};

const isActiveSkuUniqueConstraintError = (error) => {
    if (!error) return false;
    if (error?.statusCode === 409) return true;

    const isSequelizeUniqueError = error?.name === 'SequelizeUniqueConstraintError';
    if (!isSequelizeUniqueError) return false;

    const constraint = String(
        error?.parent?.constraint
        || error?.original?.constraint
        || error?.constraint
        || ''
    );
    if (constraint === 'uq_items_active_sku_code') return true;

    const fields = Object.keys(error?.fields || {});
    if (fields.includes('active_sku_code')) return true;

    return (Array.isArray(error?.errors) ? error.errors : []).some((entry) => (
        String(entry?.path || '').toLowerCase() === 'active_sku_code'
    ));
};

const normalizeSkuConflictError = (error) => {
    if (!isActiveSkuUniqueConstraintError(error)) return error;
    if (error?.statusCode === 409 && error?.message === 'Item with this SKU code already exists') {
        return error;
    }

    const conflictError = new Error('Item with this SKU code already exists');
    conflictError.statusCode = 409;
    return conflictError;
};

const isActiveBarcodeUniqueConstraintError = (error) => {
    if (!error) return false;
    if (error?.statusCode === 409) return true;
    if (error?.name !== 'SequelizeUniqueConstraintError') return false;
    const constraint = String(
        error?.parent?.constraint
        || error?.original?.constraint
        || error?.constraint
        || ''
    );
    if (constraint === 'uq_item_barcodes_active_normalized_code') return true;
    const fields = Object.keys(error?.fields || {});
    return fields.includes('active_normalized_code');
};

const barcodeConflictError = (existing) => {
    const error = new Error('Barcode is already assigned to another active record');
    error.statusCode = 409;
    error.details = buildBarcodeConflictPayload(existing);
    return error;
};

const serializeBarcodeRow = (row) => {
    const payload = toPlain(row);
    if (!payload) return null;
    return {
        ...payload,
        quantity_multiplier: Number(payload.quantity_multiplier || 1),
        item: payload.item
            ? {
                item_id: payload.item.item_id,
                name: payload.item.name,
                sku_code: payload.item.sku_code,
                category: payload.item.category,
                product_type: payload.item.product_type || null,
                unit_of_measure: payload.item.unit_of_measure || null,
                default_sale_price: payload.item.default_sale_price ?? null,
                current_stock: payload.item.current_stock ?? null,
                status: payload.item.status ?? null
            }
            : undefined
    };
};

const BARCODE_LABEL_LAYOUTS = Object.freeze({
    item: {
        title: 'Item label',
        purpose: 'item_identity',
        size: 'standard',
        width_mm: 62,
        height_mm: 40,
        primary_payload: 'barcode'
    },
    shelf: {
        title: 'Shelf label',
        purpose: 'shelf_lookup',
        size: 'wide',
        width_mm: 80,
        height_mm: 38,
        primary_payload: 'barcode'
    },
    package: {
        title: 'Package label',
        purpose: 'package_quantity',
        size: 'standard',
        width_mm: 62,
        height_mm: 40,
        primary_payload: 'barcode'
    },
    case: {
        title: 'Case label',
        purpose: 'case_quantity',
        size: 'large',
        width_mm: 90,
        height_mm: 50,
        primary_payload: 'barcode'
    },
    batch: {
        title: 'Batch/Lot label',
        purpose: 'batch_lookup',
        size: 'wide',
        width_mm: 80,
        height_mm: 38,
        primary_payload: 'barcode'
    },
    service: {
        title: 'Service label',
        purpose: 'service_sale',
        size: 'standard',
        width_mm: 62,
        height_mm: 40,
        primary_payload: 'barcode'
    },
    ticket: {
        title: 'Ticket label',
        purpose: 'ticket_reference',
        size: 'large',
        width_mm: 90,
        height_mm: 50,
        primary_payload: 'qr'
    },
    booking: {
        title: 'Booking label',
        purpose: 'booking_reference',
        size: 'large',
        width_mm: 90,
        height_mm: 50,
        primary_payload: 'qr'
    }
});

const normalizeBarcodeLabelType = (value) => {
    const normalized = String(value || 'item').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(BARCODE_LABEL_LAYOUTS, normalized)
        ? normalized
        : 'item';
};

const barcodeIncludeItem = () => ([{
    model: dbStore.get('Item'),
    as: 'item',
    attributes: [
        'item_id',
        'name',
        'sku_code',
        'category',
        'product_type',
        'mode_item_preset',
        'unit_of_measure',
        'default_sale_price',
        'current_stock',
        'status'
    ],
    required: false
}]);

const auditBarcodeEvent = async ({
    userId = null,
    barcode = null,
    itemId = null,
    action = 'UPDATE',
    eventType,
    changes = null,
    transaction = null
} = {}) => {
    const AuditLog = dbStore.get('AuditLog');
    if (!AuditLog || !eventType) return;
    await AuditLog.create({
        user_id: userId || null,
        entity_type: 'item_barcode',
        entity_id: barcode?.item_barcode_id || itemId || null,
        action,
        changes: {
            event_type: eventType,
            item_barcode_id: barcode?.item_barcode_id || null,
            item_id: barcode?.item_id || itemId || null,
            ...changes
        }
    }, { transaction });
};

const getCurrentWorkflowMode = async () => {
    const settings = await getCachedSettingsForTenant();
    const configuredMode = settings?.[WORKFLOW_MODE_SETTING_KEY]?.value;
    return normalizeWorkflowMode(configuredMode ?? DEFAULT_WORKFLOW_MODE);
};

const getPurchasableCategoriesForWorkflow = (workflowMode) => (
    resolveWorkflowModeFamily(workflowMode) === 'msme'
        ? MSME_PURCHASABLE_CATEGORIES
        : MANUFACTURING_PURCHASABLE_CATEGORIES
);

const assertMsmePricingRequirements = ({ workflowMode, status, costPerUnit, defaultSalePrice }) => {
    if (resolveWorkflowModeFamily(workflowMode) !== 'msme') return;
    if (String(status || '').toLowerCase() === 'draft') return;

    if (costPerUnit === null || costPerUnit === undefined || costPerUnit === '') {
        const error = new Error('cost_per_unit is required for MSME items');
        error.statusCode = 422;
        throw error;
    }

    if (defaultSalePrice === null || defaultSalePrice === undefined || defaultSalePrice === '') {
        const error = new Error('default_sale_price is required for MSME items');
        error.statusCode = 422;
        throw error;
    }
};

const calculateRecipeCost = (productCompositions) => {
    if (!productCompositions || productCompositions.length === 0) {
        return 0;
    }

    return productCompositions.reduce((total, comp) => {
        const ingredientCost = parseFloat(comp.ingredient?.cost_per_unit || 0);
        const quantity = parseFloat(comp.quantity_required || 0);
        return total + (ingredientCost * quantity);
    }, 0);
};

const saveRelatedWizardData = async (itemId, wizardData, transaction, options = {}) => {
    const ItemNutrition = dbStore.get('ItemNutrition');
    const ItemAllergen = dbStore.get('ItemAllergen');
    const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
    const ItemShelfLife = dbStore.get('ItemShelfLife');
    const ItemPackaging = dbStore.get('ItemPackaging');
    const ItemQualityControl = dbStore.get('ItemQualityControl');
    const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
    const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
    const ProductComposition = dbStore.get('ProductComposition');

    const promises = [];

    if (wizardData.nutritional_info && Object.keys(wizardData.nutritional_info).length > 0) {
        promises.push(
            ItemNutrition.upsert({
                item_id: itemId,
                ...wizardData.nutritional_info
            }, { transaction })
        );
    }

    if ((wizardData.allergens && wizardData.allergens.length > 0)
        || (wizardData.may_contain_allergens && wizardData.may_contain_allergens.length > 0)) {
        promises.push(
            ItemAllergen.destroy({ where: { item_id: itemId }, transaction })
        );

        const allergenRows = [];
        if (wizardData.allergens && wizardData.allergens.length > 0) {
            allergenRows.push(...wizardData.allergens.map((allergen) => ({
                item_id: itemId,
                allergen_name: allergen,
                is_cross_contamination: false
            })));
        }
        if (wizardData.may_contain_allergens && wizardData.may_contain_allergens.length > 0) {
            allergenRows.push(...wizardData.may_contain_allergens.map((allergen) => ({
                item_id: itemId,
                allergen_name: allergen,
                is_cross_contamination: true
            })));
        }
        if (allergenRows.length > 0) {
            promises.push(ItemAllergen.bulkCreate(allergenRows, { transaction }));
        }
    }

    const clearManufacturingProperties = options.clearManufacturingProperties === true;
    const hasPhysicalPropertiesPayload = hasOwn(wizardData, 'physical_properties');
    const hasQualityControlPayload = hasOwn(wizardData, 'quality_control');

    if (clearManufacturingProperties && hasPhysicalPropertiesPayload && ItemPhysicalProperties?.destroy) {
        promises.push(ItemPhysicalProperties.destroy({ where: { item_id: itemId }, transaction }));
    } else if (wizardData.physical_properties && Object.keys(wizardData.physical_properties).length > 0) {
        promises.push(
            ItemPhysicalProperties.upsert({
                item_id: itemId,
                ...wizardData.physical_properties
            }, { transaction })
        );
    }

    if (wizardData.shelf_life && Object.keys(wizardData.shelf_life).length > 0) {
        promises.push(
            ItemShelfLife.upsert({
                item_id: itemId,
                ...wizardData.shelf_life
            }, { transaction })
        );
    }

    if (wizardData.packaging_info && Object.keys(wizardData.packaging_info).length > 0) {
        promises.push(
            ItemPackaging.upsert({
                item_id: itemId,
                ...wizardData.packaging_info
            }, { transaction })
        );
    }

    if (clearManufacturingProperties && hasQualityControlPayload && ItemQualityControl?.destroy) {
        promises.push(ItemQualityControl.destroy({ where: { item_id: itemId }, transaction }));
    } else if (wizardData.quality_control && Object.keys(wizardData.quality_control).length > 0) {
        promises.push(
            ItemQualityControl.upsert({
                item_id: itemId,
                ...wizardData.quality_control
            }, { transaction })
        );
    }

    if (wizardData.regulatory_compliance && Object.keys(wizardData.regulatory_compliance).length > 0) {
        promises.push(
            ItemRegulatoryCompliance.upsert({
                item_id: itemId,
                ...wizardData.regulatory_compliance
            }, { transaction })
        );
    }

    const hasCostData = wizardData.labor_cost || wizardData.overhead_cost || wizardData.additional_packaging_cost;
    if (hasCostData) {
        promises.push(
            ItemCostBreakdown.upsert({
                item_id: itemId,
                labor_cost: wizardData.labor_cost || 0,
                overhead_cost: wizardData.overhead_cost || 0,
                additional_packaging_cost: wizardData.additional_packaging_cost || 0
            }, { transaction })
        );
    }

    if (wizardData.ingredients && wizardData.ingredients.length > 0) {
        const ingredientIds = wizardData.ingredients
            .filter((ingredient) => ingredient.item_id)
            .map((ingredient) => parseInt(ingredient.item_id, 10));

        if (ingredientIds.length > 0) {
            const validation = await inventoryRepositoryDependencies.validateComposition(itemId, ingredientIds);
            if (!validation.valid) {
                const error = new Error('Invalid product composition');
                error.statusCode = 400;
                error.details = validation.errors.map((validationError) => validationError.message);
                throw error;
            }

            const Item = dbStore.get('Item');
            await Item.update({
                nesting_level: validation.nestingLevel,
                max_child_depth: Math.max(0, validation.nestingLevel - 1)
            }, { where: buildVisibleWhere({ item_id: itemId }), transaction });
        }

        promises.push(
            ProductComposition.destroy({
                where: { product_id: itemId, composition_type: 'ingredient' },
                transaction
            })
        );

        const Item = dbStore.get('Item');
        const ingredientItems = await Item.findAll({
            where: visibleItemWhere({ item_id: ingredientIds }),
            attributes: ['item_id', 'category']
        });
        const ingredientCategoryMap = new Map(
            ingredientItems.map((ingredientItem) => [ingredientItem.item_id, ingredientItem.category])
        );

        const ingredientRows = wizardData.ingredients
            .filter((ingredient) => ingredient.item_id && ingredient.quantity)
            .map((ingredient) => ({
                product_id: itemId,
                ingredient_id: ingredient.item_id,
                composition_type: 'ingredient',
                quantity_required: ingredient.quantity,
                unit_of_measure: ingredient.unit_of_measure || null,
                is_subproduct: ingredientCategoryMap.get(parseInt(ingredient.item_id, 10)) === 'product'
            }));

        if (ingredientRows.length > 0) {
            promises.push(
                ProductComposition.bulkCreate(ingredientRows, { transaction })
            );
            promises.push(inventoryRepositoryDependencies.invalidateDependencyGraphCache());
        }
    }

    if (wizardData.packaging_items && wizardData.packaging_items.length > 0) {
        promises.push(
            ProductComposition.destroy({
                where: { product_id: itemId, composition_type: 'packaging' },
                transaction
            })
        );

        const packagingRows = wizardData.packaging_items
            .filter((packagingItem) => packagingItem.item_id && packagingItem.quantity)
            .map((packagingItem) => ({
                product_id: itemId,
                ingredient_id: packagingItem.item_id,
                composition_type: 'packaging',
                quantity_required: packagingItem.quantity,
                unit_of_measure: packagingItem.unit_of_measure || null
            }));

        if (packagingRows.length > 0) {
            promises.push(
                ProductComposition.bulkCreate(packagingRows, { transaction })
            );
        }
    }

    await Promise.all(promises);
};

export const itemRepository = {
    async beginTransaction() {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        return sequelize.transaction();
    },

    async getItems(queryParams = {}) {
        const Item = dbStore.get('Item');
        const ProductComposition = dbStore.get('ProductComposition');
        const ItemFolder = dbStore.get('ItemFolder');
        const valuationLocationId = Number.parseInt(queryParams?.valuation_location_id, 10);
        const hasValuationLocation = Number.isInteger(valuationLocationId) && valuationLocationId > 0;

        if (queryParams.fields === 'dropdown') {
            const { limit = 1000, category, status } = queryParams;
            const where = visibleItemWhere({});
            if (category) where.category = category;
            if (status) where.status = status;

            const rows = await Item.findAll({
                where,
                attributes: ['item_id', 'sku_code', 'name', 'unit_of_measure', 'category', 'product_type', 'mode_item_preset', 'status', 'current_stock', 'cost_per_unit', 'default_sale_price', 'fifo_enabled'],
                order: [['name', 'ASC']],
                limit: parseInt(limit, 10)
            });

            const items = rows.map((item) => ({ ...item.toJSON(), id: item.item_id }));
            const costMetricsByItemId = await getItemsCostMetrics({
                items,
                locationId: hasValuationLocation ? valuationLocationId : null
            });
            const itemsWithCostMetrics = items.map((item) => ({
                ...item,
                cost_metrics: costMetricsByItemId.get(Number(item.item_id))
            }));
            return {
                items: itemsWithCostMetrics,
                pagination: {
                    page: 1,
                    limit: parseInt(limit, 10),
                    total: itemsWithCostMetrics.length,
                    pages: 1
                }
            };
        }

        const {
            page = 1,
            limit = 20,
            category,
            search,
            sortBy = 'name',
            sortOrder = 'asc',
            status
        } = queryParams;

        const parsedPage = parseInt(page, 10);
        const parsedLimit = parseInt(limit, 10);
        const offset = (parsedPage - 1) * parsedLimit;
        const where = visibleItemWhere({});

        let semanticIds = [];

        if (search && search.length > 2) {
            try {
                const semanticResults = await inventoryRepositoryDependencies.searchByMeaning(search, 50, 0.4);
                if (semanticResults.length > 0) {
                    semanticIds = semanticResults.map((result) => result.item_id);
                }
            } catch (error) {
                console.error('Semantic search failed', error);
            }
        }

        if (category) {
            where.category = category;
        }

        if (status) {
            where.status = status;
        }

        if (queryParams.folder_id) {
            if (queryParams.folder_id === 'null' || queryParams.folder_id === 'none') {
                where.folder_id = null;
            } else {
                where.folder_id = queryParams.folder_id;
            }
        }

        if (search) {
            const cleanSearch = search.trim();
            const terms = cleanSearch.split(/\s+/).filter((term) => term.length > 0);

            if (terms.length > 0) {
                where[Op.and] = terms.map((term) => {
                    const variations = getVariations(term);
                    return {
                        [Op.or]: [
                            ...variations.map((variation) => ({ name: { [Op.like]: `%${variation}%` } })),
                            ...variations.map((variation) => ({ sku_code: { [Op.like]: `%${variation}%` } })),
                            ...variations.map((variation) => ({ description: { [Op.like]: `%${variation}%` } }))
                        ]
                    };
                });
            }

            if (semanticIds && semanticIds.length > 0) {
                if (where[Op.and]) {
                    const keywordLogic = where[Op.and];
                    delete where[Op.and];
                    where[Op.or] = [
                        { [Op.and]: keywordLogic },
                        { item_id: { [Op.in]: semanticIds } }
                    ];
                } else {
                    where.item_id = { [Op.in]: semanticIds };
                }
            }
        }

        const order = [[sortBy, sortOrder.toUpperCase()]];

        const { count, rows } = await Item.findAndCountAll({
            where,
            include: [
                {
                    model: ProductComposition,
                    as: 'productCompositions',
                    required: false,
                    include: [{
                        model: Item,
                        as: 'ingredient',
                        attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'current_stock', 'cost_per_unit']
                    }]
                },
                {
                    model: ItemFolder,
                    as: 'folder',
                    attributes: ['folder_id', 'name']
                }
            ],
            limit: parsedLimit,
            offset: parseInt(offset, 10),
            order
        });

        const transformedItems = rows.map((item) => {
            const itemData = item.toJSON();
            const transformed = {
                ...itemData,
                id: itemData.item_id
            };

            if (itemData.category === 'product' && itemData.productCompositions && itemData.productCompositions.length > 0) {
                transformed.ingredients = itemData.productCompositions
                    .filter((comp) => comp.composition_type === 'ingredient')
                    .map((comp) => ({
                        item_id: comp.ingredient_id,
                        item_name: comp.ingredient?.name || '',
                        quantity: comp.quantity_required,
                        unit: comp.ingredient?.unit_of_measure || 'units'
                    }));

                delete transformed.productCompositions;
            } else {
                delete transformed.productCompositions;
            }

            if (itemData.category === 'product') {
                transformed.recipe_cost = calculateRecipeCost(itemData.productCompositions);
            }

            return transformed;
        });

        const costMetricsByItemId = await getItemsCostMetrics({
            items: transformedItems,
            locationId: hasValuationLocation ? valuationLocationId : null
        });

        const itemsWithCostMetrics = transformedItems.map((item) => ({
            ...item,
            cost_metrics: costMetricsByItemId.get(Number(item.item_id))
        }));

        return {
            items: itemsWithCostMetrics,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total: count,
                pages: Math.ceil(count / parsedLimit)
            }
        };
    },
    async getItemById(itemId, queryParams = {}) {
        const Item = dbStore.get('Item');
        const ItemNutrition = dbStore.get('ItemNutrition');
        const ItemAllergen = dbStore.get('ItemAllergen');
        const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
        const ItemShelfLife = dbStore.get('ItemShelfLife');
        const ItemPackaging = dbStore.get('ItemPackaging');
        const ItemQualityControl = dbStore.get('ItemQualityControl');
        const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
        const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
        const ProductComposition = dbStore.get('ProductComposition');
        const FIFOBatch = dbStore.get('FIFOBatch');
        const TenantLocation = dbStore.get('TenantLocation');
        const ItemLocationStock = dbStore.get('ItemLocationStock');
        const SupplierItem = dbStore.get('SupplierItem');
        const Supplier = dbStore.get('Supplier');
        const ItemFolder = dbStore.get('ItemFolder');

        const hasLocationStocksAssociation = Boolean(
            ItemLocationStock?.findAll && Item?.associations?.locationStocks
        );
        const canIncludeLocationOnLocationStocks = Boolean(
            hasLocationStocksAssociation && ItemLocationStock?.associations?.location && TenantLocation
        );

        const item = await findVisibleItemById(Item, itemId, {
            include: [
                { model: ItemNutrition, as: 'nutrition', required: false },
                { model: ItemAllergen, as: 'allergens', required: false },
                { model: ItemPhysicalProperties, as: 'physicalProperties', required: false },
                { model: ItemShelfLife, as: 'shelfLife', required: false },
                { model: ItemPackaging, as: 'packaging', required: false },
                { model: ItemQualityControl, as: 'qualityControl', required: false },
                { model: ItemRegulatoryCompliance, as: 'regulatoryCompliance', required: false },
                { model: ItemCostBreakdown, as: 'costBreakdown', required: false },
                {
                    model: ProductComposition,
                    as: 'productCompositions',
                    required: false,
                    include: [{ model: Item, as: 'ingredient', required: false }]
                },
                {
                    model: FIFOBatch,
                    as: 'fifoBatches',
                    required: false,
                    include: [{ model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false }]
                },
                ...(hasLocationStocksAssociation ? [{
                    model: ItemLocationStock,
                    as: 'locationStocks',
                    required: false,
                    ...(canIncludeLocationOnLocationStocks
                        ? { include: [{ model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false }] }
                        : {})
                }] : []),
                {
                    model: SupplierItem,
                    as: 'supplierItems',
                    required: false,
                    include: [
                        {
                            model: Supplier,
                            as: 'supplier',
                            required: false,
                            where: buildVisibleWhere({}, {
                                statusField: 'status',
                                excludeInactiveStatus: true
                            })
                        }
                    ]
                },
                { model: ItemFolder, as: 'folder', required: false }
            ]
        });

        if (!item) {
            throw notFoundError('Item not found');
        }

        const formattedItem = item.toJSON();

        formattedItem.suppliers = formattedItem.supplierItems?.map((supplierItem) => ({
            supplier_id: supplierItem.supplier.supplier_id,
            name: supplierItem.supplier.name,
            moq: supplierItem.moq,
            price_per_unit: supplierItem.price_per_unit
        })) || [];
        delete formattedItem.supplierItems;

        if (formattedItem.allergens && Array.isArray(formattedItem.allergens)) {
            const directAllergens = formattedItem.allergens
                .filter((allergen) => !allergen.is_cross_contamination)
                .map((allergen) => allergen.allergen_name);
            const mayContainAllergens = formattedItem.allergens
                .filter((allergen) => allergen.is_cross_contamination)
                .map((allergen) => allergen.allergen_name);

            formattedItem.allergens = directAllergens;
            formattedItem.may_contain_allergens = mayContainAllergens;
        }

        if (formattedItem.nutrition) {
            formattedItem.nutritional_info = formattedItem.nutrition;
            delete formattedItem.nutrition;
        }

        if (formattedItem.physicalProperties) {
            formattedItem.physical_properties = formattedItem.physicalProperties;
            delete formattedItem.physicalProperties;
        }

        if (formattedItem.shelfLife) {
            formattedItem.shelf_life = formattedItem.shelfLife;
            delete formattedItem.shelfLife;
        }

        if (formattedItem.packaging) {
            formattedItem.packaging_info = formattedItem.packaging;
            delete formattedItem.packaging;
        }

        if (formattedItem.qualityControl) {
            formattedItem.quality_control = formattedItem.qualityControl;
            delete formattedItem.qualityControl;
        }

        if (formattedItem.regulatoryCompliance) {
            formattedItem.regulatory_compliance = formattedItem.regulatoryCompliance;
            delete formattedItem.regulatoryCompliance;
        }

        if (formattedItem.costBreakdown) {
            formattedItem.labor_cost = formattedItem.costBreakdown.labor_cost;
            formattedItem.overhead_cost = formattedItem.costBreakdown.overhead_cost;
            formattedItem.additional_packaging_cost = formattedItem.costBreakdown.additional_packaging_cost;
            delete formattedItem.costBreakdown;
        }

        if (formattedItem.productCompositions) {
            formattedItem.ingredients = formattedItem.productCompositions
                .filter((comp) => comp.composition_type === 'ingredient')
                .map((comp) => ({
                    item_id: comp.ingredient_id,
                    item_name: comp.ingredient?.name,
                    quantity: comp.quantity_required,
                    unit_of_measure: comp.ingredient?.unit_of_measure
                }));

            formattedItem.packaging_items = formattedItem.productCompositions
                .filter((comp) => comp.composition_type === 'packaging')
                .map((comp) => ({
                    item_id: comp.ingredient_id,
                    item_name: comp.ingredient?.name,
                    quantity: comp.quantity_required,
                    unit_of_measure: comp.ingredient?.unit_of_measure
                }));

            delete formattedItem.productCompositions;
            formattedItem.recipe_cost = calculateRecipeCost(item.productCompositions);
        }

        if (formattedItem.fifoBatches) {
            formattedItem.fifo_batches = formattedItem.fifoBatches;
            delete formattedItem.fifoBatches;
        }

        if (Array.isArray(formattedItem.locationStocks)) {
            formattedItem.item_location_stocks = formattedItem.locationStocks.map((stockRow) => ({
                item_location_stock_id: stockRow.item_location_stock_id,
                item_id: stockRow.item_id,
                location_id: stockRow.location_id,
                quantity_on_hand: Number.parseFloat(stockRow.quantity_on_hand || 0),
                location_name: stockRow.location?.name || null
            }));
            delete formattedItem.locationStocks;
        } else {
            formattedItem.item_location_stocks = [];
        }

        const valuationLocationId = Number.parseInt(queryParams?.valuation_location_id, 10);
        const hasValuationLocation = Number.isInteger(valuationLocationId) && valuationLocationId > 0;
        formattedItem.cost_metrics = await getItemCostMetrics({
            item: formattedItem,
            locationId: hasValuationLocation ? valuationLocationId : null,
            includeByLocation: true
        });

        return formattedItem;
    },
    async createItem(itemData, userId = null, { canManageCategories = false } = {}) {
        const Item = dbStore.get('Item');
        const ItemFolder = dbStore.get('ItemFolder');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const workflowMode = await getCurrentWorkflowMode();
            if (itemData?.sku_code !== undefined) {
                itemData.sku_code = String(itemData.sku_code || '').trim();
            }
            const normalizedSku = normalizeSkuKey(itemData?.sku_code);
            const requestedCategoryName = String(itemData?.create_category_name || '').trim().replace(/\s+/g, ' ');
            const hasFolderId = Object.prototype.hasOwnProperty.call(itemData || {}, 'folder_id') && itemData.folder_id != null;

            if (requestedCategoryName && hasFolderId) {
                const error = new Error('Select an existing category or enter a new category name, not both.');
                error.statusCode = 422;
                throw error;
            }

            if (requestedCategoryName) {
                if (!canManageCategories) {
                    const error = new Error('Admin access is required to create a category while adding an item.');
                    error.statusCode = 403;
                    throw error;
                }

                const existingFolders = await ItemFolder.findAll({
                    where: activeFolderWhere({ parent_id: null }),
                    attributes: ['folder_id', 'name', 'is_active'],
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                const normalizedRequestedCategoryName = requestedCategoryName.toLowerCase();
                let folder = existingFolders.find((candidate) => (
                    String(candidate?.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedRequestedCategoryName
                ));

                if (!folder) {
                    try {
                        folder = await ItemFolder.create({
                            name: requestedCategoryName,
                            description: '',
                            show_in_pos_filter: true,
                            is_active: true,
                            parent_id: null
                        }, { transaction });
                    } catch (error) {
                        if (error?.name !== 'SequelizeUniqueConstraintError') throw error;

                        folder = await ItemFolder.findOne({
                            where: activeFolderWhere({ parent_id: null, name: requestedCategoryName }),
                            transaction,
                            lock: transaction.LOCK.UPDATE
                        });
                        if (!folder) throw error;
                    }
                }

                itemData.folder_id = folder.folder_id;
                itemData.product_folder = folder.name;
            } else if (hasFolderId) {
                const folderId = Number(itemData.folder_id);
                const folder = Number.isInteger(folderId) && folderId > 0
                    ? await ItemFolder.findOne({
                        where: activeFolderWhere({ folder_id: folderId }),
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    })
                    : null;
                if (!folder) {
                    const error = new Error('The selected category is unavailable. Choose an active category or create a new one.');
                    error.statusCode = 422;
                    throw error;
                }
                itemData.folder_id = folder.folder_id;
                itemData.product_folder = folder.name;
            }
            assertMsmePricingRequirements({
                workflowMode,
                status: itemData?.status,
                costPerUnit: itemData?.cost_per_unit,
                defaultSalePrice: itemData?.default_sale_price
            });

            if (itemData.status !== 'draft' && normalizedSku) {
                const existingItem = await Item.findOne({
                    where: {
                        sku_code: itemData.sku_code,
                        deleted_at: null,
                        status: { [Op.notIn]: ['draft', 'inactive'] }
                    }
                });

                if (existingItem) {
                    const error = new Error('Item with this SKU code already exists');
                    error.statusCode = 409;
                    throw error;
                }
            }

            const {
                labor_cost,
                overhead_cost,
                additional_packaging_cost,
                ingredients,
                packaging_items,
                nutritional_info,
                allergens,
                may_contain_allergens,
                physical_properties,
                shelf_life,
                packaging_info,
                quality_control,
                regulatory_compliance,
                manufacturer_barcode,
                internal_barcode,
                ...dbFields
            } = itemData;

            // This is a command field, not an Item column.
            delete dbFields.create_category_name;

            if (itemData.status === 'draft') {
                dbFields.wizard_metadata = {
                    ...dbFields.wizard_metadata,
                    labor_cost,
                    overhead_cost,
                    additional_packaging_cost,
                    ingredients,
                    packaging_items,
                    nutritional_info,
                    allergens,
                    may_contain_allergens,
                    physical_properties,
                    shelf_life,
                    packaging_info,
                    quality_control,
                    regulatory_compliance
                };
            }

            if (dbFields.max_capacity) {
                const thresholds = await calculateThresholds(dbFields.max_capacity);
                dbFields.min_threshold = thresholds.min_threshold;
                dbFields.purchase_allowance = thresholds.purchase_allowance;
            }

            const isServiceItem = String(dbFields.category || '').trim().toLowerCase() === 'service';
            const dataToCreate = { ...dbFields };
            const initialStock = isServiceItem ? 0 : parseFloat(dbFields.current_stock || 0);
            const movementLocationId = Number.parseInt(dbFields.location_id, 10) || null;
            if (isServiceItem || initialStock > 0) {
                dataToCreate.current_stock = 0;
            }
            delete dataToCreate.location_id;

            // Archetype-based default (see docs/features/INVENTORY_TRACKING_MODES.md):
            // the seller may always override via an explicit tracking_mode on the
            // request; this only fills in the default when they don't. Existing
            // items are never touched here - this is create-time only. Uses the
            // same service definition as isStockExemptServiceItem (category OR
            // mode_item_preset), independent of the narrower isServiceItem above
            // which only governs the pre-existing current_stock zeroing behavior.
            if (!dataToCreate.tracking_mode) {
                const isCapacityItem = isServiceItem
                    || String(dbFields.mode_item_preset || '').trim().toLowerCase() === 'service';
                if (isCapacityItem) {
                    dataToCreate.tracking_mode = 'capacity';
                } else if (dataToCreate.fifo_enabled === true) {
                    dataToCreate.tracking_mode = 'full_fifo';
                } else if (String(dataToCreate.mode_item_preset || '').trim().toLowerCase() === 'menu_item') {
                    dataToCreate.tracking_mode = 'toggle';
                } else {
                    dataToCreate.tracking_mode = 'count_ledger';
                }
            }

            const item = await Item.create(dataToCreate, { transaction });

            const requestedBarcode = manufacturer_barcode?.code
                ? {
                    code: manufacturer_barcode.code,
                    source: 'manufacturer',
                    scope: 'inventory',
                    metadata: { attached_via: 'external_registry_prefill' }
                }
                : internal_barcode?.code
                    ? {
                        code: internal_barcode.code,
                        source: 'tenant_generated',
                        scope: 'pos',
                        metadata: { attached_via: 'manual_internal_barcode' }
                    }
                    : null;

            if (requestedBarcode) {
                const ItemBarcode = dbStore.get('ItemBarcode');
                const normalizedCode = normalizeBarcodeValue(requestedBarcode.code);
                const existingBarcode = await ItemBarcode.findOne({
                    where: { normalized_code: normalizedCode, is_active: true },
                    include: barcodeIncludeItem(),
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (existingBarcode) {
                    throw barcodeConflictError(serializeBarcodeRow(existingBarcode));
                }

                const barcode = await ItemBarcode.create({
                    item_id: item.item_id,
                    code: String(requestedBarcode.code).trim(),
                    normalized_code: normalizedCode,
                    symbology: detectBarcodeSymbology(requestedBarcode.code),
                    source: requestedBarcode.source,
                    scope: requestedBarcode.scope,
                    packaging_level: 'unit',
                    quantity_multiplier: 1,
                    is_primary: true,
                    is_active: true,
                    metadata: requestedBarcode.metadata,
                    created_by: userId || null,
                    updated_by: userId || null
                }, { transaction });

                await auditBarcodeEvent({
                    userId,
                    barcode,
                    action: 'CREATE',
                    eventType: 'barcode.created',
                    changes: {
                        source: requestedBarcode.source,
                        scope: requestedBarcode.scope
                    },
                    transaction
                });
            }

            if (isServiceItem) {
                const ServiceItemDetail = dbStore.get('ServiceItemDetail');
                await ServiceItemDetail.create({ item_id: item.item_id }, { transaction });
            }

            if (initialStock > 0) {
                await inventoryRepositoryDependencies.createStockMovement({
                    item_id: item.item_id,
                    quantity: initialStock,
                    movement_type: 'adjustment',
                    notes: 'Initial stock entry from item creation',
                    reference_type: 'MANUAL',
                    location_id: movementLocationId
                }, userId, transaction);
            }

            const clearManufacturingProperties = workflowMode === 'fnb';
            if (itemData.status === 'active' && itemData.category === 'product') {
                const wizardData = {
                    labor_cost,
                    overhead_cost,
                    additional_packaging_cost,
                    ingredients,
                    packaging_items,
                    nutritional_info,
                    allergens,
                    may_contain_allergens,
                    physical_properties,
                    shelf_life,
                    packaging_info,
                    quality_control,
                    regulatory_compliance
                };

                await saveRelatedWizardData(item.item_id, wizardData, transaction, {
                    clearManufacturingProperties
                });
            }

            await transaction.commit();
            invalidateItemCostMetricsCache({ itemIds: [item.item_id] });

            inventoryRepositoryDependencies.syncItemEmbedding(item).catch((error) => (
                console.error(`Embedding sync failed for new item ${item.item_id}:`, error.message)
            ));

            return itemRepository.getItemById(item.item_id);
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            if (isActiveBarcodeUniqueConstraintError(error)) {
                const ItemBarcode = dbStore.get('ItemBarcode');
                const normalizedCode = normalizeBarcodeValue(
                    itemData?.manufacturer_barcode?.code || itemData?.internal_barcode?.code
                );
                const existing = normalizedCode
                    ? await ItemBarcode.findOne({
                        where: { normalized_code: normalizedCode, is_active: true },
                        include: barcodeIncludeItem()
                    })
                    : null;
                throw barcodeConflictError(serializeBarcodeRow(existing));
            }
            throw normalizeSkuConflictError(error);
        }
    },
    async updateItem(itemId, itemData, userId = null, { canManageCategories = false } = {}) {
        const Item = dbStore.get('Item');
        const ItemFolder = dbStore.get('ItemFolder');
        const ItemLocationStock = dbStore.get('ItemLocationStock');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const workflowMode = await getCurrentWorkflowMode();
            if (Object.prototype.hasOwnProperty.call(itemData || {}, 'sku_code')) {
                itemData.sku_code = String(itemData.sku_code || '').trim();
            }
            const requestedCategoryName = String(itemData?.create_category_name || '').trim().replace(/\s+/g, ' ');
            const hasFolderId = Object.prototype.hasOwnProperty.call(itemData || {}, 'folder_id') && itemData.folder_id != null;

            if (requestedCategoryName && hasFolderId) {
                const error = new Error('Select an existing category or enter a new category name, not both.');
                error.statusCode = 422;
                throw error;
            }

            if (requestedCategoryName) {
                // Mirrors createItem's create-a-new-category-on-save behavior, previously only
                // available when creating a brand-new item. Editing an item into a category that
                // doesn't exist yet had no way to create it, silently leaving the category unset.
                if (!canManageCategories) {
                    const error = new Error('Admin access is required to create a category while editing an item.');
                    error.statusCode = 403;
                    throw error;
                }

                const existingFolders = await ItemFolder.findAll({
                    where: activeFolderWhere({ parent_id: null }),
                    attributes: ['folder_id', 'name', 'is_active'],
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                const normalizedRequestedCategoryName = requestedCategoryName.toLowerCase();
                let folder = existingFolders.find((candidate) => (
                    String(candidate?.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === normalizedRequestedCategoryName
                ));

                if (!folder) {
                    try {
                        folder = await ItemFolder.create({
                            name: requestedCategoryName,
                            description: '',
                            show_in_pos_filter: true,
                            is_active: true,
                            parent_id: null
                        }, { transaction });
                    } catch (error) {
                        if (error?.name !== 'SequelizeUniqueConstraintError') throw error;

                        folder = await ItemFolder.findOne({
                            where: activeFolderWhere({ parent_id: null, name: requestedCategoryName }),
                            transaction,
                            lock: transaction.LOCK.UPDATE
                        });
                        if (!folder) throw error;
                    }
                }

                itemData.folder_id = folder.folder_id;
                itemData.product_folder = folder.name;
            } else if (hasFolderId) {
                const folderId = Number(itemData.folder_id);
                const folder = Number.isInteger(folderId) && folderId > 0
                    ? await ItemFolder.findOne({
                        where: activeFolderWhere({ folder_id: folderId }),
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    })
                    : null;
                if (!folder) {
                    const error = new Error('The selected category is unavailable. Choose an active category or create a new one.');
                    error.statusCode = 422;
                    throw error;
                }
                itemData.folder_id = folder.folder_id;
                itemData.product_folder = folder.name;
            }
            const item = await findVisibleItemById(Item, itemId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!item) {
                throw notFoundError('Item not found');
            }

            assertMsmePricingRequirements({
                workflowMode,
                status: itemData?.status ?? item?.status,
                costPerUnit: Object.prototype.hasOwnProperty.call(itemData || {}, 'cost_per_unit')
                    ? itemData.cost_per_unit
                    : item.cost_per_unit,
                defaultSalePrice: Object.prototype.hasOwnProperty.call(itemData || {}, 'default_sale_price')
                    ? itemData.default_sale_price
                    : item.default_sale_price
            });

            if (itemData.sku_code && itemData.sku_code !== item.sku_code) {
                const existingItem = await Item.findOne({
                    where: {
                        sku_code: itemData.sku_code,
                        deleted_at: null,
                        status: { [Op.notIn]: ['draft', 'inactive'] },
                        item_id: { [Op.ne]: itemId }
                    }
                });

                if (existingItem) {
                    const error = new Error('Item with this SKU code already exists');
                    error.statusCode = 409;
                    throw error;
                }
            }

            const {
                labor_cost,
                overhead_cost,
                additional_packaging_cost,
                ingredients,
                packaging_items,
                nutritional_info,
                allergens,
                may_contain_allergens,
                physical_properties,
                shelf_life,
                packaging_info,
                quality_control,
                regulatory_compliance,
                ...dbFields
            } = itemData;

            // This is a command field, not an Item column.
            delete dbFields.create_category_name;

            if (itemData.status === 'draft' || item.status === 'draft') {
                dbFields.wizard_metadata = {
                    ...(item.wizard_metadata || {}),
                    labor_cost,
                    overhead_cost,
                    additional_packaging_cost,
                    ingredients,
                    packaging_items,
                    nutritional_info,
                    allergens,
                    may_contain_allergens,
                    physical_properties,
                    shelf_life,
                    packaging_info,
                    quality_control,
                    regulatory_compliance
                };
            }

            if (dbFields.max_capacity !== undefined) {
                const thresholds = await calculateThresholds(dbFields.max_capacity);
                dbFields.min_threshold = thresholds.min_threshold;
                dbFields.purchase_allowance = thresholds.purchase_allowance;
            }

            dbFields.updated_by = userId;

            const nextCategory = String(dbFields.category || item.category || '').trim().toLowerCase();
            if (nextCategory === 'service') {
                dbFields.current_stock = 0;
            }
            const newStockValue = nextCategory === 'service'
                ? null
                : (dbFields.current_stock !== undefined
                ? parseFloat(dbFields.current_stock || 0)
                : null);
            const movementLocationId = Number.parseInt(dbFields.location_id, 10) || null;
            let oldStockValue = parseFloat(item.current_stock || 0);
            if (movementLocationId && ItemLocationStock?.findOne) {
                const locationStock = await ItemLocationStock.findOne({
                    where: {
                        item_id: item.item_id,
                        location_id: movementLocationId
                    },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                oldStockValue = parseFloat(locationStock?.quantity_on_hand || 0);
            }
            delete dbFields.location_id;

            if (newStockValue !== null && newStockValue !== oldStockValue) {
                const delta = newStockValue - oldStockValue;
                delete dbFields.current_stock;

                await item.update(dbFields, { transaction });
                await inventoryRepositoryDependencies.createStockMovement({
                    item_id: itemId,
                    quantity: Math.abs(delta),
                    movement_type: delta > 0 ? 'adjustment' : 'calculated_loss',
                    notes: `Manual stock adjustment from item update form${movementLocationId ? ` @ location ${movementLocationId}` : ''} (Old: ${oldStockValue}, New: ${newStockValue})`,
                    reference_type: 'MANUAL',
                    location_id: movementLocationId
                }, userId, transaction);
            } else {
                await item.update(dbFields, { transaction });
            }

            const clearManufacturingProperties = workflowMode === 'fnb';
            if (item.status === 'active' && item.category === 'product') {
                const wizardData = {
                    labor_cost,
                    overhead_cost,
                    additional_packaging_cost,
                    ingredients,
                    packaging_items,
                    nutritional_info,
                    allergens,
                    may_contain_allergens,
                    physical_properties,
                    shelf_life,
                    packaging_info,
                    quality_control,
                    regulatory_compliance
                };

                await saveRelatedWizardData(itemId, wizardData, transaction, {
                    clearManufacturingProperties
                });
            }

            await transaction.commit();
            invalidateItemCostMetricsCache({ itemIds: [itemId] });
            return itemRepository.getItemById(itemId);
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            throw normalizeSkuConflictError(error);
        }
    },
    async finalizeItem(itemId, itemData = {}, userId = null) {
        const Item = dbStore.get('Item');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const workflowMode = await getCurrentWorkflowMode();
            const item = await findVisibleItemById(Item, itemId, { transaction });
            if (!item) {
                throw notFoundError('Item not found');
            }

            if (item.status !== 'draft') {
                const error = new Error('Only draft items can be finalized');
                error.statusCode = 400;
                throw error;
            }

            const wizardData = item.wizard_metadata || {};
            const mergedData = {
                ...wizardData,
                sku_code: item.sku_code,
                name: item.name,
                category: item.category,
                product_type: item.product_type,
                vat_type: item.vat_type,
                description: item.description,
                product_folder: item.product_folder,
                max_capacity: item.max_capacity,
                min_threshold: item.min_threshold,
                purchase_allowance: item.purchase_allowance,
                unit_of_measure: item.unit_of_measure,
                cost_per_unit: item.cost_per_unit,
                current_stock: item.current_stock,
                fifo_enabled: item.fifo_enabled,
                batch_size: item.batch_size,
                yield_percentage: item.yield_percentage,
                processing_loss: item.processing_loss,
                production_notes: item.production_notes,
                ...itemData
            };
            if (Object.prototype.hasOwnProperty.call(mergedData, 'sku_code')) {
                mergedData.sku_code = String(mergedData.sku_code || '').trim();
            }

            if (!mergedData.sku_code) {
                const error = new Error('SKU code is required to finalize item');
                error.statusCode = 422;
                throw error;
            }
            if (!mergedData.category) {
                const error = new Error('Category is required to finalize item');
                error.statusCode = 422;
                throw error;
            }
            if (!mergedData.max_capacity) {
                const error = new Error('Max capacity is required to finalize item');
                error.statusCode = 422;
                throw error;
            }
            if (!mergedData.unit_of_measure) {
                const error = new Error('Unit of measure is required to finalize item');
                error.statusCode = 422;
                throw error;
            }
            if (
                mergedData.category === 'product'
                && mergedData.product_type === 'finished_goods'
                && !mergedData.vat_type
            ) {
                const error = new Error('VAT type is required to finalize finished goods');
                error.statusCode = 422;
                throw error;
            }

            const existingItem = await Item.findOne({
                where: {
                    sku_code: mergedData.sku_code,
                    deleted_at: null,
                    status: { [Op.notIn]: ['draft', 'inactive'] },
                    item_id: { [Op.ne]: itemId }
                },
                transaction
            });

            if (existingItem) {
                const error = new Error('Item with this SKU code already exists');
                error.statusCode = 409;
                throw error;
            }

            await saveRelatedWizardData(itemId, wizardData, transaction, {
                clearManufacturingProperties: workflowMode === 'fnb'
            });

            const itemFields = { ...mergedData };
            delete itemFields.labor_cost;
            delete itemFields.overhead_cost;
            delete itemFields.additional_packaging_cost;
            delete itemFields.ingredients;
            delete itemFields.packaging_items;
            delete itemFields.nutritional_info;
            delete itemFields.allergens;
            delete itemFields.may_contain_allergens;
            delete itemFields.physical_properties;
            delete itemFields.shelf_life;
            delete itemFields.packaging_info;
            delete itemFields.quality_control;
            delete itemFields.regulatory_compliance;

            const updateData = {
                ...itemFields,
                status: 'active',
                wizard_metadata: null,
                updated_by: userId
            };

            await item.update(updateData, { transaction });
            await transaction.commit();

            inventoryRepositoryDependencies.syncItemEmbedding(item).catch((error) => (
                console.error(`Embedding sync failed for item ${item.item_id}:`, error.message)
            ));

            const ItemNutrition = dbStore.get('ItemNutrition');
            const ItemAllergen = dbStore.get('ItemAllergen');
            const ItemPhysicalProperties = dbStore.get('ItemPhysicalProperties');
            const ItemShelfLife = dbStore.get('ItemShelfLife');
            const ItemPackaging = dbStore.get('ItemPackaging');
            const ItemQualityControl = dbStore.get('ItemQualityControl');
            const ItemRegulatoryCompliance = dbStore.get('ItemRegulatoryCompliance');
            const ItemCostBreakdown = dbStore.get('ItemCostBreakdown');
            const FIFOBatch = dbStore.get('FIFOBatch');
            const TenantLocation = dbStore.get('TenantLocation');
            const ProductComposition = dbStore.get('ProductComposition');

            return findVisibleItemById(Item, itemId, {
                include: [
                    { model: ItemNutrition, as: 'nutrition', required: false },
                    { model: ItemAllergen, as: 'allergens', required: false },
                    { model: ItemPhysicalProperties, as: 'physicalProperties', required: false },
                    { model: ItemShelfLife, as: 'shelfLife', required: false },
                    { model: ItemPackaging, as: 'packaging', required: false },
                    { model: ItemQualityControl, as: 'qualityControl', required: false },
                    { model: ItemRegulatoryCompliance, as: 'regulatoryCompliance', required: false },
                    { model: ItemCostBreakdown, as: 'costBreakdown', required: false },
                    {
                        model: FIFOBatch,
                        as: 'fifoBatches',
                        required: false,
                        include: [
                            { model: Item, as: 'item', attributes: ['unit_of_measure'] },
                            { model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false }
                        ]
                    },
                    {
                        model: ProductComposition,
                        as: 'productCompositions',
                        required: false,
                        include: [{ model: Item, as: 'ingredient', required: false }]
                    }
                ]
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    },
    async deleteItem(itemId, userId) {
        const Item = dbStore.get('Item');
        const ProductComposition = dbStore.get('ProductComposition');
        const POLineItem = dbStore.get('POLineItem');
        const PurchaseOrder = dbStore.get('PurchaseOrder');
        const JOIngredient = dbStore.get('JOIngredient');
        const JobOrder = dbStore.get('JobOrder');

        const item = await findVisibleItemById(Item, itemId);
        if (!item) {
            throw notFoundError('Item not found');
        }

        const errors = [];

        const productCompositions = await ProductComposition.findAll({
            where: { ingredient_id: itemId },
            include: [{
                model: Item,
                as: 'product',
                attributes: ['name', 'sku_code', 'status'],
                where: buildVisibleWhere({ status: 'active' })
            }]
        });
        if (productCompositions.length > 0) {
            const productNames = productCompositions
                .map((pc) => `${pc.product.name} (${pc.product.sku_code})`)
                .join(', ');
            errors.push(`Used as ingredient in ${productCompositions.length} active product(s): ${productNames}`);
        }

        const poLineItems = await POLineItem.findAll({
            where: { item_id: itemId },
            include: [{
                model: PurchaseOrder,
                as: 'purchaseOrder',
                attributes: ['po_number', 'status'],
                where: { archived_at: null }
            }]
        });
        if (poLineItems.length > 0) {
            const poNumbers = poLineItems
                .map((po) => `${po.purchaseOrder.po_number} (${po.purchaseOrder.status})`)
                .join(', ');
            errors.push(`Referenced in ${poLineItems.length} purchase order(s): ${poNumbers}`);
        }

        const joIngredients = await JOIngredient.findAll({
            where: { item_id: itemId },
            include: [{
                model: JobOrder,
                as: 'jobOrder',
                attributes: ['jo_number', 'status'],
                where: { archived_at: null }
            }]
        });
        if (joIngredients.length > 0) {
            const joNumbers = joIngredients
                .map((jo) => `${jo.jobOrder.jo_number} (${jo.jobOrder.status})`)
                .join(', ');
            errors.push(`Referenced in ${joIngredients.length} job order(s): ${joNumbers}`);
        }

        if (errors.length > 0) {
            const error = new Error(`Cannot delete item "${item.name}". Reasons:\n- ${errors.join('\n- ')}`);
            error.statusCode = 400;
            error.details = errors;
            throw error;
        }

        await item.update({
            status: 'inactive',
            deleted_by: userId,
            deleted_at: new Date()
        });

        return true;
    },
    async getItemStockHistory(itemId, queryParams = {}) {
        const Item = dbStore.get('Item');
        const StockMovement = dbStore.get('StockMovement');
        const User = dbStore.get('User');

        const item = await findVisibleItemById(Item, itemId);
        if (!item) {
            throw notFoundError('Item not found');
        }

        const {
            startDate,
            endDate,
            movementType,
            limit = 50
        } = queryParams;

        const where = { item_id: itemId };

        if (startDate || endDate) {
            where.timestamp = {};
            if (startDate) {
                where.timestamp[Op.gte] = new Date(startDate);
            }
            if (endDate) {
                where.timestamp[Op.lte] = new Date(endDate);
            }
        }

        if (movementType) {
            where.movement_type = movementType;
        }

        const movements = await StockMovement.findAll({
            where,
            limit: parseInt(limit, 10),
            order: [['timestamp', 'DESC']],
            include: [
                {
                    model: User,
                    as: 'userResponsible',
                    required: false,
                    attributes: ['username']
                }
            ]
        });

        return movements.map((movement) => {
            const m = movement.toJSON();
            return {
                movement_id: m.movement_id,
                item_id: m.item_id,
                movement_type: m.movement_type,
                quantity: m.quantity,
                reference_id: m.reference_id,
                reference_type: m.reference_type,
                user_responsible: m.userResponsible?.username || null,
                timestamp: m.timestamp
            };
        });
    },
    async getItemBatches(itemId, locationId = null) {
        const Item = dbStore.get('Item');
        const FIFOBatch = dbStore.get('FIFOBatch');
        const TenantLocation = dbStore.get('TenantLocation');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const parsedLocationId = Number.parseInt(locationId, 10);
        const hasLocationFilter = Number.isInteger(parsedLocationId) && parsedLocationId > 0;

        const item = await findVisibleItemById(Item, itemId);
        if (!item) {
            throw notFoundError('Item not found');
        }

        const where = {
            item_id: itemId,
            [Op.and]: [
                sequelize.where(
                    sequelize.col('quantity'),
                    Op.gt,
                    sequelize.col('quantity_consumed')
                )
            ]
        };
        if (hasLocationFilter) {
            where.location_id = parsedLocationId;
        }

        return FIFOBatch.findAll({
            where,
            include: [{ model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false }],
            order: [['received_date', 'ASC']]
        });
    },
    async getItemMovements(itemId) {
        const Item = dbStore.get('Item');
        const StockMovement = dbStore.get('StockMovement');

        const item = await findVisibleItemById(Item, itemId);
        if (!item) {
            throw notFoundError('Item not found');
        }

        return StockMovement.findAll({
            where: { item_id: itemId },
            order: [['timestamp', 'DESC']],
            limit: 50
        });
    },
    validateComposition(productId, ingredientIds) {
        return inventoryRepositoryDependencies.validateComposition(productId, ingredientIds);
    },
    async getItemSupplierCoverage() {
        const Item = dbStore.get('Item');
        const Supplier = dbStore.get('Supplier');
        const SupplierItem = dbStore.get('SupplierItem');
        const workflowMode = await getCurrentWorkflowMode();
        const purchasableCategories = getPurchasableCategoriesForWorkflow(workflowMode);

        const allItems = await Item.findAll({
            where: visibleItemWhere({
                status: 'active',
                category: { [Op.in]: purchasableCategories }
            }),
            attributes: ['item_id', 'name', 'sku_code', 'category', 'current_stock', 'min_threshold', 'unit_of_measure'],
            order: [['name', 'ASC']]
        });

        const supplierItems = await SupplierItem.findAll({
            include: [{
                model: Supplier,
                as: 'supplier',
                attributes: ['supplier_id', 'name', 'status'],
                where: buildVisibleWhere({ status: 'active' })
            }],
            attributes: ['item_id', 'supplier_id', 'moq', 'price_per_unit']
        });

        const itemSupplierMap = new Map();
        supplierItems.forEach((si) => {
            try {
                const supplierItemId = si.item_id;
                if (!supplierItemId) return;

                if (!itemSupplierMap.has(supplierItemId)) {
                    itemSupplierMap.set(supplierItemId, []);
                }

                const supplierName = si.supplier?.name || 'Unknown Supplier';
                itemSupplierMap.get(supplierItemId).push({
                    supplier_id: si.supplier_id,
                    supplier_name: supplierName,
                    moq: si.moq || 0,
                    price_per_unit: si.price_per_unit || 0
                });
            } catch (error) {
                console.error(`Error processing supplier item ${si.supplier_item_id || 'unknown'}:`, error.message);
            }
        });

        const itemsWithSupplier = [];
        const itemsWithoutSupplier = [];

        allItems.forEach((item) => {
            const itemData = {
                item_id: item.item_id,
                id: item.item_id,
                name: item.name,
                sku_code: item.sku_code,
                category: item.category,
                current_stock: item.current_stock,
                min_threshold: item.min_threshold,
                unit_of_measure: item.unit_of_measure
            };

            if (itemSupplierMap.has(item.item_id)) {
                itemData.suppliers = itemSupplierMap.get(item.item_id);
                itemData.supplier_count = itemData.suppliers.length;
                itemsWithSupplier.push(itemData);
                return;
            }

            itemData.suppliers = [];
            itemData.supplier_count = 0;
            itemsWithoutSupplier.push(itemData);
        });

        return {
            items_with_supplier: itemsWithSupplier,
            items_without_supplier: itemsWithoutSupplier,
            summary: {
                total_purchasable_items: allItems.length,
                items_with_supplier_count: itemsWithSupplier.length,
                items_without_supplier_count: itemsWithoutSupplier.length,
                coverage_percent: allItems.length > 0
                    ? Math.round((itemsWithSupplier.length / allItems.length) * 100)
                    : 100
            }
        };
    },
    async replaceItemSuppliers(itemId, supplierLinks = []) {
        const Item = dbStore.get('Item');
        const Supplier = dbStore.get('Supplier');
        const SupplierItem = dbStore.get('SupplierItem');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

        const normalizedItemId = Number.parseInt(itemId, 10);
        if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0) {
            const error = new Error('item_id must be a positive integer');
            error.statusCode = 400;
            throw error;
        }

        if (!Array.isArray(supplierLinks)) {
            const error = new Error('suppliers must be an array');
            error.statusCode = 422;
            throw error;
        }

        const normalizedLinks = supplierLinks.map((link, index) => {
            const supplierId = Number.parseInt(link?.supplier_id, 10);
            if (!Number.isInteger(supplierId) || supplierId <= 0) {
                const error = new Error(`suppliers[${index}].supplier_id must be a positive integer`);
                error.statusCode = 422;
                throw error;
            }

            return {
                supplier_id: supplierId,
                moq: normalizeOptionalNumber(link?.moq),
                price_per_unit: normalizeOptionalNumber(link?.price_per_unit)
            };
        });

        const duplicateSupplierId = normalizedLinks.find((link, index) => (
            normalizedLinks.findIndex((candidate) => candidate.supplier_id === link.supplier_id) !== index
        ))?.supplier_id;

        if (duplicateSupplierId) {
            const error = new Error(`Duplicate supplier_id found: ${duplicateSupplierId}`);
            error.statusCode = 422;
            throw error;
        }

        const transaction = await sequelize.transaction();
        try {
            const item = await findVisibleItemById(Item, normalizedItemId, { transaction });
            if (!item) {
                throw notFoundError('Item not found');
            }

            await SupplierItem.destroy({
                where: { item_id: normalizedItemId },
                transaction
            });

            if (normalizedLinks.length === 0) {
                await transaction.commit();
                return {
                    item_id: normalizedItemId,
                    supplier_count: 0,
                    suppliers: []
                };
            }

            const requestedSupplierIds = normalizedLinks.map((link) => link.supplier_id);
            const suppliers = await Supplier.findAll({
                where: buildVisibleWhere({
                    supplier_id: { [Op.in]: requestedSupplierIds },
                    status: 'active'
                }, {
                    statusField: 'status',
                    excludeInactiveStatus: true
                }),
                attributes: ['supplier_id', 'name'],
                transaction
            });

            if (suppliers.length !== requestedSupplierIds.length) {
                const existingIds = new Set(suppliers.map((supplier) => supplier.supplier_id));
                const missingIds = requestedSupplierIds.filter((id) => !existingIds.has(id));
                const error = new Error('One or more suppliers were not found or are inactive');
                error.statusCode = 404;
                error.details = missingIds.map((id) => `Supplier ${id} not found or inactive`);
                throw error;
            }

            const rowsToCreate = normalizedLinks.map((link) => ({
                item_id: normalizedItemId,
                supplier_id: link.supplier_id,
                moq: link.moq,
                price_per_unit: link.price_per_unit
            }));

            await SupplierItem.bulkCreate(rowsToCreate, { transaction });
            await transaction.commit();

            const supplierNameById = new Map(
                suppliers.map((supplier) => [supplier.supplier_id, supplier.name])
            );

            return {
                item_id: normalizedItemId,
                supplier_count: normalizedLinks.length,
                suppliers: normalizedLinks.map((link) => ({
                    supplier_id: link.supplier_id,
                    supplier_name: supplierNameById.get(link.supplier_id) || 'Unknown Supplier',
                    moq: link.moq,
                    price_per_unit: link.price_per_unit
                }))
            };
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            throw normalizeSkuConflictError(error);
        }
    },
    async listStorefrontItemLocationAvailability(itemIds = [], options = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const StorefrontLocationItemOverride = dbStore.get('StorefrontLocationItemOverride');
        const normalizedItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
            .map((itemId) => parsePositiveInt(itemId))
            .filter(Boolean))];

        if (!TenantLocation?.findAll || normalizedItemIds.length === 0) return new Map();

        const locations = (await TenantLocation.findAll({
            where: { is_active: true },
            attributes: ['location_id', 'name', 'is_open', 'is_active', 'is_primary_storefront'],
            order: [
                ['is_primary_storefront', 'DESC'],
                ['name', 'ASC'],
                ['location_id', 'ASC']
            ],
            transaction: options.transaction
        })).map(toPlain);

        const availabilityByItemId = new Map(normalizedItemIds.map((itemId) => [
            itemId,
            locations.map((location) => ({
                location_id: location.location_id,
                name: location.name,
                is_open: location.is_open !== false,
                is_active: location.is_active !== false,
                is_primary_storefront: location.is_primary_storefront === true,
                storefront_available: true
            }))
        ]));

        if (!StorefrontLocationItemOverride?.findAll || locations.length === 0) {
            return availabilityByItemId;
        }

        try {
            const rows = await StorefrontLocationItemOverride.findAll({
                where: {
                    item_id: { [Op.in]: normalizedItemIds },
                    location_id: { [Op.in]: locations.map((location) => Number(location.location_id)) }
                },
                attributes: ['item_id', 'location_id', 'storefront_available'],
                transaction: options.transaction
            });

            rows.map(toPlain).forEach((row) => {
                const itemId = Number(row.item_id);
                const locationId = Number(row.location_id);
                const current = availabilityByItemId.get(itemId);
                if (!Array.isArray(current)) return;
                const entry = current.find((location) => Number(location.location_id) === locationId);
                if (entry) entry.storefront_available = row.storefront_available !== false;
            });
            return availabilityByItemId;
        } catch (error) {
            if (isMissingStorefrontLocationItemOverrideTableError(error)) {
                return availabilityByItemId;
            }
            throw error;
        }
    },
    async upsertStorefrontItemLocationAvailability(itemId, entries = [], options = {}) {
        const StorefrontLocationItemOverride = dbStore.get('StorefrontLocationItemOverride');
        const TenantLocation = dbStore.get('TenantLocation');
        const normalizedItemId = parsePositiveInt(itemId);
        const normalizedEntries = normalizeLocationAvailabilityEntries(entries);
        if (!normalizedItemId || normalizedEntries.length === 0) return [];
        if (!StorefrontLocationItemOverride?.findOne) {
            throw new Error('Storefront location item override model is unavailable');
        }

        const validLocations = TenantLocation?.findAll
            ? await TenantLocation.findAll({
                where: {
                    location_id: { [Op.in]: normalizedEntries.map((entry) => entry.location_id) },
                    is_active: true
                },
                attributes: ['location_id'],
                transaction: options.transaction
            })
            : [];
        const validLocationIds = new Set(validLocations.map((row) => Number(toPlain(row).location_id)));
        const invalid = normalizedEntries.filter((entry) => !validLocationIds.has(Number(entry.location_id)));
        if (invalid.length > 0) {
            const error = new Error('location_availability contains inactive or unknown location_id values');
            error.statusCode = 422;
            error.details = invalid.map((entry) => ({ location_id: entry.location_id }));
            throw error;
        }

        const results = [];
        for (const entry of normalizedEntries) {
            const existing = await StorefrontLocationItemOverride.findOne({
                where: {
                    item_id: normalizedItemId,
                    location_id: entry.location_id
                },
                transaction: options.transaction
            });
            const payload = {
                item_id: normalizedItemId,
                location_id: entry.location_id,
                storefront_available: entry.storefront_available !== false
            };
            if (existing) {
                await existing.update(payload, { transaction: options.transaction });
                results.push(toPlain(existing));
            } else {
                results.push(toPlain(await StorefrontLocationItemOverride.create(payload, {
                    transaction: options.transaction
                })));
            }
        }

        return results;
    },
    async listStorefrontCatalogOverrides({ search = '', limit = 200 } = {}) {
        const Item = dbStore.get('Item');
        const StorefrontCatalogOverride = dbStore.get('StorefrontCatalogOverride');
        const PosCatalogOverride = dbStore.get('PosCatalogOverride');
        const ServiceItemDetail = dbStore.get('ServiceItemDetail');
        const storefrontOverrideAttributes = ['storefront_visible', 'storefront_image_path', 'storefront_image_url', 'storefront_image_gallery'];
        const storefrontOverrideAttributesWithoutGallery = ['storefront_visible', 'storefront_image_path', 'storefront_image_url'];
        const normalizedLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 200, 1000));
        const normalizedSearch = String(search || '').trim();
        const workflowMode = await getCurrentWorkflowMode();

        const where = visibleItemWhere({});
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
                'sku_code',
                'category',
                'product_type',
                'mode_item_preset',
                'status',
                'default_sale_price',
                'current_stock'
            ],
            include: [
                ServiceItemDetail ? {
                    model: ServiceItemDetail,
                    as: 'serviceDetail',
                    attributes: ['bookable', 'visible_in_pos', 'visible_in_storefront'],
                    required: false
                } : null,
                StorefrontCatalogOverride ? {
                    model: StorefrontCatalogOverride,
                    as: 'storefrontCatalogOverride',
                    attributes: storefrontOverrideAttributes,
                    required: false
                } : null
            ].filter(Boolean),
            order: [['name', 'ASC']],
            limit: normalizedLimit
        };

        const mapRow = (item, { allowLegacyPosFallback = false, availabilityByItemId = new Map() } = {}) => {
            const payload = toPlain(item);
            const override = payload?.storefrontCatalogOverride || null;
            const legacyPosOverride = allowLegacyPosFallback ? (payload?.posCatalogOverride || null) : null;
            const readiness = buildStorefrontReadiness({
                item: payload,
                override,
                legacyPosOverride
            });
            const recommendation = buildCatalogSetupRecommendation({
                item: payload,
                workflowMode,
                storefrontReadiness: readiness
            });
            const storefrontImagePath = override?.storefront_image_path || legacyPosOverride?.pos_image_path || null;
            const storefrontImageUrl = override?.storefront_image_url || legacyPosOverride?.pos_image_url || null;
            const storefrontImageGallery = buildStorefrontImageGallery({
                primaryPath: storefrontImagePath,
                primaryUrl: storefrontImageUrl,
                gallery: override?.storefront_image_gallery || null
            });
            return {
                item_id: payload.item_id,
                name: payload.name,
                sku_code: payload.sku_code,
                category: payload.category,
                product_type: payload.product_type,
                mode_item_preset: payload.mode_item_preset,
                status: payload.status,
                storefront_visible: resolveStorefrontCatalogVisibility({
                    item: payload,
                    override,
                    legacyPosOverride
                }),
                storefront_image_path: storefrontImagePath,
                storefront_image_url: storefrontImageUrl,
                storefront_image_gallery: storefrontImageGallery,
                location_availability: availabilityByItemId.get(Number(payload.item_id)) || [],
                has_storefront_override: Boolean(override),
                storefront_readiness: readiness,
                catalog_setup_recommendation: recommendation
            };
        };

        try {
            const rows = await Item.findAll(baseQuery);
            const availabilityByItemId = await this.listStorefrontItemLocationAvailability(
                rows.map((row) => toPlain(row)?.item_id),
            );
            return rows.map((row) => mapRow(row, { availabilityByItemId }));
        } catch (error) {
            if (isMissingStorefrontCatalogGalleryColumnError(error)) {
                logger.warn('[ItemRepository] Retrying storefront overrides without gallery column while tenant schema catches up', {
                    event_type: 'storefront_catalog_gallery_column_fallback',
                    reason: error?.original?.code || error?.parent?.code || error?.code || 'unknown'
                });

                const retryRows = await Item.findAll({
                    ...baseQuery,
                    include: (baseQuery.include || []).map((entry) => (
                        entry?.as === 'storefrontCatalogOverride'
                            ? { ...entry, attributes: storefrontOverrideAttributesWithoutGallery }
                            : entry
                    ))
                });
                const availabilityByItemId = await this.listStorefrontItemLocationAvailability(
                    retryRows.map((row) => toPlain(row)?.item_id),
                );
                return retryRows.map((row) => mapRow(row, { availabilityByItemId }));
            }

            if (!isMissingStorefrontCatalogOverrideTableError(error)) {
                throw error;
            }

            logger.warn('[ItemRepository] Falling back to POS-derived storefront overrides while storefront override table is unavailable', {
                event_type: 'storefront_catalog_override_fallback',
                reason: error?.original?.code || error?.parent?.code || error?.code || 'unknown'
            });

            const fallbackRows = await Item.findAll({
                ...baseQuery,
                include: [
                    ...(baseQuery.include || []),
                    PosCatalogOverride ? {
                    model: PosCatalogOverride,
                    as: 'posCatalogOverride',
                    attributes: ['pos_visible', 'pos_image_path', 'pos_image_url'],
                    required: false
                    } : null
                ].filter(Boolean)
            });
            const availabilityByItemId = await this.listStorefrontItemLocationAvailability(
                fallbackRows.map((row) => toPlain(row)?.item_id),
            );
            return fallbackRows.map((row) => mapRow(row, { allowLegacyPosFallback: true, availabilityByItemId }));
        }
    },
    async findStorefrontCatalogOverrideByItemId(itemId, options = {}) {
        const StorefrontCatalogOverride = dbStore.get('StorefrontCatalogOverride');
        if (!StorefrontCatalogOverride) return null;

        try {
            return await StorefrontCatalogOverride.findOne({
                where: { item_id: itemId },
                attributes: ['storefront_catalog_override_id', 'item_id', 'storefront_visible', 'storefront_image_path', 'storefront_image_url', 'storefront_image_gallery'],
                transaction: options.transaction
            });
        } catch (error) {
            if (isMissingStorefrontCatalogOverrideTableError(error)) {
                return null;
            }
            if (isMissingStorefrontCatalogGalleryColumnError(error)) {
                return StorefrontCatalogOverride.findOne({
                    where: { item_id: itemId },
                    attributes: ['storefront_catalog_override_id', 'item_id', 'storefront_visible', 'storefront_image_path', 'storefront_image_url'],
                    transaction: options.transaction
                });
            }
            throw error;
        }
    },
    async getStorefrontCatalogReadinessByItemId(itemId, { forcedStorefrontVisible = null } = {}) {
        const Item = dbStore.get('Item');
        const ServiceItemDetail = dbStore.get('ServiceItemDetail');
        const normalizedItemId = Number.parseInt(itemId, 10);
        if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0) return null;

        const item = await Item.findOne({
            where: visibleItemWhere({ item_id: normalizedItemId }),
            attributes: ['item_id', 'name', 'sku_code', 'category', 'product_type', 'mode_item_preset', 'status', 'default_sale_price', 'current_stock'],
            include: ServiceItemDetail ? [{
                model: ServiceItemDetail,
                as: 'serviceDetail',
                required: false
            }] : []
        });
        if (!item) return null;

        const payload = toPlain(item);
        const override = toPlain(await this.findStorefrontCatalogOverrideByItemId(normalizedItemId));
        const effectiveOverride = forcedStorefrontVisible === null
            ? override
            : { ...(override || {}), storefront_visible: forcedStorefrontVisible === true };
        const readiness = buildStorefrontReadiness({
            item: payload,
            override: effectiveOverride,
            legacyPosOverride: null
        });
        const workflowMode = await getCurrentWorkflowMode();
        const recommendation = buildCatalogSetupRecommendation({
            item: payload,
            workflowMode,
            storefrontReadiness: readiness
        });

        return {
            item_id: payload.item_id,
            storefront_visible: resolveStorefrontCatalogVisibility({
                item: payload,
                override: effectiveOverride,
                legacyPosOverride: null
            }),
            storefront_image_path: effectiveOverride?.storefront_image_path || null,
            storefront_image_url: effectiveOverride?.storefront_image_url || null,
            storefront_image_variants: deriveImageAssetVariantUrls({
                storedPath: effectiveOverride?.storefront_image_path || null,
                storedUrl: effectiveOverride?.storefront_image_url || null
            }),
            storefront_image_gallery: buildStorefrontImageGallery({
                primaryPath: effectiveOverride?.storefront_image_path || null,
                primaryUrl: effectiveOverride?.storefront_image_url || null,
                gallery: effectiveOverride?.storefront_image_gallery || null
            }),
            storefront_readiness: readiness,
            catalog_setup_recommendation: recommendation
        };
    },
    async findItemsBySkuCodes(skuCodes = [], options = {}) {
        const Item = dbStore.get('Item');
        const ServiceItemDetail = dbStore.get('ServiceItemDetail');
        const normalizedSkuCodes = [...new Set((Array.isArray(skuCodes) ? skuCodes : [])
            .map((value) => String(value || '').trim())
            .filter(Boolean))];
        if (normalizedSkuCodes.length === 0) return [];

        return Item.findAll({
            where: visibleItemWhere({ sku_code: { [Op.in]: normalizedSkuCodes } }),
            attributes: ['item_id', 'name', 'sku_code', 'category', 'product_type', 'mode_item_preset', 'status', 'default_sale_price', 'current_stock'],
            include: ServiceItemDetail ? [{
                model: ServiceItemDetail,
                as: 'serviceDetail',
                required: false
            }] : [],
            transaction: options.transaction
        });
    },
    async upsertStorefrontCatalogOverride(itemId, payload = {}, options = {}) {
        const StorefrontCatalogOverride = dbStore.get('StorefrontCatalogOverride');
        if (!StorefrontCatalogOverride) {
            throw new Error('Storefront catalog override model is unavailable');
        }

        const transaction = options.transaction;
        const existing = await this.findStorefrontCatalogOverrideByItemId(itemId, { transaction });
        const defaultEnvelope = existing
            ? null
            : await this.getStorefrontCatalogReadinessByItemId(itemId);

        const nextPayload = {
            item_id: itemId,
            storefront_visible: hasOwn(payload, 'storefront_visible')
                ? payload.storefront_visible !== false
                : (existing?.storefront_visible ?? defaultEnvelope?.storefront_visible ?? true),
            storefront_image_path: payload.storefront_image_path ?? (existing?.storefront_image_path ?? null),
            storefront_image_url: payload.storefront_image_url ?? (existing?.storefront_image_url ?? null),
            storefront_image_gallery: hasOwn(payload, 'storefront_image_gallery')
                ? buildStorefrontImageGallery({
                    primaryPath: payload.storefront_image_path ?? existing?.storefront_image_path ?? null,
                    primaryUrl: payload.storefront_image_url ?? existing?.storefront_image_url ?? null,
                    gallery: payload.storefront_image_gallery
                })
                : buildStorefrontImageGallery({
                    primaryPath: payload.storefront_image_path ?? existing?.storefront_image_path ?? null,
                    primaryUrl: payload.storefront_image_url ?? existing?.storefront_image_url ?? null,
                    gallery: existing?.storefront_image_gallery || null
                })
        };

        if (existing) {
            try {
                await existing.update(nextPayload, { transaction });
            } catch (error) {
                if (!isMissingStorefrontCatalogGalleryColumnError(error)) throw error;
                logger.warn('Storefront catalog gallery column missing; retrying override update without gallery payload', {
                    item_id: itemId,
                    tenant_id: dbStore.getStore?.()?.tenantId || null
                });
                await existing.update(withoutStorefrontImageGallery(nextPayload), { transaction });
            }
            return existing;
        }

        try {
            return await StorefrontCatalogOverride.create(nextPayload, { transaction });
        } catch (error) {
            if (!isMissingStorefrontCatalogGalleryColumnError(error)) throw error;
            logger.warn('Storefront catalog gallery column missing; retrying override create without gallery payload', {
                item_id: itemId,
                tenant_id: dbStore.getStore?.()?.tenantId || null
            });
            return StorefrontCatalogOverride.create(withoutStorefrontImageGallery(nextPayload), { transaction });
        }
    },
    async updateStorefrontCatalogImage(itemId, imageData = {}, options = {}) {
        const payload = {
            storefront_image_path: imageData.path || null,
            storefront_image_url: imageData.url || null,
            storefront_image_gallery: buildStorefrontImageGallery({
                primaryPath: imageData.path || null,
                primaryUrl: imageData.url || null,
                gallery: imageData.gallery || []
            })
        };
        if (typeof options.keepVisible === 'boolean') {
            payload.storefront_visible = options.keepVisible;
        }
        return this.upsertStorefrontCatalogOverride(itemId, payload, options);
    },
    async clearStorefrontCatalogImage(itemId, options = {}) {
        const existing = await this.findStorefrontCatalogOverrideByItemId(itemId, options);
        if (!existing) return null;
        const clearPayload = {
            storefront_image_path: null,
            storefront_image_url: null,
            storefront_image_gallery: null
        };
        try {
            await existing.update(clearPayload, { transaction: options.transaction });
        } catch (error) {
            if (!isMissingStorefrontCatalogGalleryColumnError(error)) throw error;
            logger.warn('Storefront catalog gallery column missing; retrying image clear without gallery payload', {
                item_id: itemId,
                tenant_id: dbStore.getStore?.()?.tenantId || null
            });
            await existing.update(withoutStorefrontImageGallery(clearPayload), { transaction: options.transaction });
        }
        return existing;
    },
    async listItemBarcodes(itemId, { includeInactive = true } = {}) {
        const Item = dbStore.get('Item');
        const ItemBarcode = dbStore.get('ItemBarcode');
        const normalizedItemId = Number.parseInt(itemId, 10);
        if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0) {
            const error = new Error('item_id must be a positive integer');
            error.statusCode = 400;
            throw error;
        }

        const item = await findVisibleItemById(Item, normalizedItemId, {
            attributes: ['item_id', 'name', 'sku_code', 'category', 'product_type', 'mode_item_preset', 'unit_of_measure']
        });
        if (!item) throw notFoundError('Item not found');

        const where = { item_id: normalizedItemId };
        if (!includeInactive) where.is_active = true;

        const rows = await ItemBarcode.findAll({
            where,
            order: [
                ['is_active', 'DESC'],
                ['is_primary', 'DESC'],
                ['updated_at', 'DESC'],
                ['item_barcode_id', 'DESC']
            ]
        });

        return {
            item: toPlain(item),
            barcodes: rows.map(serializeBarcodeRow)
        };
    },
    async resolveItemBarcode(code, { includeInactive = false } = {}) {
        const ItemBarcode = dbStore.get('ItemBarcode');
        const normalizedCode = normalizeBarcodeValue(code);
        if (!normalizedCode) {
            const error = new Error('barcode code is required');
            error.statusCode = 422;
            throw error;
        }

        const where = { normalized_code: normalizedCode };
        if (!includeInactive) where.is_active = true;

        const rows = await ItemBarcode.findAll({
            where,
            include: barcodeIncludeItem(),
            order: [
                ['is_active', 'DESC'],
                ['updated_at', 'DESC'],
                ['item_barcode_id', 'DESC']
            ],
            limit: 5
        });

        const activeRows = rows.filter((row) => row.is_active !== false);
        if (activeRows.length > 1) {
            return {
                status: 'conflict',
                reason_code: 'BARCODE_CONFLICT',
                normalized_code: normalizedCode,
                matches: activeRows.map(serializeBarcodeRow)
            };
        }
        if (rows.length === 0) {
            return {
                status: 'not_found',
                reason_code: 'BARCODE_NOT_FOUND',
                normalized_code: normalizedCode,
                symbology: detectBarcodeSymbology(code)
            };
        }

        return {
            status: activeRows.length === 1 ? 'resolved' : 'inactive',
            reason_code: activeRows.length === 1 ? null : 'BARCODE_INACTIVE',
            normalized_code: normalizedCode,
            barcode: serializeBarcodeRow(activeRows[0] || rows[0])
        };
    },
    async auditBarcodeConflictResolution(payload = {}) {
        await auditBarcodeEvent({
            userId: payload.userId || null,
            itemId: payload.target_item_id || payload.existing?.item_id || null,
            action: 'UPDATE',
            eventType: 'barcode.conflict_resolved',
            changes: {
                action: payload.action || null,
                code: payload.code || null,
                normalized_code: normalizeBarcodeValue(payload.code),
                target_item_id: payload.target_item_id || null,
                existing_item_id: payload.existing?.item_id || null,
                existing_barcode_id: payload.existing?.item_barcode_id || null,
                result: payload.result || null
            }
        });
    },
    async attachItemBarcode(itemId, payload = {}, userId = null) {
        const Item = dbStore.get('Item');
        const ItemBarcode = dbStore.get('ItemBarcode');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const normalizedItemId = Number.parseInt(itemId, 10);
        const normalizedCode = normalizeBarcodeValue(payload.code);
        if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0) {
            const error = new Error('item_id must be a positive integer');
            error.statusCode = 400;
            throw error;
        }
        if (!normalizedCode) {
            const error = new Error('barcode code is required');
            error.statusCode = 422;
            throw error;
        }

        const transaction = await sequelize.transaction();
        try {
            const item = await findVisibleItemById(Item, normalizedItemId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!item) throw notFoundError('Item not found');

            const existing = await ItemBarcode.findOne({
                where: {
                    normalized_code: normalizedCode,
                    is_active: true
                },
                include: barcodeIncludeItem(),
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (existing && Number(existing.item_id) !== normalizedItemId) {
                throw barcodeConflictError(serializeBarcodeRow(existing));
            }
            if (existing && Number(existing.item_id) === normalizedItemId) {
                const error = new Error('Barcode is already assigned to this item');
                error.statusCode = 409;
                error.details = {
                    reason_code: 'BARCODE_ALREADY_ASSIGNED',
                    existing: serializeBarcodeRow(existing)
                };
                throw error;
            }

            const shouldBePrimary = payload.is_primary === true
                || await ItemBarcode.count({
                    where: { item_id: normalizedItemId, is_active: true },
                    transaction
                }) === 0;

            if (shouldBePrimary) {
                await ItemBarcode.update(
                    { is_primary: false, updated_by: userId || null },
                    {
                        where: { item_id: normalizedItemId },
                        transaction
                    }
                );
            }

            const row = await ItemBarcode.create({
                item_id: normalizedItemId,
                code: String(payload.code || '').trim(),
                normalized_code: normalizedCode,
                symbology: payload.symbology || detectBarcodeSymbology(payload.code),
                source: normalizeBarcodeSource(payload.source),
                scope: normalizeBarcodeScope(payload.scope),
                packaging_level: normalizeBarcodePackagingLevel(payload.packaging_level),
                quantity_multiplier: normalizeBarcodeMultiplier(payload.quantity_multiplier),
                is_primary: shouldBePrimary,
                is_active: true,
                metadata: payload.metadata || null,
                created_by: userId || null,
                updated_by: userId || null
            }, { transaction });

            await auditBarcodeEvent({
                userId,
                barcode: row,
                action: 'CREATE',
                eventType: 'barcode.created',
                changes: { source: row.source, scope: row.scope },
                transaction
            });

            await transaction.commit();
            const created = await ItemBarcode.findByPk(row.item_barcode_id, {
                include: barcodeIncludeItem()
            });
            return serializeBarcodeRow(created);
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            if (isActiveBarcodeUniqueConstraintError(error)) {
                const existing = await ItemBarcode.findOne({
                    where: { normalized_code: normalizedCode },
                    include: barcodeIncludeItem()
                });
                throw barcodeConflictError(serializeBarcodeRow(existing));
            }
            throw error;
        }
    },
    async generateItemBarcode(itemId, payload = {}, userId = null) {
        const store = dbStore.getStore?.() || {};
        const generatedCode = generateInternalBarcodeValue({
            tenantToken: store.tenantToken || store.tenantName || store.tenantId,
            itemId,
            scope: payload.scope || 'inventory'
        });
        return this.attachItemBarcode(itemId, {
            ...payload,
            code: generatedCode,
            source: 'tenant_generated',
            symbology: 'code128'
        }, userId);
    },
    async updateItemBarcode(itemId, barcodeId, payload = {}, userId = null) {
        const ItemBarcode = dbStore.get('ItemBarcode');
        const normalizedItemId = Number.parseInt(itemId, 10);
        const normalizedBarcodeId = Number.parseInt(barcodeId, 10);
        if (!Number.isInteger(normalizedItemId) || normalizedItemId <= 0 || !Number.isInteger(normalizedBarcodeId) || normalizedBarcodeId <= 0) {
            const error = new Error('item_id and barcode_id must be positive integers');
            error.statusCode = 400;
            throw error;
        }

        const row = await ItemBarcode.findOne({
            where: {
                item_barcode_id: normalizedBarcodeId,
                item_id: normalizedItemId
            }
        });
        if (!row) throw notFoundError('Barcode not found');
        if (row.is_active === false) {
            const error = new Error('Inactive barcode cannot be updated');
            error.statusCode = 409;
            error.details = { reason_code: 'BARCODE_INACTIVE' };
            throw error;
        }

        const updates = {
            updated_by: userId || null
        };
        if (hasOwn(payload, 'source')) updates.source = normalizeBarcodeSource(payload.source, row.source);
        if (hasOwn(payload, 'scope')) updates.scope = normalizeBarcodeScope(payload.scope, row.scope);
        if (hasOwn(payload, 'packaging_level')) updates.packaging_level = normalizeBarcodePackagingLevel(payload.packaging_level, row.packaging_level);
        if (hasOwn(payload, 'quantity_multiplier')) updates.quantity_multiplier = normalizeBarcodeMultiplier(payload.quantity_multiplier, row.quantity_multiplier);
        if (hasOwn(payload, 'metadata')) updates.metadata = payload.metadata || null;

        await row.update(updates);
        await auditBarcodeEvent({
            userId,
            barcode: row,
            action: 'UPDATE',
            eventType: 'barcode.updated',
            changes: updates
        });
        const updated = await ItemBarcode.findByPk(normalizedBarcodeId, {
            include: barcodeIncludeItem()
        });
        return serializeBarcodeRow(updated);
    },
    async deactivateItemBarcode(itemId, barcodeId, userId = null) {
        const ItemBarcode = dbStore.get('ItemBarcode');
        const normalizedItemId = Number.parseInt(itemId, 10);
        const normalizedBarcodeId = Number.parseInt(barcodeId, 10);
        const row = await ItemBarcode.findOne({
            where: {
                item_barcode_id: normalizedBarcodeId,
                item_id: normalizedItemId
            }
        });
        if (!row) throw notFoundError('Barcode not found');
        await row.update({
            is_active: false,
            is_primary: false,
            deactivated_at: new Date(),
            deactivated_by: userId || null,
            updated_by: userId || null
        });
        await auditBarcodeEvent({
            userId,
            barcode: row,
            action: 'DELETE',
            eventType: 'barcode.deactivated',
            changes: { normalized_code: row.normalized_code }
        });
        return serializeBarcodeRow(row);
    },
    async setPrimaryItemBarcode(itemId, barcodeId, userId = null) {
        const ItemBarcode = dbStore.get('ItemBarcode');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const normalizedItemId = Number.parseInt(itemId, 10);
        const normalizedBarcodeId = Number.parseInt(barcodeId, 10);
        const transaction = await sequelize.transaction();
        try {
            const row = await ItemBarcode.findOne({
                where: {
                    item_barcode_id: normalizedBarcodeId,
                    item_id: normalizedItemId,
                    is_active: true
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!row) throw notFoundError('Active barcode not found');
            await ItemBarcode.update(
                { is_primary: false, updated_by: userId || null },
                { where: { item_id: normalizedItemId }, transaction }
            );
            await row.update({ is_primary: true, updated_by: userId || null }, { transaction });
            await auditBarcodeEvent({
                userId,
                barcode: row,
                action: 'UPDATE',
                eventType: 'barcode.primary_changed',
                changes: { item_id: normalizedItemId },
                transaction
            });
            await transaction.commit();
            const updated = await ItemBarcode.findByPk(normalizedBarcodeId, {
                include: barcodeIncludeItem()
            });
            return serializeBarcodeRow(updated);
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            throw error;
        }
    },
    async buildItemBarcodeLabelPayload(itemId, { barcodeId = null, labelType = 'item' } = {}, userId = null) {
        const Item = dbStore.get('Item');
        const ItemBarcode = dbStore.get('ItemBarcode');
        const normalizedItemId = Number.parseInt(itemId, 10);
        const normalizedLabelType = normalizeBarcodeLabelType(labelType);
        const layout = BARCODE_LABEL_LAYOUTS[normalizedLabelType];
        const where = {
            item_id: normalizedItemId,
            is_active: true
        };
        if (barcodeId) where.item_barcode_id = Number.parseInt(barcodeId, 10);
        const [item, barcode] = await Promise.all([
            findVisibleItemById(Item, normalizedItemId, {
                attributes: ['item_id', 'name', 'sku_code', 'category', 'product_type', 'mode_item_preset', 'unit_of_measure', 'default_sale_price']
            }),
            ItemBarcode.findOne({
                where,
                order: [
                    ['is_primary', 'DESC'],
                    ['updated_at', 'DESC']
                ]
            })
        ]);
        if (!item) throw notFoundError('Item not found');
        if (!barcode) throw notFoundError('Active barcode not found');

        await auditBarcodeEvent({
            userId,
            barcode,
            action: 'VIEW',
            eventType: 'barcode.label_print_intent',
            changes: {
                label_type: normalizedLabelType,
                layout_purpose: layout.purpose
            }
        });

        const itemPayload = toPlain(item);
        const barcodePayload = serializeBarcodeRow(barcode);
        return {
            label_type: normalizedLabelType,
            barcode: barcodePayload,
            item: itemPayload,
            display: {
                label_title: layout.title,
                title: itemPayload.name,
                subtitle: itemPayload.sku_code || `Item ${itemPayload.item_id}`,
                purpose: layout.purpose,
                quantity_multiplier: barcodePayload.quantity_multiplier,
                unit_of_measure: itemPayload.unit_of_measure || null,
                generated_at: new Date().toISOString()
            },
            print_contract: {
                format: 'browser_printable',
                layout,
                human_readable_type: layout.title,
                qr_payload: barcodePayload.code,
                barcode_payload: barcodePayload.code
            }
        };
    },
    async listFolders() {
        const ItemFolder = dbStore.get('ItemFolder');
        const Item = dbStore.get('Item');

        try {
            const folders = await ItemFolder.findAll({
                where: { deleted_at: null },
                include: [
                    {
                        model: Item,
                        as: 'items',
                        attributes: ['item_id'],
                        where: visibleItemWhere(),
                        required: false
                    }
                ]
            });

            return folders.map((folder) => ({
                folder_id: folder.folder_id,
                name: folder.name,
                description: folder.description,
                show_in_pos_filter: folder.show_in_pos_filter !== false,
                is_active: folder.is_active !== false,
                parent_id: folder.parent_id,
                item_count: folder.items?.length || 0
            }));
        } catch (error) {
            logger.error('Error listing inventory folders:', error);
            throw error;
        }
    },
    async createFolder(name, description = '', parent_id = null) {
        const ItemFolder = dbStore.get('ItemFolder');
        const normalizedName = String(name || '').trim();
        const normalizedDescription = String(description || '').trim();

        if (!normalizedName) {
            const error = new Error('Folder name is required');
            error.statusCode = 400;
            throw error;
        }

        try {
            const existingFolders = await ItemFolder.findAll({
                where: activeFolderWhere({ parent_id }),
                attributes: ['folder_id', 'name', 'description', 'show_in_pos_filter', 'is_active', 'parent_id']
            });
            const normalizedLookup = normalizedName.toLowerCase();
            const existingFolder = existingFolders.find((folder) => (
                String(folder?.name || '').trim().toLowerCase() === normalizedLookup
                && Number(folder?.parent_id || 0) === Number(parent_id || 0)
            ));

            if (existingFolder) {
                const error = new Error(`Category "${existingFolder.name}" already exists.`);
                error.statusCode = 409;
                error.code = 'CATEGORY_EXISTS';
                throw error;
            }

            const folder = await ItemFolder.create({
                name: normalizedName,
                description: normalizedDescription,
                show_in_pos_filter: true,
                is_active: true,
                parent_id
            });

            return {
                success: true,
                folder_id: folder.folder_id,
                name: folder.name,
                description: folder.description || '',
                parent_id: folder.parent_id,
                show_in_pos_filter: folder.show_in_pos_filter !== false,
                is_active: folder.is_active !== false,
                message: `Inventory folder "${folder.name}" created successfully`
            };
        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                const conflict = new Error(`Category "${normalizedName}" already exists.`, { cause: error });
                conflict.statusCode = 409;
                conflict.code = 'CATEGORY_EXISTS';
                throw conflict;
            }
            logger.error('Error creating inventory folder:', error);
            throw error;
        }
    },
    async updateFolder(folderId, payload = {}) {
        const supportedFields = ['name', 'description', 'is_active', 'show_in_pos_filter'];
        if (!supportedFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) {
            const error = new Error('No valid category fields to update');
            error.statusCode = 400;
            throw error;
        }

        const ItemFolder = dbStore.get('ItemFolder');
        const Item = dbStore.get('Item');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();
        let normalizedName = '';

        try {
            const folder = await ItemFolder.findByPk(folderId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!folder || folder.deleted_at) {
                const error = new Error('Folder not found');
                error.statusCode = 404;
                throw error;
            }

            const previousName = folder.name;
            normalizedName = Object.prototype.hasOwnProperty.call(payload, 'name')
                ? String(payload.name || '').trim()
                : folder.name;
            const nextIsActive = Object.prototype.hasOwnProperty.call(payload, 'is_active')
                ? payload.is_active === true
                : folder.is_active !== false;
            const updates = {};
            if (nextIsActive) {
                const existingFolders = await ItemFolder.findAll({
                    where: activeFolderWhere({ parent_id: folder.parent_id || null }),
                    attributes: ['folder_id', 'name'],
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                const duplicate = existingFolders.find((candidate) => (
                    Number(candidate.folder_id) !== Number(folder.folder_id)
                    && String(candidate.name || '').trim().toLowerCase() === normalizedName.toLowerCase()
                ));
                if (duplicate) {
                    const error = new Error(`Category "${duplicate.name}" already exists.`);
                    error.statusCode = 409;
                    error.code = 'CATEGORY_EXISTS';
                    throw error;
                }
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
                updates.name = normalizedName;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
                updates.description = String(payload.description || '').trim();
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'is_active')) {
                updates.is_active = payload.is_active === true;
            }
            if (Object.prototype.hasOwnProperty.call(payload, 'show_in_pos_filter')) {
                updates.show_in_pos_filter = payload.show_in_pos_filter !== false;
            }

            await folder.update(updates, { transaction });
            if (updates.name && updates.name !== previousName) {
                await Item.update(
                    { product_folder: updates.name },
                    { where: { folder_id: folder.folder_id }, transaction }
                );
            }

            await transaction.commit();
            return {
                success: true,
                folder_id: folder.folder_id,
                name: folder.name,
                description: folder.description || '',
                parent_id: folder.parent_id,
                show_in_pos_filter: folder.show_in_pos_filter !== false,
                is_active: folder.is_active !== false,
                message: `Category "${folder.name}" updated successfully.`
            };
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            if (error.name === 'SequelizeUniqueConstraintError') {
                const conflict = new Error(`Category "${normalizedName}" already exists.`, { cause: error });
                conflict.statusCode = 409;
                conflict.code = 'CATEGORY_EXISTS';
                throw conflict;
            }
            throw error;
        }
    },
    async deleteFolder(folderId, replacementFolderId = null, userId = null) {
        const ItemFolder = dbStore.get('ItemFolder');
        const Item = dbStore.get('Item');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const folder = await ItemFolder.findByPk(folderId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            if (!folder || folder.deleted_at) {
                const error = new Error('Folder not found');
                error.statusCode = 404;
                throw error;
            }

            // Lock assigned items before moving them so a concurrent item edit cannot leave an orphaned category reference.
            const assignedItems = await Item.findAll({
                where: visibleItemWhere({ folder_id: folder.folder_id || folderId }),
                attributes: ['item_id'],
                transaction,
                lock: transaction.LOCK.UPDATE
            });
            const assignedItemCount = assignedItems.length;
            let replacementFolder = null;

            if (assignedItemCount > 0) {
                const replacementId = Number(replacementFolderId);
                if (!Number.isInteger(replacementId) || replacementId <= 0) {
                    const error = new Error(`Category "${folder.name}" is assigned to ${assignedItemCount} item(s). Choose an active replacement category before deleting it.`);
                    error.statusCode = 409;
                    error.code = 'CATEGORY_REASSIGNMENT_REQUIRED';
                    throw error;
                }
                if (replacementId === Number(folder.folder_id || folderId)) {
                    const error = new Error('Choose a different category to receive the assigned items.');
                    error.statusCode = 400;
                    error.code = 'CATEGORY_REASSIGNMENT_INVALID';
                    throw error;
                }

                replacementFolder = await ItemFolder.findByPk(replacementId, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!replacementFolder) {
                    const error = new Error('The replacement category was not found.');
                    error.statusCode = 404;
                    error.code = 'CATEGORY_REPLACEMENT_NOT_FOUND';
                    throw error;
                }
                if (replacementFolder.is_active === false || replacementFolder.deleted_at) {
                    const error = new Error('The replacement category must be active.');
                    error.statusCode = 409;
                    error.code = 'CATEGORY_REPLACEMENT_INACTIVE';
                    throw error;
                }
                await Item.update(
                    {
                        folder_id: replacementFolder.folder_id,
                        product_folder: replacementFolder.name
                    },
                    {
                        where: { folder_id: folder.folder_id || folderId },
                        transaction
                    }
                );
            }

            await folder.update({
                is_active: false,
                deleted_at: new Date(),
                deleted_by: userId
            }, { transaction });
            await transaction.commit();

            return {
                success: true,
                replacement_folder_id: replacementFolder?.folder_id || null,
                items_moved: assignedItemCount,
                message: assignedItemCount > 0
                    ? `Category "${folder.name}" deleted and ${assignedItemCount} item(s) moved to "${replacementFolder.name}".`
                    : `Category "${folder.name}" deleted successfully.`
            };
        } catch (error) {
            if (!transaction.finished) await transaction.rollback();
            throw error;
        }
    }
};

assertItemRepositoryContract(itemRepository);
