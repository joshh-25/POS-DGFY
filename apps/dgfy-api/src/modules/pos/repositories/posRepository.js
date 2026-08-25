import crypto from 'crypto';
import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';
import { assertPosRepositoryContract } from '../contracts/posRepository.contract.js';
import { buildFinanciallyRecognizedSalesWhere } from '../../shared/utils/financialRecognition.js';
import {
    DEFAULT_WORKFLOW_MODE,
    normalizeWorkflowMode
} from '../../shared/constants/workflowModes.js';
import { resolveCatalogVisibility } from '../../shared/utils/catalogVisibilityPolicy.js';
import {
    buildCatalogSetupRecommendation,
    buildPosReadiness
} from '../../shared/utils/catalogSetupPolicy.js';
import { deriveImageAssetVariantUrls } from '../../shared/utils/imageAssetStorage.js';
import {
    detectBarcodeSymbology,
    isBarcodeScopeAllowedForSurface,
    normalizeBarcodeValue
} from '../../shared/utils/barcodePolicy.js';
import {
    loadItemLocationStockMap,
    applyItemLocationStockMap
} from '../../shared/repositories/itemLocationStockOverlay.js';
import { resolveEffectiveFnbModifierGroups } from '../../shared/utils/effectiveFnbModifierGroups.js';
import { getPosCashPaymentAmount, normalizePosPaymentBreakdown } from '../utils/paymentBreakdown.js';
import { buildPosTransactionHistorySearchConditions } from '../utils/posTransactionHistorySearch.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const normalizeBusinessDateValue = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    const normalized = String(value || '').trim();
    const dateMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
    return dateMatch ? dateMatch[1] : '';
};
const toDateStart = (value) => new Date(`${normalizeBusinessDateValue(value)}T00:00:00.000+08:00`);
const toDateEnd = (value) => new Date(`${normalizeBusinessDateValue(value)}T23:59:59.999+08:00`);
const toPositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};
const TERMINAL_REGISTRY_MODE_VALUES = new Set(['warn', 'enforce']);
const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const POS_BEST_SELLER_SETTINGS_KEY = 'pos_best_seller_settings';
const DEFAULT_BEST_SELLER_SETTINGS = Object.freeze({ enabled: true, lookback_days: 30, top_limit: 3 });
const DAILY_BEST_SELLER_SETTINGS = Object.freeze({ lookback_days: 1, top_limit: 1 });
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
const stableStringify = (value) => {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};
const hashFiscalEventPayload = (payload) => crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const getHistoryModelValue = (row, field) => {
    if (row && typeof row.get === 'function') return row.get(field);
    return row?.[field];
};

const findHistoryUserIds = async (User, value) => {
    if (!User?.findAll || !value) return [];

    const like = `%${String(value).trim()}%`;
    const rows = await User.findAll({
        where: {
            [Op.or]: [
                { username: { [Op.like]: like } },
                { email: { [Op.like]: like } }
            ]
        },
        attributes: ['user_id'],
        raw: true
    });

    return rows
        .map((row) => Number.parseInt(getHistoryModelValue(row, 'user_id'), 10))
        .filter((userId) => Number.isInteger(userId) && userId > 0);
};

const findHistoryDiscountTransactionIds = async (PosTransactionDiscount, value, approvedUserIds = []) => {
    if (!PosTransactionDiscount?.findAll || !value) return [];

    const like = `%${String(value).trim()}%`;
    const rows = await PosTransactionDiscount.findAll({
        where: {
            [Op.or]: [
                { discount_type: { [Op.like]: like } },
                { employee_name: { [Op.like]: like } },
                { employee_id: { [Op.like]: like } },
                { customer_name: { [Op.like]: like } },
                { promo_code: { [Op.like]: like } },
                { manager_approval_id: { [Op.in]: approvedUserIds } }
            ]
        },
        attributes: ['transaction_id'],
        raw: true
    });

    return rows
        .map((row) => Number.parseInt(getHistoryModelValue(row, 'transaction_id'), 10))
        .filter((transactionId) => Number.isInteger(transactionId) && transactionId > 0);
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
const normalizeTerminalPairingRegistry = (rawValue) => {
    const parsed = parseJsonLoosely(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map((entry) => {
            const terminalId = String(entry?.terminal_id || '').trim().toUpperCase();
            const legacyPasswordHash = String(entry?.terminal_password_hash || '').trim();
            return {
                terminal_id: terminalId,
                label: String(entry?.label || '').trim(),
                location_id: toPositiveInt(entry?.location_id),
                is_active: entry?.is_active !== false,
                pairing_version: String(entry?.pairing_version || '').trim()
                    || (legacyPasswordHash
                        ? crypto.createHash('sha256').update(`${terminalId}\u0000${legacyPasswordHash}`).digest('hex')
                        : '')
            };
        })
        .filter((entry) => entry.is_active && TERMINAL_ID_PATTERN.test(entry.terminal_id));
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
    // mode_item_preset is required for isStockExemptServiceItem's
    // mode_item_preset === 'service' branch to fire on this catalog path.
    'mode_item_preset',
    'unit_of_measure',
    'current_stock',
    'min_threshold',
    'fifo_enabled',
    // Axis 4 tracking mode - required for resolveStockBearingDescriptor to see
    // the persisted mode instead of only the legacy fifo_enabled/category signals.
    'tracking_mode',
    'tracking_toggle_available',
    'cost_per_unit',
    'default_sale_price',
    // The POS item editor uses the catalog row to preselect its saved category.
    'folder_id',
    'product_folder'
];
const POS_ITEM_ATTRIBUTES_WITH_VAT = [...BASE_POS_ITEM_ATTRIBUTES, 'vat_type', 'senior_pwd_discount_eligible'];
const POS_CATALOG_OVERRIDE_ATTRIBUTES = [
    'item_id',
    'pos_visible',
    'pos_always_available',
    'pos_best_seller_mode',
    'pos_image_path',
    'pos_image_url'
];

const normalizeBestSellerSettings = (value) => {
    const parsed = parseJsonLoosely(value);
    return {
        enabled: parsed?.enabled !== false,
        lookback_days: DEFAULT_BEST_SELLER_SETTINGS.lookback_days,
        top_limit: DEFAULT_BEST_SELLER_SETTINGS.top_limit,
        daily_top_enabled: parsed?.daily_top_enabled === true
    };
};

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

const isMissingStorefrontCatalogOverrideTableError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' || message.includes('storefront_catalog_overrides');
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

const isDiscountAuthorizer = (row) => {
    const plain = toPlain(row) || {};
    const role = String(plain.role || '').trim().toLowerCase();
    return plain.is_master_admin === true
        || ['admin', 'manager'].includes(role)
        || hasEffectivePermission(plain, PERMISSIONS.POS.actions.AUTHORIZE_DISCOUNTS);
};

const serializeDiscountAuthorizer = (row) => {
    const plain = toPlain(row);
    if (!plain) return null;
    return {
        ...plain,
        can_authorize_discounts: isDiscountAuthorizer(plain)
    };
};

const toPlainPaymentSession = (row) => {
    const session = toPlain(row);
    if (!session || typeof session !== 'object') return session;
    if (!Object.prototype.hasOwnProperty.call(session, 'snapshot')) return session;
    return {
        ...session,
        snapshot: parseJsonLoosely(session.snapshot)
    };
};

const buildServiceDetailInclude = () => {
    const ServiceItemDetail = safeGetModel('ServiceItemDetail');
    return ServiceItemDetail
        ? [{
            model: ServiceItemDetail,
            as: 'serviceDetail',
            attributes: ['bookable', 'visible_in_pos', 'visible_in_storefront', 'addons_enabled'],
            required: false
        }]
        : [];
};

const buildItemFolderInclude = () => {
    const ItemFolder = safeGetModel('ItemFolder');
    const FnbModifierGroup = safeGetModel('FnbModifierGroup');
    const FnbModifierOption = safeGetModel('FnbModifierOption');
    const FnbFolderModifierGroup = safeGetModel('FnbFolderModifierGroup');
    const FnbModifierGroupLocationAvailability = safeGetModel('FnbModifierGroupLocationAvailability');
    const FnbModifierOptionLocationAvailability = safeGetModel('FnbModifierOptionLocationAvailability');
    return ItemFolder
        ? [{
            model: ItemFolder,
            as: 'folder',
            attributes: ['folder_id', 'name', 'is_active', 'show_in_pos_filter'],
            required: false,
            include: FnbModifierGroup && FnbFolderModifierGroup ? [{
                model: FnbModifierGroup,
                as: 'fnbModifierGroups',
                required: false,
                through: { model: FnbFolderModifierGroup, attributes: ['is_required_override', 'sort_order'] },
                include: FnbModifierOption ? [{
                    model: FnbModifierOption,
                    as: 'options',
                    required: false,
                    include: FnbModifierOptionLocationAvailability ? [{
                        model: FnbModifierOptionLocationAvailability,
                        as: 'locationAvailability',
                        required: false
                    }] : []
                }, ...(FnbModifierGroupLocationAvailability ? [{
                    model: FnbModifierGroupLocationAvailability,
                    as: 'locationAvailability',
                    required: false
                }] : [])] : []
            }] : []
        }]
        : [];
};

const buildFnbCatalogIncludes = () => {
    const FnbModifierGroup = safeGetModel('FnbModifierGroup');
    const FnbModifierOption = safeGetModel('FnbModifierOption');
    const FnbModifierGroupLocationAvailability = safeGetModel('FnbModifierGroupLocationAvailability');
    const FnbModifierOptionLocationAvailability = safeGetModel('FnbModifierOptionLocationAvailability');
    const FnbItemKitchenRoute = safeGetModel('FnbItemKitchenRoute');
    const FnbKitchenStation = safeGetModel('FnbKitchenStation');
    const includes = [];
    if (FnbModifierGroup && FnbModifierOption) {
        includes.push({
            model: FnbModifierGroup,
            as: 'fnbModifierGroups',
            required: false,
            through: {
                attributes: ['is_required_override', 'is_excluded', 'sort_order']
            },
            include: [{
                model: FnbModifierOption,
                as: 'options',
                required: false,
                include: FnbModifierOptionLocationAvailability ? [{
                    model: FnbModifierOptionLocationAvailability,
                    as: 'locationAvailability',
                    required: false
                }] : []
            }, ...(FnbModifierGroupLocationAvailability ? [{
                model: FnbModifierGroupLocationAvailability,
                as: 'locationAvailability',
                required: false
            }] : [])]
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

const getCurrentWorkflowMode = async () => {
    const SystemSetting = safeGetModel('SystemSetting');
    if (!SystemSetting) return DEFAULT_WORKFLOW_MODE;
    const row = await SystemSetting.findOne({
        where: { setting_key: WORKFLOW_MODE_SETTING_KEY },
        attributes: ['setting_value']
    });
    return normalizeWorkflowMode(row?.setting_value ?? DEFAULT_WORKFLOW_MODE);
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

const queryTopSellingItemIds = async ({
    normalizedItemIds,
    PosTransaction,
    PosTransactionLine,
    sequelize,
    lookbackDays,
    topLimit,
    transaction
}) => {
    const since = new Date(Date.now() - (lookbackDays * 24 * 60 * 60 * 1000));
    const rows = await PosTransactionLine.findAll({
        where: { item_id: { [Op.in]: normalizedItemIds } },
        include: [{
            model: PosTransaction,
            as: 'transaction',
            attributes: [],
            required: true,
            where: {
                status: 'completed',
                payment_status: 'paid',
                created_at: { [Op.gte]: since }
            }
        }],
        attributes: [
            'item_id',
            [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('PosTransactionLine.quantity')), 0), 'sold_quantity']
        ],
        group: ['PosTransactionLine.item_id'],
        order: [[sequelize.literal('sold_quantity'), 'DESC'], ['item_id', 'ASC']],
        limit: topLimit,
        raw: true,
        transaction
    });
    return rows
        .filter((row) => Number(row?.sold_quantity || 0) > 0)
        .map((row) => Number(row.item_id));
};

const loadBestSellerItemIds = async (itemIds = [], options = {}) => {
    const normalizedItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
        .map((itemId) => Number.parseInt(itemId, 10))
        .filter((itemId) => Number.isInteger(itemId) && itemId > 0))];
    if (normalizedItemIds.length === 0) return new Set();

    const SystemSetting = safeGetModel('SystemSetting');
    const PosTransaction = safeGetModel('PosTransaction');
    const PosTransactionLine = safeGetModel('PosTransactionLine');
    const sequelize = dbStore.getStore()?.sequelize || safeGetModel('sequelize');
    if (
        !SystemSetting || typeof SystemSetting.findOne !== 'function'
        || !PosTransaction || !PosTransactionLine || typeof PosTransactionLine.findAll !== 'function'
        || !sequelize || typeof sequelize.fn !== 'function' || typeof sequelize.col !== 'function' || typeof sequelize.literal !== 'function'
    ) return new Set();

    const settingsRow = await SystemSetting.findOne({
        where: { setting_key: POS_BEST_SELLER_SETTINGS_KEY },
        attributes: ['setting_value']
    });
    const settings = normalizeBestSellerSettings(settingsRow?.setting_value);
    if (settings.enabled !== true && settings.daily_top_enabled !== true) return new Set();

    const queryArgs = { normalizedItemIds, PosTransaction, PosTransactionLine, sequelize, transaction: options.transaction };
    const bestSellerIds = new Set();

    if (settings.enabled === true) {
        (await queryTopSellingItemIds({
            ...queryArgs,
            lookbackDays: settings.lookback_days,
            topLimit: settings.top_limit
        })).forEach((itemId) => bestSellerIds.add(itemId));
    }

    if (settings.daily_top_enabled === true) {
        (await queryTopSellingItemIds({
            ...queryArgs,
            lookbackDays: DAILY_BEST_SELLER_SETTINGS.lookback_days,
            topLimit: DAILY_BEST_SELLER_SETTINGS.top_limit
        })).forEach((itemId) => bestSellerIds.add(itemId));
    }

    return bestSellerIds;
};

const loadStorefrontCatalogImageMap = async (itemIds = [], options = {}) => {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return new Map();
    }

    const StorefrontCatalogOverride = safeGetModel('StorefrontCatalogOverride');
    if (!StorefrontCatalogOverride) {
        return new Map();
    }

    try {
        const rows = await StorefrontCatalogOverride.findAll({
            where: { item_id: { [Op.in]: itemIds } },
            attributes: ['item_id', 'storefront_image_path', 'storefront_image_url', 'storefront_image_gallery'],
            transaction: options.transaction
        });

        return new Map(rows.map((row) => {
            const payload = toPlain(row);
            return [payload.item_id, payload];
        }));
    } catch (error) {
        if (isMissingStorefrontCatalogOverrideTableError(error)) {
            return new Map();
        }
        throw error;
    }
};

// POS terminal catalog display prefers a POS-specific override image
// (pos_catalog_overrides.pos_image_*) when present, falling back to the shared
// Storefront catalog image only when no POS-specific image exists -- the
// contract documented in
// docs/compliance/impact-declarations/2026-06-15-pos-shared-item-image-gallery.md
// ("...pos_image_url first, then the shared Storefront catalog primary item
// image as a display fallback... Legacy POS-only image data remains
// compatible and remains preferred when present."). listCatalog()'s
// applyCatalogOverrides() and getCatalogReadinessByItemId() previously always
// used the Storefront image unconditionally, silently dropping a working
// POS-specific image whenever both existed (#871) -- fixed by routing both
// through this single helper instead of re-deriving the precedence inline.
const resolvePosDisplayImage = ({ override, storefrontImage }) => {
    const path = override?.pos_image_path || storefrontImage?.storefront_image_path || null;
    const url = override?.pos_image_url || storefrontImage?.storefront_image_url || null;
    return {
        path,
        url,
        variants: deriveImageAssetVariantUrls({ storedPath: path, storedUrl: url })
    };
};

const loadPrimaryBarcodeMap = async (itemIds = [], options = {}) => {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return new Map();
    }

    const ItemBarcode = safeGetModel('ItemBarcode');
    if (!ItemBarcode || typeof ItemBarcode.findAll !== 'function') {
        return new Map();
    }

    const rows = await ItemBarcode.findAll({
        where: {
            item_id: { [Op.in]: itemIds },
            is_active: true
        },
        attributes: ['item_barcode_id', 'item_id', 'code', 'scope', 'is_primary'],
        order: [
            ['item_id', 'ASC'],
            ['is_primary', 'DESC'],
            ['item_barcode_id', 'ASC']
        ],
        transaction: options.transaction
    });

    const primaryBarcodeMap = new Map();
    rows
        // A catalog barcode is shown to POS operators as a scan target, so it
        // must use one of the scopes that the POS scanner can actually resolve.
        .filter((row) => isBarcodeScopeAllowedForSurface(row.scope, 'pos'))
        .forEach((row) => {
            const barcode = toPlain(row);
            const itemId = Number(barcode?.item_id);
            if (!Number.isInteger(itemId) || itemId <= 0 || primaryBarcodeMap.has(itemId)) {
                return;
            }
            primaryBarcodeMap.set(itemId, {
                item_barcode_id: Number(barcode.item_barcode_id),
                code: String(barcode.code || '').trim(),
                scope: String(barcode.scope || '').trim(),
                is_primary: barcode.is_primary === true
            });
        });

    return primaryBarcodeMap;
};

const applyCatalogOverrides = async (items, options = {}) => {
    const normalizedItems = (Array.isArray(items) ? items : []).map((item) => {
        const plain = toPlain(item);
        return {
            ...plain,
            fnbModifierGroups: resolveEffectiveFnbModifierGroups(plain)
        };
    });
    const itemIds = normalizedItems.map((item) => item.item_id);
    const overrideMap = await loadCatalogOverridesMap(itemIds, options);
    const autoBestSellerItemIds = await loadBestSellerItemIds(itemIds, options);
    const storefrontImageMap = await loadStorefrontCatalogImageMap(itemIds, options);
    const primaryBarcodeMap = options.includePrimaryBarcode === true
        ? await loadPrimaryBarcodeMap(itemIds, options)
        : new Map();

    return normalizedItems
        .map((item) => {
            const override = overrideMap.get(item.item_id);
            const storefrontImage = storefrontImageMap.get(item.item_id);
            const posVisible = resolveCatalogVisibility({ item, override, surface: 'pos' });
            const bestSellerMode = ['force', 'never'].includes(override?.pos_best_seller_mode)
                ? override.pos_best_seller_mode
                : 'auto';
            const posDisplayImage = resolvePosDisplayImage({ override, storefrontImage });
            return {
                ...item,
                pos_visible: posVisible,
                pos_always_available: override?.pos_always_available === true,
                pos_best_seller_mode: bestSellerMode,
                is_best_seller: bestSellerMode === 'force'
                    || (bestSellerMode === 'auto' && autoBestSellerItemIds.has(Number(item.item_id))),
                pos_image_path: posDisplayImage.path,
                pos_image_url: posDisplayImage.url,
                pos_image_variants: posDisplayImage.variants,
                storefront_image_path: storefrontImage?.storefront_image_path || null,
                storefront_image_url: storefrontImage?.storefront_image_url || null,
                storefront_image_variants: deriveImageAssetVariantUrls({
                    storedPath: storefrontImage?.storefront_image_path || null,
                    storedUrl: storefrontImage?.storefront_image_url || null
                }),
                storefront_image_gallery: storefrontImage?.storefront_image_gallery || null,
                ...(options.includePrimaryBarcode === true
                    ? { primary_barcode: primaryBarcodeMap.get(Number(item.item_id)) || null }
                    : {})
            };
        })
        .filter((item) => item.pos_visible !== false);
};

const computeTransactionTotalCost = (lines = []) => round4(
    (Array.isArray(lines) ? lines : []).reduce((sum, line) => (
        sum + (Number(line?.quantity || 0) * Number(line?.cost_snapshot || 0))
    ), 0)
);

const buildTerminalScopedSalesWhere = ({
    startAt,
    endAt,
    terminalId = null,
    cashierId = null,
    shiftId = null,
    locationId = null,
    includeOnlineStoreAcrossTerminals = false
} = {}) => {
    const baseWhere = {
        created_at: {
            [Op.gte]: startAt,
            [Op.lt]: endAt
        }
    };
    if (locationId) baseWhere.location_id = locationId;

    const scopedWhere = { ...baseWhere };
    if (terminalId) scopedWhere.terminal_id = terminalId;
    if (cashierId) scopedWhere.cashier_id = cashierId;
    if (shiftId) scopedWhere.shift_id = shiftId;

    if (!includeOnlineStoreAcrossTerminals || (!terminalId && !cashierId && !shiftId)) {
        return buildFinanciallyRecognizedSalesWhere(scopedWhere);
    }

    return {
        [Op.or]: [
            {
                ...scopedWhere,
                status: 'completed',
                [Op.or]: [
                    { order_source: 'in_store' },
                    { order_source: null }
                ]
            },
            {
                ...baseWhere,
                status: 'completed',
                order_source: 'online_store',
                fulfillment_status: 'completed'
            }
        ]
    };
};

const buildTerminalScopedVoidWhere = ({
    startAt,
    endAt,
    terminalId = null,
    cashierId = null,
    shiftId = null,
    locationId = null,
    includeOnlineStoreAcrossTerminals = false
} = {}) => {
    const baseWhere = {
        status: 'voided',
        voided_at: {
            [Op.gte]: startAt,
            [Op.lt]: endAt
        }
    };
    if (locationId) baseWhere.location_id = locationId;

    const scopedWhere = { ...baseWhere };
    if (terminalId) scopedWhere.terminal_id = terminalId;
    if (cashierId) scopedWhere.cashier_id = cashierId;
    if (shiftId) scopedWhere.shift_id = shiftId;

    if (!includeOnlineStoreAcrossTerminals || (!terminalId && !cashierId && !shiftId)) {
        return scopedWhere;
    }

    return {
        [Op.or]: [
            {
                ...scopedWhere,
                [Op.or]: [
                    { order_source: 'in_store' },
                    { order_source: null }
                ]
            },
            {
                ...baseWhere,
                order_source: 'online_store'
            }
        ]
    };
};

const buildPostCloseVoidWhere = ({
    closedAt,
    shiftId = null,
    terminalId = null,
    locationId = null
} = {}) => {
    const normalizedClosedAt = closedAt instanceof Date ? closedAt : new Date(closedAt || '');
    if (Number.isNaN(normalizedClosedAt.getTime())) return null;

    const where = {
        status: 'voided',
        voided_at: {
            [Op.gte]: normalizedClosedAt,
            [Op.lte]: new Date()
        }
    };
    if (shiftId) where.shift_id = shiftId;
    if (terminalId) where.terminal_id = terminalId;
    if (locationId) where.location_id = locationId;
    return where;
};

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
        model: dbStore.get('PosTransactionDiscount'),
        as: 'discount',
        required: false,
        include: [
            { model: dbStore.get('PosTransactionDiscountLine'), as: 'lines', required: false },
            { model: dbStore.get('User'), as: 'approvedBy', attributes: ['user_id', 'username', 'role'], required: false }
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
        attributes: ['customer_id', 'dgfy_account_id', 'email', 'name', 'phone']
    },
    {
        model: dbStore.get('DeliveryJob'),
        as: 'deliveryJob',
        required: false,
        attributes: [
            'delivery_job_id',
            'provider',
            'provider_delivery_id',
            'status',
            'delivery_personnel_id',
            'delivery_personnel_name',
            'assigned_by',
            'assigned_shift_id',
            'assigned_at',
            'tracking_url',
            'pickup_ready_at',
            'picked_up_at',
            'delivered_at',
            'failure_reason',
            'provider_payload'
        ],
        include: [
            {
                model: dbStore.get('DeliveryPersonnel'),
                as: 'deliveryPersonnel',
                required: false,
                attributes: ['delivery_personnel_id', 'display_name', 'phone', 'location_id', 'is_active']
            },
            {
                model: dbStore.get('User'),
                as: 'assignedByUser',
                required: false,
                attributes: ['user_id', 'username', 'email']
            },
            {
                model: dbStore.get('PosTerminalShift'),
                as: 'assignedShift',
                required: false,
                attributes: ['pos_terminal_shift_id', 'terminal_id', 'location_id', 'cashier_id', 'status', 'opened_at']
            }
        ]
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
        as: 'paymentCollectedByUser',
        required: false,
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
            'opening_float_amount',
            'closing_cash_amount',
            'expected_cash_amount',
            'cash_variance_amount',
            'opened_at',
            'closed_at'
        ]
    }
]);

const REPORT_PAYMENT_GROUP_LABELS = Object.freeze({
    cash: 'Cash',
    gcash: 'GCash',
    maya: 'Online',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    qrph: 'Online'
});

const REPORT_SOURCE_LABELS = Object.freeze({
    in_store: 'In-Store',
    online_store: 'Online Store',
    delivery: 'Delivery',
    pickup: 'Pickup'
});

const REFUND_PAYMENT_STATUSES = new Set(['refund_pending', 'partial_refunded', 'refunded']);
const REPORT_ADJUSTMENT_TYPES = new Set([
    'cash_refund',
    'external_refund',
    'provider_refund',
    'employee_credit_reversal'
]);

const sumBy = (rows = [], selector = () => 0) => round4((Array.isArray(rows) ? rows : []).reduce((sum, row) => (
    sum + Number(selector(row) || 0)
), 0));

const uniqueCountBy = (rows = [], selector = () => null) => {
    const values = new Set();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const value = selector(row);
        if (value !== null && value !== undefined && value !== '') {
            values.add(String(value));
        }
    });
    return values.size;
};

const getManilaDateParts = (value = new Date()) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(value);
    const year = parts.find((part) => part.type === 'year')?.value || '1970';
    const month = parts.find((part) => part.type === 'month')?.value || '01';
    const day = parts.find((part) => part.type === 'day')?.value || '01';
    return { year, month, day, date: `${year}-${month}-${day}` };
};

const addDays = (value, days) => {
    const next = new Date(value.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
};

const addMonthsUtc = (value, months) => {
    const next = new Date(Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        1,
        0, 0, 0, 0
    ));
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
};

const startOfWeekMondayUtc = (value) => {
    const next = new Date(Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
        0, 0, 0, 0
    ));
    const day = next.getUTCDay();
    const delta = day === 0 ? -6 : 1 - day;
    next.setUTCDate(next.getUTCDate() + delta);
    return next;
};

const getDefaultReportRange = (granularity = 'daily') => {
    const { year, month, day } = getManilaDateParts(new Date());
    const currentUtc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0));

    switch (granularity) {
        case 'weekly': {
            const start = startOfWeekMondayUtc(currentUtc);
            return { dateFrom: start.toISOString().slice(0, 10), dateTo: addDays(start, 6).toISOString().slice(0, 10) };
        }
        case 'monthly': {
            const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1, 0, 0, 0, 0));
            const end = addDays(addMonthsUtc(start, 1), -1);
            return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
        }
        case 'yearly': {
            const start = new Date(Date.UTC(Number(year), 0, 1, 0, 0, 0, 0));
            const end = new Date(Date.UTC(Number(year), 11, 31, 0, 0, 0, 0));
            return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
        }
        case 'daily':
        default:
            return { dateFrom: `${year}-${month}-${day}`, dateTo: `${year}-${month}-${day}` };
    }
};

// NOTE: endAtExclusive is deliberately computed from toDateStart(dateTo) + 1 day,
// not addDays(toDateEnd(dateTo), 1) -- the latter double-counts a day because
// toDateEnd is already dateTo 23:59:59.999, so adding a day to it lands on
// dateTo+1 23:59:59.999 instead of the correct dateTo+1 00:00:00.000 boundary.
const resolveReportDateRange = (filters = {}) => {
    const granularity = String(filters?.granularity || 'daily').trim().toLowerCase() || 'daily';
    const defaults = getDefaultReportRange(granularity);
    const dateFrom = normalizeBusinessDateValue(filters?.date_from || defaults.dateFrom) || defaults.dateFrom;
    const dateTo = normalizeBusinessDateValue(filters?.date_to || defaults.dateTo) || dateFrom;
    const startAt = toDateStart(dateFrom);
    const endAtExclusive = new Date(toDateStart(dateTo).getTime() + (24 * 60 * 60 * 1000));
    return {
        granularity,
        dateFrom,
        dateTo,
        startAt,
        endAtExclusive
    };
};

const buildPosReportWhere = (filters = {}, { startAt, endAtExclusive } = {}) => {
    const baseWhere = {
        created_at: {
            [Op.gte]: startAt,
            [Op.lt]: endAtExclusive
        }
    };
    const cashierId = Number.parseInt(filters.cashier_id, 10);
    if (Number.isInteger(cashierId) && cashierId > 0) {
        baseWhere.cashier_id = cashierId;
    }
    const locationId = Number.parseInt(filters.location_id, 10);
    if (Number.isInteger(locationId) && locationId > 0) {
        baseWhere.location_id = locationId;
    }
    const terminalId = String(filters.terminal_id || '').trim();
    if (terminalId) {
        baseWhere.terminal_id = terminalId;
    }
    if (filters.payment_type) {
        baseWhere.payment_type = filters.payment_type;
    }

    const where = buildFinanciallyRecognizedSalesWhere(baseWhere);
    // Reports must reflect POS voids (unlike Z-reading/financial-recognition
    // callers of this shared where-builder, which intentionally only count
    // 'completed'): relax the status filter so voided transactions surface in
    // refunds_voids/gross_sales instead of being silently excluded.
    where.status = { [Op.in]: ['completed', 'voided'] };

    const source = String(filters.source || '').trim().toLowerCase();
    if (source === 'in_store') {
        where[Op.and] = [...(Array.isArray(where[Op.and]) ? where[Op.and] : []), {
            [Op.or]: [{ order_source: 'in_store' }, { order_source: null }]
        }];
    } else if (source === 'online_store') {
        where[Op.and] = [...(Array.isArray(where[Op.and]) ? where[Op.and] : []), {
            order_source: 'online_store'
        }];
    } else if (source === 'delivery') {
        where[Op.and] = [...(Array.isArray(where[Op.and]) ? where[Op.and] : []), {
            order_method: 'delivery'
        }];
    } else if (source === 'pickup') {
        where[Op.and] = [...(Array.isArray(where[Op.and]) ? where[Op.and] : []), {
            order_method: 'pickup'
        }];
    }
    return where;
};

const toManilaDateKey = (value) => {
    if (!value) return '';
    return getManilaDateParts(new Date(value)).date;
};

const toMonthKey = (value) => {
    const dateKey = toManilaDateKey(value);
    return dateKey ? dateKey.slice(0, 7) : '';
};

const toYearKey = (value) => {
    const dateKey = toManilaDateKey(value);
    return dateKey ? dateKey.slice(0, 4) : '';
};

const toWeekKey = (value) => {
    const dateKey = toManilaDateKey(value);
    if (!dateKey) return '';
    const start = startOfWeekMondayUtc(new Date(`${dateKey}T00:00:00.000Z`));
    return start.toISOString().slice(0, 10);
};

const toDisplayPaymentGroup = (paymentType) => REPORT_PAYMENT_GROUP_LABELS[String(paymentType || '').trim().toLowerCase()] || 'Online';

const resolveReportSourceLabel = (transaction = {}) => {
    const orderMethod = String(transaction?.order_method || '').trim().toLowerCase();
    if (orderMethod === 'delivery') return REPORT_SOURCE_LABELS.delivery;
    if (orderMethod === 'pickup') return REPORT_SOURCE_LABELS.pickup;
    const orderSource = String(transaction?.order_source || '').trim().toLowerCase();
    if (orderSource === 'online_store') return REPORT_SOURCE_LABELS.online_store;
    return REPORT_SOURCE_LABELS.in_store;
};

const buildReportInclude = () => ([
    {
        model: dbStore.get('PosTransactionLine'),
        as: 'lines',
        include: [{
            model: dbStore.get('Item'),
            as: 'item',
            attributes: ['item_id', 'name', 'sku_code', 'category', 'product_folder', 'folder_id', 'cost_per_unit', 'default_sale_price', 'unit_of_measure'],
            include: [{
                model: dbStore.get('ItemFolder'),
                as: 'folder',
                attributes: ['folder_id', 'name'],
                required: false
            }]
        }]
    },
    {
        model: dbStore.get('User'),
        as: 'cashier',
        attributes: ['user_id', 'username']
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
        attributes: ['user_id', 'username']
    },
    {
        model: dbStore.get('PosTerminalShift'),
        as: 'shift',
        attributes: ['pos_terminal_shift_id', 'business_date', 'terminal_id', 'location_id', 'status']
    }
]);

// spanDays uses the same toDateStart(dateTo)+1day exclusive boundary as
// resolveReportDateRange above (not toDateEnd) so a single-day range yields
// spanDays=1, not 2.
const buildComparisonRange = ({ dateFrom, dateTo }) => {
    const currentStart = toDateStart(dateFrom);
    const currentEndExclusive = new Date(toDateStart(dateTo).getTime() + (24 * 60 * 60 * 1000));
    const spanDays = Math.max(1, Math.round((currentEndExclusive.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)));
    const previousEnd = addDays(currentStart, -1);
    const previousStart = addDays(previousEnd, -(spanDays - 1));
    return {
        current: {
            dateFrom,
            dateTo
        },
        previous: {
            dateFrom: previousStart.toISOString().slice(0, 10),
            dateTo: previousEnd.toISOString().slice(0, 10)
        }
    };
};

const buildFixedComparisonPeriods = ({ dateTo }) => {
    const endDate = normalizeBusinessDateValue(dateTo) || getManilaDateParts(new Date()).date;
    const today = new Date(`${endDate}T00:00:00.000Z`);
    const yesterday = addDays(today, -1);
    const weekStart = startOfWeekMondayUtc(today);
    const lastWeekStart = addDays(weekStart, -7);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
    const lastMonthStart = addMonthsUtc(monthStart, -1);
    const lastMonthEnd = addDays(monthStart, -1);
    const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    const lastYearStart = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1, 0, 0, 0, 0));
    const lastYearEnd = new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31, 0, 0, 0, 0));

    return [
        {
            key: 'today_vs_yesterday',
            label: 'Today vs Yesterday',
            current: { dateFrom: endDate, dateTo: endDate },
            previous: {
                dateFrom: yesterday.toISOString().slice(0, 10),
                dateTo: yesterday.toISOString().slice(0, 10)
            }
        },
        {
            key: 'this_week_vs_last_week',
            label: 'This Week vs Last Week',
            current: {
                dateFrom: weekStart.toISOString().slice(0, 10),
                dateTo: endDate
            },
            previous: {
                dateFrom: lastWeekStart.toISOString().slice(0, 10),
                dateTo: addDays(weekStart, -1).toISOString().slice(0, 10)
            }
        },
        {
            key: 'this_month_vs_last_month',
            label: 'This Month vs Last Month',
            current: {
                dateFrom: monthStart.toISOString().slice(0, 10),
                dateTo: endDate
            },
            previous: {
                dateFrom: lastMonthStart.toISOString().slice(0, 10),
                dateTo: lastMonthEnd.toISOString().slice(0, 10)
            }
        },
        {
            key: 'this_year_vs_last_year',
            label: 'This Year vs Last Year',
            current: {
                dateFrom: yearStart.toISOString().slice(0, 10),
                dateTo: endDate
            },
            previous: {
                dateFrom: lastYearStart.toISOString().slice(0, 10),
                dateTo: lastYearEnd.toISOString().slice(0, 10)
            }
        }
    ];
};

const buildPeriodComparisonMetrics = (current = {}, previous = {}) => {
    const currentSales = Number(current.net_sales || 0);
    const previousSales = Number(previous.net_sales || 0);
    const currentProfit = Number(current.pos_profit_loss || 0);
    const previousProfit = Number(previous.pos_profit_loss || 0);

    const salesDelta = round4(currentSales - previousSales);
    const profitDelta = round4(currentProfit - previousProfit);

    return {
        current,
        previous,
        sales_delta: salesDelta,
        profit_delta: profitDelta,
        sales_delta_percentage: previousSales > 0 ? round4((salesDelta / previousSales) * 100) : (currentSales > 0 ? 100 : 0),
        profit_delta_percentage: previousProfit !== 0 ? round4((profitDelta / previousProfit) * 100) : (currentProfit > 0 ? 100 : 0)
    };
};

const serializeReportSummary = (lineRows = []) => {
    const grossSales = sumBy(lineRows, (row) => row.gross_sales);
    const netSales = sumBy(lineRows, (row) => row.net_sales);
    const cogs = sumBy(lineRows, (row) => row.cogs);
    const posProfitLoss = round4(netSales - cogs);
    return {
        gross_sales: grossSales,
        net_sales: netSales,
        cogs,
        pos_profit_loss: posProfitLoss,
        profit_margin: netSales > 0 ? round4((posProfitLoss / netSales) * 100) : 0,
        total_transactions: uniqueCountBy(lineRows, (row) => row.transaction_id),
        total_items_sold: sumBy(lineRows, (row) => row.quantity),
        discounts: sumBy(lineRows, (row) => row.discount_amount),
        refunds_voids: sumBy(lineRows, (row) => row.refund_amount),
        vat: sumBy(lineRows, (row) => row.vat_amount),
        service_fees: sumBy(lineRows, (row) => row.service_fee_amount),
        is_loss: posProfitLoss < 0
    };
};

const groupRowsBy = (rows = [], keySelector = () => '') => {
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = keySelector(row);
        if (!key) return;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(row);
    });
    return groups;
};

const buildTimeSeries = (rows = [], granularity = 'daily') => {
    const keySelector = granularity === 'yearly'
        ? (row) => toYearKey(row.created_at)
        : granularity === 'monthly'
            ? (row) => toMonthKey(row.created_at)
            : granularity === 'weekly'
                ? (row) => toWeekKey(row.created_at)
                : (row) => toManilaDateKey(row.created_at);
    const groups = groupRowsBy(rows, keySelector);
    return Array.from(groups.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entries]) => {
            const summary = serializeReportSummary(entries);
            return {
                period: key,
                label: key,
                ...summary
            };
        });
};

const buildPaymentBreakdown = (rows = []) => {
    const rowsWithSnapshots = rows.filter((row) => Array.isArray(parseJsonLoosely(row?.payment_breakdown)));
    if (rowsWithSnapshots.length > 0) {
        const transactionGroups = groupRowsBy(rows, (row) => row.transaction_id);
        const groups = new Map();
        transactionGroups.forEach((entries, transactionId) => {
            const first = entries[0] || {};
            const breakdown = parseJsonLoosely(first.payment_breakdown);
            if (!Array.isArray(breakdown) || breakdown.length === 0) return;
            const metrics = {
                gross_sales: sumBy(entries, (row) => row.gross_sales),
                net_sales: sumBy(entries, (row) => row.net_sales),
                pos_profit_loss: sumBy(entries, (row) => row.pos_profit_loss)
            };
            const transactionTotal = Number(first.transaction_total_amount || 0);
            const allocationTotal = sumBy(breakdown, (entry) => entry?.amount);
            breakdown.filter((entry) => Number(entry?.amount || 0) > 0).forEach((entry) => {
                const paymentMethod = toDisplayPaymentGroup(entry.payment_type);
                const amount = round4(entry.amount);
                const shareBase = transactionTotal > 0 ? transactionTotal : allocationTotal;
                const share = shareBase > 0 ? amount / shareBase : 0;
                const current = groups.get(paymentMethod) || {
                    payment_method: paymentMethod,
                    transaction_ids: new Set(),
                    gross_sales: 0,
                    net_sales: 0,
                    pos_profit_loss: 0
                };
                current.transaction_ids.add(String(transactionId));
                current.gross_sales = round4(current.gross_sales + (metrics.gross_sales * share));
                current.net_sales = round4(current.net_sales + (metrics.net_sales * share));
                current.pos_profit_loss = round4(current.pos_profit_loss + (metrics.pos_profit_loss * share));
                groups.set(paymentMethod, current);
            });
        });
        const snapshotTransactionIds = new Set(rowsWithSnapshots.map((row) => String(row.transaction_id)));
        const legacyRows = rows.filter((row) => !snapshotTransactionIds.has(String(row.transaction_id)));
        const legacyBreakdown = legacyRows.length > 0 ? buildPaymentBreakdown(legacyRows) : [];
        return [
            ...Array.from(groups.values()).map((entry) => ({
                payment_method: entry.payment_method,
                total_transactions: entry.transaction_ids.size,
                gross_sales: round4(entry.gross_sales),
                net_sales: round4(entry.net_sales),
                pos_profit_loss: round4(entry.pos_profit_loss)
            })),
            ...legacyBreakdown
        ];
    }
    const groups = groupRowsBy(rows, (row) => toDisplayPaymentGroup(row.payment_type));
    return Array.from(groups.entries()).map(([label, entries]) => ({
        payment_method: label,
        total_transactions: uniqueCountBy(entries, (row) => row.transaction_id),
        gross_sales: sumBy(entries, (row) => row.gross_sales),
        net_sales: sumBy(entries, (row) => row.net_sales),
        pos_profit_loss: sumBy(entries, (row) => row.net_sales) - sumBy(entries, (row) => row.cogs)
    }));
};

const buildZReadingPaymentBreakdown = (rows = []) => {
    const entries = [];
    rows.forEach((row) => {
        const snapshot = parseJsonLoosely(row?.payment_breakdown);
        if (Array.isArray(snapshot) && snapshot.length > 0) {
            snapshot.forEach((entry) => {
                if (Number(entry?.amount || 0) > 0) entries.push({
                    payment_type: entry.payment_type,
                    count: 1,
                    amount: entry.amount
                });
            });
            return;
        }
        entries.push({
            payment_type: row?.payment_type,
            count: 1,
            amount: row?.total_amount
        });
    });
    return normalizePosPaymentBreakdown(entries);
};

const buildOrderMethodBreakdown = (rows = []) => {
    const groups = groupRowsBy(rows, (row) => String(row.order_method || 'dine_in').trim().toLowerCase() || 'dine_in');
    return Array.from(groups.entries()).map(([orderMethod, entries]) => ({
        order_method: orderMethod,
        total_transactions: uniqueCountBy(entries, (row) => row.transaction_id),
        gross_sales: sumBy(entries, (row) => row.gross_sales),
        net_sales: sumBy(entries, (row) => row.net_sales),
        pos_profit_loss: sumBy(entries, (row) => row.net_sales) - sumBy(entries, (row) => row.cogs)
    })).sort((left, right) => Number(right.net_sales || 0) - Number(left.net_sales || 0));
};

const buildCashierSummary = (rows = []) => {
    const groups = groupRowsBy(rows, (row) => String(row.cashier_id || row.accepted_by || 'unassigned'));
    return Array.from(groups.entries()).map(([cashierId, entries]) => ({
        cashier_id: cashierId === 'unassigned' ? null : Number(cashierId),
        cashier_name: entries[0]?.cashier_name || entries[0]?.accepted_by_name || 'Unassigned',
        shift_ids: Array.from(new Set(entries.map((entry) => entry.shift_id).filter(Boolean))),
        summary: serializeReportSummary(entries),
        shift_money: null
    })).sort((left, right) => Number(right.summary.net_sales || 0) - Number(left.summary.net_sales || 0));
};

const REPORT_CASH_EVENT_EFFECT = Object.freeze({
    cash_in: 1,
    opening_adjustment: 1,
    cash_out: -1,
    closing_adjustment: -1
});

const getCashPaymentAmount = (transaction = {}) => {
    const paymentBreakdown = parseJsonLoosely(transaction.payment_breakdown);
    if (Array.isArray(paymentBreakdown) && paymentBreakdown.length > 0) {
        return getPosCashPaymentAmount(paymentBreakdown);
    }

    return String(transaction.payment_type || '').trim().toLowerCase() === 'cash'
        ? round4(transaction.total_amount)
        : 0;
};

const summarizeReportCashEvents = (events = []) => {
    const summary = {
        cash_in_total: 0,
        cash_out_total: 0,
        opening_adjustment_total: 0,
        closing_adjustment_total: 0,
        net_events_total: 0
    };

    (Array.isArray(events) ? events : []).forEach((event) => {
        const eventType = String(event?.event_type || '').trim();
        const effect = REPORT_CASH_EVENT_EFFECT[eventType];
        if (!effect) return;

        const amount = round4(event?.amount);
        const summaryKey = `${eventType}_total`;
        summary[summaryKey] = round4((summary[summaryKey] || 0) + amount);
        summary.net_events_total = round4(summary.net_events_total + (amount * effect));
    });

    return summary;
};

const buildReportShiftMoney = ({ shift = {}, transactions = [] } = {}) => {
    const eventSummary = summarizeReportCashEvents(shift.cashEvents);
    const openingFloatAmount = round4(shift.opening_float_amount);
    const cashSalesAmount = round4((Array.isArray(transactions) ? transactions : []).reduce(
        (total, transaction) => total + getCashPaymentAmount(transaction),
        0
    ));
    const derivedExpectedCashAmount = round4(
        openingFloatAmount + eventSummary.net_events_total + cashSalesAmount
    );
    const expectedCashAmount = shift.expected_cash_amount == null
        ? derivedExpectedCashAmount
        : round4(shift.expected_cash_amount);
    const closingCashAmount = shift.closing_cash_amount == null
        ? null
        : round4(shift.closing_cash_amount);
    const cashVarianceAmount = shift.cash_variance_amount == null
        ? (closingCashAmount == null ? null : round4(closingCashAmount - expectedCashAmount))
        : round4(shift.cash_variance_amount);

    return {
        shift_count: 1,
        closed_shift_count: String(shift.status || '').trim().toLowerCase() === 'closed' ? 1 : 0,
        opening_float_amount: openingFloatAmount,
        cash_sales_amount: cashSalesAmount,
        cash_in_total: eventSummary.cash_in_total,
        cash_out_total: eventSummary.cash_out_total,
        opening_adjustment_total: eventSummary.opening_adjustment_total,
        closing_adjustment_total: eventSummary.closing_adjustment_total,
        net_events_total: eventSummary.net_events_total,
        expected_cash_amount: expectedCashAmount,
        closing_cash_amount: closingCashAmount,
        cash_variance_amount: cashVarianceAmount
    };
};

const mergeCashierShiftMoney = (cashierSummary = [], reconciliation = new Map()) => {
    const merged = new Map();

    (Array.isArray(cashierSummary) ? cashierSummary : []).forEach((entry) => {
        const key = String(entry.cashier_id || 'unassigned');
        merged.set(key, {
            ...entry,
            shift_money: reconciliation.get(key) || null
        });
    });

    reconciliation.forEach((shiftMoney, key) => {
        if (merged.has(key)) return;
        merged.set(key, {
            cashier_id: shiftMoney.cashier_id,
            cashier_name: shiftMoney.cashier_name || `Cashier #${shiftMoney.cashier_id}`,
            shift_ids: shiftMoney.shift_ids || [],
            summary: serializeReportSummary([]),
            shift_money: shiftMoney
        });
    });

    return Array.from(merged.values()).sort((left, right) => (
        Number(right.summary?.net_sales || 0) - Number(left.summary?.net_sales || 0)
    ));
};

const buildReportTransactionRows = (transactions = [], normalizedLines = []) => {
    const matchingTransactionIds = new Set(normalizedLines.map((row) => String(row.transaction_id)));
    const lineSummaryByTransaction = new Map();

    normalizedLines.forEach((row) => {
        const key = String(row.transaction_id);
        const current = lineSummaryByTransaction.get(key) || {
            gross_sales: 0,
            net_sales: 0,
            discount_amount: 0,
            refund_amount: 0
        };
        current.gross_sales = round4(current.gross_sales + Number(row.gross_sales || 0));
        current.net_sales = round4(current.net_sales + Number(row.net_sales || 0));
        current.discount_amount = round4(current.discount_amount + Number(row.discount_amount || 0));
        current.refund_amount = round4(current.refund_amount + Number(row.refund_amount || 0));
        lineSummaryByTransaction.set(key, current);
    });

    return (Array.isArray(transactions) ? transactions : [])
        .filter((transaction) => matchingTransactionIds.has(String(transaction?.pos_transaction_id)))
        .map((transaction) => {
            const summary = lineSummaryByTransaction.get(String(transaction.pos_transaction_id)) || {};
            return {
                pos_transaction_id: transaction.pos_transaction_id,
                invoice_number: transaction.invoice_number || null,
                created_at: transaction.created_at || null,
                status: transaction.status || null,
                cashier_id: transaction.cashier?.user_id || transaction.cashier_id || transaction.accepted_by || null,
                cashier_name: transaction.cashier?.username || transaction.acceptedByUser?.username || null,
                operator_session_id: transaction.operator_session_id || null,
                attribution_type: transaction.operator_session_id ? 'authenticated_operator' : 'legacy_cashier_snapshot',
                payment_type: transaction.payment_type || null,
                payment_status: transaction.payment_status || null,
                order_source: transaction.order_source || null,
                order_method: transaction.order_method || null,
                total_amount: round4(transaction.total_amount),
                gross_sales: round4(summary.gross_sales),
                net_sales: round4(summary.net_sales),
                discount_amount: round4(summary.discount_amount),
                refund_amount: round4(summary.refund_amount)
            };
        });
};

const reportMinutesBetween = (startedAt, endedAt, fallbackEnd = new Date()) => {
    const start = new Date(startedAt);
    const end = endedAt ? new Date(endedAt) : fallbackEnd;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
};

const reportPage = (rows = [], filters = {}) => {
    const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(filters.limit, 10) || 50));
    const offset = (page - 1) * limit;
    return {
        rows: rows.slice(offset, offset + limit),
        pagination: {
            page,
            limit,
            total: rows.length,
            total_pages: Math.max(1, Math.ceil(rows.length / limit))
        }
    };
};

const loadCashierLifecycleReport = async ({ filters = {}, options = {}, registerReconciliation = new Map() } = {}) => {
    const Attendance = dbStore.get('EmployeeAttendanceSession');
    const Break = dbStore.get('EmployeeBreakSegment');
    const Operator = dbStore.get('PosTerminalOperatorSession');
    const Handoff = dbStore.get('PosDrawerHandoffEvent');
    const User = dbStore.get('User');
    if (!Attendance || !Break || !Operator || !Handoff || !User) {
        const empty = reportPage([], filters);
        return {
            attendance: empty,
            operators: empty,
            handoffs: empty,
            registers: [],
            reconciliation: { cashier_net_sales: 0, register_net_sales: 0, difference: 0 }
        };
    }

    const range = resolveReportDateRange(filters);
    const overlapWhere = {
        started_at: { [Op.lt]: range.endAtExclusive },
        [Op.or]: [
            { ended_at: null },
            { ended_at: { [Op.gte]: range.startAt } }
        ]
    };
    const attendanceWhere = { ...overlapWhere };
    const operatorWhere = { ...overlapWhere };
    const handoffWhere = { event_at: { [Op.gte]: range.startAt, [Op.lt]: range.endAtExclusive } };
    const cashierId = toPositiveInt(filters.cashier_id);
    const locationId = toPositiveInt(filters.location_id);
    const terminalId = String(filters.terminal_id || '').trim();
    if (cashierId) {
        attendanceWhere.user_id = cashierId;
        operatorWhere.user_id = cashierId;
        handoffWhere[Op.or] = [
            { outgoing_operator_user_id: cashierId },
            { incoming_operator_user_id: cashierId }
        ];
    }
    if (locationId) {
        attendanceWhere.location_id = locationId;
        operatorWhere.location_id = locationId;
        handoffWhere.location_id = locationId;
    }
    if (terminalId) {
        operatorWhere.terminal_id = terminalId;
        handoffWhere.terminal_id = terminalId;
    }

    const transaction = options.transaction;
    const [attendanceRecords, operatorRecords, handoffRecords] = await Promise.all([
        Attendance.findAll({
            where: attendanceWhere,
            include: [
                { model: User, as: 'user', attributes: ['user_id', 'username'], required: false },
                { model: Break, as: 'breakSegments', required: false, separate: true, order: [['started_at', 'ASC']] }
            ],
            order: [['started_at', 'DESC'], ['employee_attendance_session_id', 'DESC']],
            transaction
        }),
        Operator.findAll({
            where: operatorWhere,
            include: [{ model: User, as: 'operator', attributes: ['user_id', 'username'], required: false }],
            order: [['started_at', 'DESC'], ['pos_terminal_operator_session_id', 'DESC']],
            transaction
        }),
        Handoff.findAll({
            where: handoffWhere,
            include: [
                { model: User, as: 'outgoingOperator', attributes: ['user_id', 'username'], required: false },
                { model: User, as: 'incomingOperator', attributes: ['user_id', 'username'], required: false }
            ],
            order: [['event_at', 'DESC'], ['pos_drawer_handoff_event_id', 'DESC']],
            transaction
        })
    ]);

    const now = new Date();
    const attendanceRows = attendanceRecords.map(toPlain).map((session) => {
        const breakRows = (session.breakSegments || []).map(toPlain);
        const breakMinutes = breakRows.reduce((total, segment) => (
            total + reportMinutesBetween(segment.started_at, segment.ended_at, now)
        ), 0);
        const elapsedMinutes = reportMinutesBetween(session.started_at, session.ended_at, now);
        return {
            attendance_session_id: session.employee_attendance_session_id,
            user_id: session.user_id,
            cashier_name: session.user?.username || `Cashier #${session.user_id}`,
            location_id: session.location_id,
            duty_type: session.duty_type,
            status: session.status,
            started_at: session.started_at,
            ended_at: session.ended_at,
            elapsed_minutes: elapsedMinutes,
            break_minutes: breakMinutes,
            worked_minutes: Math.max(0, elapsedMinutes - breakMinutes),
            breaks: breakRows.map((segment) => ({
                break_segment_id: segment.employee_break_segment_id,
                status: segment.status,
                started_at: segment.started_at,
                ended_at: segment.ended_at,
                minutes: reportMinutesBetween(segment.started_at, segment.ended_at, now)
            }))
        };
    });
    const operatorRows = operatorRecords.map(toPlain).map((session) => ({
        operator_session_id: session.pos_terminal_operator_session_id,
        shift_id: session.pos_terminal_shift_id,
        terminal_id: session.terminal_id,
        location_id: session.location_id,
        user_id: session.user_id,
        cashier_name: session.operator?.username || `Cashier #${session.user_id}`,
        attendance_session_id: session.employee_attendance_session_id,
        status: session.status,
        started_at: session.started_at,
        ended_at: session.ended_at,
        ended_reason: session.ended_reason,
        minutes: reportMinutesBetween(session.started_at, session.ended_at, now)
    }));
    const handoffRows = handoffRecords.map(toPlain).map((event) => ({
        handoff_event_id: event.pos_drawer_handoff_event_id,
        shift_id: event.pos_terminal_shift_id,
        terminal_id: event.terminal_id,
        location_id: event.location_id,
        event_type: event.event_type,
        custody_mode: event.custody_mode,
        outgoing_operator_user_id: event.outgoing_operator_user_id,
        outgoing_operator_name: event.outgoingOperator?.username || null,
        incoming_operator_user_id: event.incoming_operator_user_id,
        incoming_operator_name: event.incomingOperator?.username || null,
        expected_cash_amount: event.expected_cash_amount == null ? null : round4(event.expected_cash_amount),
        counted_cash_amount: event.counted_cash_amount == null ? null : round4(event.counted_cash_amount),
        variance_amount: event.variance_amount == null ? null : round4(event.variance_amount),
        event_at: event.event_at,
        note: event.note || null,
        variance_attribution: event.custody_mode === 'shared_access' ? 'shared_drawer_no_individual_variance' : 'counted_transfer'
    }));
    const registerRows = Array.from(registerReconciliation.values()).map((entry) => ({
        opening_cashier_id: entry.cashier_id,
        opening_cashier_name: entry.cashier_name,
        shift_ids: entry.shift_ids,
        shift_count: entry.shift_count,
        closed_shift_count: entry.closed_shift_count,
        opening_float_amount: entry.opening_float_amount,
        cash_sales_amount: entry.cash_sales_amount,
        cash_in_total: entry.cash_in_total,
        cash_out_total: entry.cash_out_total,
        expected_cash_amount: entry.expected_cash_amount,
        closing_cash_amount: entry.closing_cash_amount,
        variance_amount: entry.cash_variance_amount,
        attribution_notice: 'Register totals belong to the drawer lifecycle, not an individual relief cashier.'
    }));

    return {
        attendance: reportPage(attendanceRows, filters),
        operators: reportPage(operatorRows, filters),
        handoffs: reportPage(handoffRows, filters),
        registers: registerRows
    };
};

const loadReportCashierReconciliation = async ({ transactions = [], filters = {}, options = {} } = {}) => {
    const PosTerminalShift = dbStore.get('PosTerminalShift');
    const PosCashDrawerEvent = dbStore.get('PosCashDrawerEvent');
    if (!PosTerminalShift || typeof PosTerminalShift.findAll !== 'function' || !PosCashDrawerEvent) {
        return new Map();
    }

    const where = {};
    const dateFrom = normalizeBusinessDateValue(filters.date_from);
    const dateTo = normalizeBusinessDateValue(filters.date_to);
    if (dateFrom || dateTo) {
        where.business_date = {};
        if (dateFrom) where.business_date[Op.gte] = dateFrom;
        if (dateTo) where.business_date[Op.lte] = dateTo;
    }

    const cashierId = toPositiveInt(filters.cashier_id);
    if (cashierId) where.cashier_id = cashierId;

    const locationId = toPositiveInt(filters.location_id);
    if (locationId) where.location_id = locationId;

    const terminalId = String(filters.terminal_id || '').trim();
    if (terminalId) where.terminal_id = terminalId;

    const shifts = await PosTerminalShift.findAll({
        where,
        include: [
            {
                model: dbStore.get('User'),
                as: 'cashier',
                attributes: ['user_id', 'username'],
                required: false
            },
            {
                model: PosCashDrawerEvent,
                as: 'cashEvents',
                attributes: ['pos_cash_drawer_event_id', 'event_type', 'amount'],
                required: false,
                separate: true,
                order: [['created_at', 'ASC']]
            }
        ],
        order: [['business_date', 'ASC'], ['opened_at', 'ASC'], ['pos_terminal_shift_id', 'ASC']],
        transaction: options.transaction
    });

    const transactionsByShift = new Map();
    (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
        const shiftId = toPositiveInt(transaction?.shift?.pos_terminal_shift_id || transaction?.shift_id);
        if (!shiftId) return;
        const rows = transactionsByShift.get(shiftId) || [];
        rows.push(transaction);
        transactionsByShift.set(shiftId, rows);
    });

    const grouped = new Map();
    (Array.isArray(shifts) ? shifts : []).forEach((row) => {
        const shift = toPlain(row);
        const shiftId = toPositiveInt(shift.pos_terminal_shift_id);
        const cashierIdValue = toPositiveInt(shift.cashier_id || shift.cashier?.user_id);
        if (!shiftId || !cashierIdValue) return;

        const shiftMoney = buildReportShiftMoney({
            shift,
            transactions: transactionsByShift.get(shiftId) || []
        });
        const key = String(cashierIdValue);
        const current = grouped.get(key) || {
            cashier_id: cashierIdValue,
            cashier_name: shift.cashier?.username || `Cashier #${cashierIdValue}`,
            shift_ids: [],
            shift_count: 0,
            closed_shift_count: 0,
            opening_float_amount: 0,
            cash_sales_amount: 0,
            cash_in_total: 0,
            cash_out_total: 0,
            opening_adjustment_total: 0,
            closing_adjustment_total: 0,
            net_events_total: 0,
            expected_cash_amount: 0,
            closing_cash_amount: 0,
            cash_variance_amount: 0,
            has_closing_cash: false,
            has_cash_variance: false
        };

        current.shift_ids.push(shiftId);
        current.shift_count += shiftMoney.shift_count;
        current.closed_shift_count += shiftMoney.closed_shift_count;
        current.opening_float_amount = round4(current.opening_float_amount + shiftMoney.opening_float_amount);
        current.cash_sales_amount = round4(current.cash_sales_amount + shiftMoney.cash_sales_amount);
        current.cash_in_total = round4(current.cash_in_total + shiftMoney.cash_in_total);
        current.cash_out_total = round4(current.cash_out_total + shiftMoney.cash_out_total);
        current.opening_adjustment_total = round4(current.opening_adjustment_total + shiftMoney.opening_adjustment_total);
        current.closing_adjustment_total = round4(current.closing_adjustment_total + shiftMoney.closing_adjustment_total);
        current.net_events_total = round4(current.net_events_total + shiftMoney.net_events_total);
        current.expected_cash_amount = round4(current.expected_cash_amount + shiftMoney.expected_cash_amount);
        if (shiftMoney.closing_cash_amount != null) {
            current.has_closing_cash = true;
            current.closing_cash_amount = round4(current.closing_cash_amount + shiftMoney.closing_cash_amount);
        }
        if (shiftMoney.cash_variance_amount != null) {
            current.has_cash_variance = true;
            current.cash_variance_amount = round4(current.cash_variance_amount + shiftMoney.cash_variance_amount);
        }
        grouped.set(key, current);
    });

    return new Map(Array.from(grouped.entries()).map(([key, value]) => [key, {
        cashier_id: value.cashier_id,
        cashier_name: value.cashier_name,
        shift_ids: value.shift_ids,
        shift_count: value.shift_count,
        closed_shift_count: value.closed_shift_count,
        opening_float_amount: value.opening_float_amount,
        cash_sales_amount: value.cash_sales_amount,
        cash_in_total: value.cash_in_total,
        cash_out_total: value.cash_out_total,
        opening_adjustment_total: value.opening_adjustment_total,
        closing_adjustment_total: value.closing_adjustment_total,
        net_events_total: value.net_events_total,
        expected_cash_amount: value.expected_cash_amount,
        closing_cash_amount: value.has_closing_cash ? value.closing_cash_amount : null,
        cash_variance_amount: value.has_cash_variance ? value.cash_variance_amount : null
    }]));
};

const buildShiftSummary = (rows = []) => {
    const groups = groupRowsBy(rows, (row) => String(row.shift_id || 'no_shift'));
    return Array.from(groups.entries()).map(([shiftKey, entries]) => ({
        shift_id: shiftKey === 'no_shift' ? null : Number(shiftKey),
        terminal_id: entries[0]?.terminal_id || null,
        business_date: entries[0]?.shift_business_date || null,
        summary: serializeReportSummary(entries)
    })).sort((left, right) => Number(right.summary.net_sales || 0) - Number(left.summary.net_sales || 0));
};

const buildTopItems = (rows = [], limit = 10) => {
    const groups = groupRowsBy(rows, (row) => String(row.item_id || ''));
    return Array.from(groups.entries())
        .map(([itemId, entries]) => ({
            item_id: Number(itemId),
            item_name: entries[0]?.item_name || `Item #${itemId}`,
            sku_code: entries[0]?.sku_code || null,
            category: entries[0]?.category || null,
            quantity: sumBy(entries, (row) => row.quantity),
            gross_sales: sumBy(entries, (row) => row.gross_sales),
            net_sales: sumBy(entries, (row) => row.net_sales),
            cogs: sumBy(entries, (row) => row.cogs),
            pos_profit_loss: round4(sumBy(entries, (row) => row.net_sales) - sumBy(entries, (row) => row.cogs))
        }))
        .sort((left, right) => Number(right.net_sales || 0) - Number(left.net_sales || 0))
        .slice(0, limit);
};

const buildDiscountBreakdown = (rows = []) => {
    const groups = groupRowsBy(
        rows.filter((row) => Number(row.discount_amount || 0) > 0),
        (row) => `${row.discount_type || 'legacy'}::${row.promo_code || row.discount_label || 'Discount'}`
    );
    return Array.from(groups.values()).map((entries) => ({
        discount_label: entries[0]?.promo_code
            ? `${entries[0]?.discount_label || 'Promo'} (${entries[0].promo_code})`
            : (entries[0]?.discount_label || 'Discount'),
        discount_type: entries[0]?.discount_type || 'legacy',
        promo_code: entries[0]?.promo_code || null,
        transaction_count: new Set(entries.map((entry) => entry.transaction_id)).size,
        discount_amount: sumBy(entries, (entry) => entry.discount_amount),
        vat_removed: sumBy(entries, (entry) => entry.vat_removed)
    })).sort((left, right) => Number(right.discount_amount || 0) - Number(left.discount_amount || 0));
};

const buildFilterOptions = (transactions = [], lineRows = [], categoryOptions = []) => {
    const cashierMap = new Map();
    transactions.forEach((transaction) => {
        const userId = toPositiveInt(transaction?.cashier?.user_id || transaction?.cashier_id);
        if (!userId) return;
        cashierMap.set(userId, {
            cashier_id: userId,
            cashier_name: transaction?.cashier?.username || `Cashier #${userId}`
        });
    });
    const categories = Array.isArray(categoryOptions) && categoryOptions.length > 0
        ? categoryOptions
        : Array.from(new Set(lineRows.map((row) => String(row.category || '').trim()).filter(Boolean))).sort().map((name) => ({
            folder_id: null,
            name,
            legacy: true
        }));
    return {
        cashiers: Array.from(cashierMap.values()).sort((left, right) => left.cashier_name.localeCompare(right.cashier_name)),
        categories,
        payment_methods: ['cash', 'gcash', 'maya', 'card', 'bank_transfer'],
        sources: Object.entries(REPORT_SOURCE_LABELS).map(([value, label]) => ({ value, label }))
    };
};

// POS item forms assign the customer-facing Food Category through item folders.
// Keep the legacy item.category value only for older records without a folder.
const resolveReportItemCategory = (item = {}) => (
    String(item?.folder?.name || item?.product_folder || item?.category || '').trim()
);

const normalizeReportLineRows = (transactions = [], filters = {}) => {
    const normalizedCategory = String(filters.category || '').trim().toLowerCase();
    const normalizedFolderId = toPositiveInt(filters.category_id);
    const rows = [];

    (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
        const isVoidedOrRefunded = transaction?.status === 'voided' || REFUND_PAYMENT_STATUSES.has(String(transaction?.payment_status || '').trim().toLowerCase());
        const subtotalAmount = Number(transaction?.subtotal_amount || 0);
        const totalServiceFeeAmount = Number(transaction?.service_fee_amount || 0) + Number(transaction?.restaurant_service_charge_amount || 0);
        const vatAmount = Number(transaction?.vat_amount || 0);
        const discountAmount = Number(transaction?.discount_amount || 0);
        const discountAllocations = Array.isArray(transaction?.discount?.lines) ? transaction.discount.lines : [];
        const discountAllocationByLineId = new Map(discountAllocations.map((allocation) => [Number(allocation.transaction_line_id), allocation]));
        const sourceLabel = resolveReportSourceLabel(transaction);

        (Array.isArray(transaction?.lines) ? transaction.lines : []).forEach((line) => {
            const item = line?.item || {};
            const reportCategory = resolveReportItemCategory(item);
            const category = reportCategory.toLowerCase();
            if (normalizedFolderId && Number(item?.folder_id) !== normalizedFolderId) {
                return;
            }
            if (normalizedCategory && category !== normalizedCategory) {
                return;
            }

            const quantity = Number(line?.quantity || 0);
            const grossSales = round4(line?.line_subtotal || 0);
            const share = subtotalAmount > 0 ? grossSales / subtotalAmount : 0;
            const persistedDiscountAllocation = discountAllocationByLineId.get(Number(line?.line_id));
            const recordedLineDiscount = persistedDiscountAllocation
                ? round4(persistedDiscountAllocation.discount_amount)
                : round4(discountAmount * share);
            // Preserve the recorded discount on the transaction for audit, but do not
            // count it as an active discount after the sale is voided or refunded.
            const lineDiscount = isVoidedOrRefunded ? 0 : recordedLineDiscount;
            const lineRefund = isVoidedOrRefunded ? grossSales : 0;
            const lineNetSales = round4(Math.max(0, grossSales - lineDiscount - lineRefund));
            const lineCostPerUnit = line?.cost_snapshot != null ? Number(line.cost_snapshot || 0) : Number(item?.cost_per_unit || 0);
            const cogs = round4(quantity * lineCostPerUnit);

            rows.push({
                transaction_id: transaction?.pos_transaction_id,
                created_at: transaction?.created_at,
                cashier_id: transaction?.cashier?.user_id || transaction?.cashier_id || null,
                cashier_name: transaction?.cashier?.username || null,
                accepted_by: transaction?.accepted_by || null,
                accepted_by_name: transaction?.acceptedByUser?.username || null,
                shift_id: transaction?.shift_id || transaction?.shift?.pos_terminal_shift_id || null,
                shift_business_date: transaction?.shift?.business_date || null,
                terminal_id: transaction?.terminal_id || transaction?.shift?.terminal_id || null,
                location_id: transaction?.location_id || transaction?.shift?.location_id || null,
                payment_type: transaction?.payment_type || 'cash',
                payment_breakdown: transaction?.payment_breakdown || null,
                transaction_total_amount: transaction?.total_amount || 0,
                source_label: sourceLabel,
                order_source: transaction?.order_source || 'in_store',
                order_method: transaction?.order_method || 'dine_in',
                item_id: line?.item_id,
                // Prefer the sale-time snapshot so a later item rename/delete
                // never retro-changes a historical report row. Category still
                // reads live: recategorization is meant to reclassify history.
                item_name: line?.item_name_snapshot || item?.name || `Item #${line?.item_id}`,
                sku_code: line?.sku_snapshot || item?.sku_code || null,
                category: reportCategory || null,
                quantity,
                gross_sales: grossSales,
                net_sales: lineNetSales,
                discount_amount: lineDiscount,
                discount_label: transaction?.discount_label_snapshot || null,
                discount_type: transaction?.discount?.discount_type || null,
                promo_code: transaction?.discount?.promo_code || null,
                vat_removed: isVoidedOrRefunded
                    ? 0
                    : persistedDiscountAllocation
                        ? round4(persistedDiscountAllocation.vat_removed)
                        : round4(Number(transaction?.discount?.vat_removed || 0) * share),
                refund_amount: lineRefund,
                vat_amount: isVoidedOrRefunded ? 0 : round4(vatAmount * share),
                service_fee_amount: isVoidedOrRefunded ? 0 : round4(totalServiceFeeAmount * share),
                cogs,
                pos_profit_loss: round4(lineNetSales - cogs)
            });
        });
    });

    return rows;
};

const resolveAdjustmentEventAt = (adjustment = {}) => (
    adjustment?.completed_at
    || adjustment?.failed_at
    || adjustment?.cancelled_at
    || adjustment?.created_at
    || null
);

const normalizeReportAdjustmentRows = (adjustments = []) => (
    (Array.isArray(adjustments) ? adjustments : [])
        .filter((adjustment) => REPORT_ADJUSTMENT_TYPES.has(String(adjustment?.adjustment_type || '').trim().toLowerCase()))
        .map((adjustment) => {
            const metadata = adjustment?.metadata && typeof adjustment.metadata === 'object'
                ? adjustment.metadata
                : {};
            return {
                pos_transaction_adjustment_id: toPositiveInt(adjustment?.pos_transaction_adjustment_id),
                adjustment_reference: adjustment?.adjustment_reference || null,
                pos_transaction_id: toPositiveInt(adjustment?.pos_transaction_id),
                invoice_number: adjustment?.transaction?.invoice_number || null,
                event_at: resolveAdjustmentEventAt(adjustment),
                adjustment_type: adjustment?.adjustment_type || null,
                tender_type: adjustment?.tender_type || null,
                amount: round4(adjustment?.amount),
                currency: adjustment?.currency || 'PHP',
                status: adjustment?.status || null,
                reason: adjustment?.reason || null,
                original_cashier_id: toPositiveInt(adjustment?.original_cashier_id),
                original_cashier_name: adjustment?.originalCashier?.username || null,
                original_shift_id: toPositiveInt(adjustment?.original_shift_id),
                original_terminal_id: adjustment?.original_terminal_id || null,
                original_location_id: toPositiveInt(adjustment?.original_location_id),
                actor_user_id: toPositiveInt(adjustment?.actor_user_id),
                actor_name: adjustment?.actorUser?.username || null,
                actor_shift_id: toPositiveInt(adjustment?.actor_shift_id),
                actor_terminal_id: adjustment?.actor_terminal_id || null,
                actor_location_id: toPositiveInt(adjustment?.actor_location_id),
                external_reference: adjustment?.external_reference || null,
                provider: adjustment?.provider || null,
                provider_reference: adjustment?.provider_reference || null,
                cash_drawer_event_id: toPositiveInt(adjustment?.cash_drawer_event_id),
                failure_code: adjustment?.failure_code || null,
                failure_reason: adjustment?.failure_reason || null,
                financial_outcome: metadata.financial_outcome || null
            };
        })
        .sort((left, right) => {
            const eventDelta = new Date(left.event_at || 0).getTime() - new Date(right.event_at || 0).getTime();
            return eventDelta || Number(left.pos_transaction_adjustment_id || 0) - Number(right.pos_transaction_adjustment_id || 0);
        })
);

const summarizeReportAdjustments = (rows = []) => {
    const summary = {
        adjustment_count: rows.length,
        succeeded_count: 0,
        pending_count: 0,
        manual_review_count: 0,
        failed_count: 0,
        succeeded_amount: 0,
        pending_amount: 0,
        manual_review_amount: 0,
        failed_amount: 0,
        net_sales_impact: 0,
        mutates_prior_z_reading: false
    };
    rows.forEach((row) => {
        const amount = round4(row?.amount);
        const status = String(row?.status || '').trim().toLowerCase();
        if (status === 'succeeded') {
            summary.succeeded_count += 1;
            summary.succeeded_amount = round4(summary.succeeded_amount + amount);
        } else if (status === 'pending') {
            summary.pending_count += 1;
            summary.pending_amount = round4(summary.pending_amount + amount);
        } else if (status === 'manual_review_required') {
            summary.manual_review_count += 1;
            summary.manual_review_amount = round4(summary.manual_review_amount + amount);
        } else if (status === 'failed') {
            summary.failed_count += 1;
            summary.failed_amount = round4(summary.failed_amount + amount);
        }
    });
    return summary;
};

const buildReportPayloadFromTransactions = (
    transactions = [],
    filters = {},
    categoryOptions = [],
    cashierReconciliation = new Map(),
    adjustments = [],
    cashierLifecycle = null
) => {
    const normalizedLines = normalizeReportLineRows(transactions, filters);
    const adjustmentRows = normalizeReportAdjustmentRows(adjustments);
    const adjustmentSummary = summarizeReportAdjustments(adjustmentRows);
    const summary = serializeReportSummary(normalizedLines);
    const dailySeries = buildTimeSeries(normalizedLines, 'daily');
    const monthlySeries = buildTimeSeries(normalizedLines, 'monthly');
    const yearlySeries = buildTimeSeries(normalizedLines, 'yearly');
    const weeklySeries = buildTimeSeries(normalizedLines, 'weekly');
    const topItems = buildTopItems(normalizedLines, 10);
    const monthlyTopItems = buildTopItems(normalizedLines, 10);
    const yearlyTopItems = buildTopItems(normalizedLines, 12);

    const currentYear = yearlySeries[yearlySeries.length - 1]?.period || getManilaDateParts(new Date()).year;
    const currentYearMonthlyBreakdown = monthlySeries.filter((entry) => entry.period.startsWith(currentYear));
    const previousYear = String(Number(currentYear) - 1);
    const currentYearSummary = serializeReportSummary(normalizedLines.filter((row) => toYearKey(row.created_at) === currentYear));
    const previousYearSummary = serializeReportSummary(normalizedLines.filter((row) => toYearKey(row.created_at) === previousYear));

    const flexibleComparisonRange = buildComparisonRange(resolveReportDateRange(filters));
    const flexibleCurrent = serializeReportSummary(
        normalizedLines.filter((row) => {
            const key = toManilaDateKey(row.created_at);
            return key >= flexibleComparisonRange.current.dateFrom && key <= flexibleComparisonRange.current.dateTo;
        })
    );
    const flexiblePrevious = serializeReportSummary(
        normalizedLines.filter((row) => {
            const key = toManilaDateKey(row.created_at);
            return key >= flexibleComparisonRange.previous.dateFrom && key <= flexibleComparisonRange.previous.dateTo;
        })
    );

    const comparisons = buildFixedComparisonPeriods(resolveReportDateRange(filters)).map((period) => {
        const current = serializeReportSummary(normalizedLines.filter((row) => {
            const key = toManilaDateKey(row.created_at);
            return key >= period.current.dateFrom && key <= period.current.dateTo;
        }));
        const previous = serializeReportSummary(normalizedLines.filter((row) => {
            const key = toManilaDateKey(row.created_at);
            return key >= period.previous.dateFrom && key <= period.previous.dateTo;
        }));
        return {
            key: period.key,
            label: period.label,
            ...buildPeriodComparisonMetrics(current, previous)
        };
    });

    const cashierSummary = mergeCashierShiftMoney(
        buildCashierSummary(normalizedLines),
        cashierReconciliation
    );

    return {
        applied_filters: {
            ...resolveReportDateRange(filters),
            cashier_id: toPositiveInt(filters.cashier_id),
            location_id: toPositiveInt(filters.location_id),
            terminal_id: String(filters.terminal_id || '').trim() || null,
            payment_type: String(filters.payment_type || '').trim() || null,
            source: String(filters.source || '').trim() || null,
            category_id: toPositiveInt(filters.category_id),
            category: String(filters.category || '').trim() || null
        },
        filter_options: buildFilterOptions(transactions, normalizedLines, categoryOptions),
        summary_cards: {
            total_sales: summary.net_sales,
            total_transactions: summary.total_transactions,
            gross_sales: summary.gross_sales,
            net_sales: summary.net_sales,
            pos_profit_loss: summary.pos_profit_loss
        },
        daily_report: {
            summary,
            adjustment_summary: adjustmentSummary,
            adjustment_rows: adjustmentRows,
            discount_breakdown: buildDiscountBreakdown(normalizedLines),
            payment_breakdown: buildPaymentBreakdown(normalizedLines),
            order_method_breakdown: buildOrderMethodBreakdown(normalizedLines),
            cashier_summary: cashierSummary,
            cash_reconciliation: Array.from(cashierReconciliation.values()),
            shift_summary: buildShiftSummary(normalizedLines),
            transaction_rows: buildReportTransactionRows(transactions, normalizedLines),
            top_items: topItems,
            trend: dailySeries
        },
        cashier_lifecycle: cashierLifecycle,
        monthly_report: {
            summary,
            sales_trend: monthlySeries,
            top_items: monthlyTopItems
        },
        yearly_report: {
            summary,
            yearly_series: yearlySeries,
            monthly_breakdown: currentYearMonthlyBreakdown,
            year_over_year: {
                current_year: currentYear,
                previous_year: previousYear,
                current: currentYearSummary,
                previous: previousYearSummary,
                sales_delta: round4(currentYearSummary.net_sales - previousYearSummary.net_sales),
                profit_delta: round4(currentYearSummary.pos_profit_loss - previousYearSummary.pos_profit_loss)
            },
            top_items: yearlyTopItems
        },
        sales_comparison: {
            flexible_range: buildPeriodComparisonMetrics(flexibleCurrent, flexiblePrevious),
            fixed_periods: comparisons,
            weekly_trend: weeklySeries,
            monthly_trend: monthlySeries
        },
        profit_loss: {
            ...summary,
            label: 'POS Profit/Loss'
        }
    };
};

const buildReportExportRows = (section = 'daily', payload = {}) => {
    const normalizedSection = String(section || 'daily').trim().toLowerCase();
    const rows = [];
    const pushSummaryRows = (summary = {}) => {
        rows.push(['Metric', 'Value']);
        rows.push(['Gross Sales', round4(summary.gross_sales || 0)]);
        rows.push(['Net Sales', round4(summary.net_sales || 0)]);
        rows.push(['COGS', round4(summary.cogs || 0)]);
        rows.push(['POS Profit/Loss', round4(summary.pos_profit_loss || 0)]);
        rows.push(['Profit Margin %', round4(summary.profit_margin || 0)]);
        rows.push(['Transactions', Number.parseInt(summary.total_transactions || 0, 10) || 0]);
        rows.push(['Discounts', round4(summary.discounts || 0)]);
        rows.push(['Refunds/Voids', round4(summary.refunds_voids || 0)]);
        rows.push(['VAT', round4(summary.vat || 0)]);
        rows.push(['Service Fees', round4(summary.service_fees || 0)]);
    };

    if (normalizedSection === 'monthly') {
        rows.push(['Monthly Report']);
        rows.push([]);
        pushSummaryRows(payload?.monthly_report?.summary || {});
        rows.push([]);
        rows.push(['Period', 'Gross Sales', 'Net Sales', 'COGS', 'POS Profit/Loss']);
        (payload?.monthly_report?.sales_trend || []).forEach((entry) => {
            rows.push([entry.period, round4(entry.gross_sales), round4(entry.net_sales), round4(entry.cogs), round4(entry.pos_profit_loss)]);
        });
        return rows;
    }

    if (normalizedSection === 'yearly') {
        rows.push(['Yearly Report']);
        rows.push([]);
        pushSummaryRows(payload?.yearly_report?.summary || {});
        rows.push([]);
        rows.push(['Period', 'Gross Sales', 'Net Sales', 'COGS', 'POS Profit/Loss']);
        (payload?.yearly_report?.monthly_breakdown || []).forEach((entry) => {
            rows.push([entry.period, round4(entry.gross_sales), round4(entry.net_sales), round4(entry.cogs), round4(entry.pos_profit_loss)]);
        });
        return rows;
    }

    if (normalizedSection === 'comparison') {
        rows.push(['Sales Comparison']);
        rows.push([]);
        rows.push(['Comparison', 'Current Net Sales', 'Previous Net Sales', 'Sales Delta %', 'Current POS Profit/Loss', 'Previous POS Profit/Loss', 'Profit Delta %']);
        (payload?.sales_comparison?.fixed_periods || []).forEach((entry) => {
            rows.push([
                entry.label,
                round4(entry.current?.net_sales),
                round4(entry.previous?.net_sales),
                round4(entry.sales_delta_percentage),
                round4(entry.current?.pos_profit_loss),
                round4(entry.previous?.pos_profit_loss),
                round4(entry.profit_delta_percentage)
            ]);
        });
        return rows;
    }

    if (normalizedSection === 'profit_loss') {
        rows.push(['POS Profit/Loss']);
        rows.push([]);
        pushSummaryRows(payload?.profit_loss || {});
        return rows;
    }

    rows.push(['Daily Report']);
    rows.push([]);
    pushSummaryRows(payload?.daily_report?.summary || {});
    rows.push([]);
    rows.push(['Payment Method', 'Transactions', 'Net Sales', 'POS Profit/Loss']);
    (payload?.daily_report?.payment_breakdown || []).forEach((entry) => {
        rows.push([entry.payment_method, entry.total_transactions, round4(entry.net_sales), round4(entry.pos_profit_loss)]);
    });
    rows.push([]);
    rows.push(['Discount', 'Type', 'Promo Code', 'Transactions', 'Discount Total', 'VAT Removed']);
    (payload?.daily_report?.discount_breakdown || []).forEach((entry) => {
        rows.push([
            entry.discount_label,
            entry.discount_type,
            entry.promo_code || '',
            entry.transaction_count,
            round4(entry.discount_amount),
            round4(entry.vat_removed)
        ]);
    });
    rows.push([]);
    rows.push(['Top Item', 'SKU', 'Category', 'Qty', 'Net Sales', 'COGS', 'POS Profit/Loss']);
    (payload?.daily_report?.top_items || []).forEach((entry) => {
        rows.push([
            entry.item_name,
            entry.sku_code || '',
            entry.category || '',
            round4(entry.quantity),
            round4(entry.net_sales),
            round4(entry.cogs),
            round4(entry.pos_profit_loss)
        ]);
    });
    rows.push([]);
    rows.push(['Cashier', 'Shift Count', 'Closed Shifts', 'Opening Float', 'Cash Sales', 'Cash In', 'Cash Out', 'Expected Cash', 'Closing Cash', 'Variance']);
    (payload?.daily_report?.cashier_summary || []).forEach((entry) => {
        const cash = entry?.shift_money || {};
        rows.push([
            entry.cashier_name,
            cash.shift_count || 0,
            cash.closed_shift_count || 0,
            round4(cash.opening_float_amount),
            round4(cash.cash_sales_amount),
            round4(cash.cash_in_total),
            round4(cash.cash_out_total),
            round4(cash.expected_cash_amount),
            cash.closing_cash_amount == null ? '' : round4(cash.closing_cash_amount),
            cash.cash_variance_amount == null ? '' : round4(cash.cash_variance_amount)
        ]);
    });
    rows.push([]);
    rows.push(['Invoice', 'Datetime', 'Cashier', 'Payment', 'Status', 'Total', 'Reported Net Sales']);
    (payload?.daily_report?.transaction_rows || []).forEach((entry) => {
        rows.push([
            entry.invoice_number || entry.pos_transaction_id,
            entry.created_at || '',
            entry.cashier_name || '',
            entry.payment_type || '',
            entry.status || '',
            round4(entry.total_amount),
            round4(entry.net_sales)
        ]);
    });
    rows.push([]);
    rows.push(['Refund/Adjustment Events']);
    rows.push(['Reference', 'Event Datetime', 'Invoice', 'Type', 'Tender', 'Status', 'Amount', 'Original Cashier', 'Original Shift', 'Actioned By', 'Actor Shift', 'Reason']);
    (payload?.daily_report?.adjustment_rows || []).forEach((entry) => {
        rows.push([
            entry.adjustment_reference || entry.pos_transaction_adjustment_id,
            entry.event_at || '',
            entry.invoice_number || entry.pos_transaction_id,
            entry.adjustment_type || '',
            entry.tender_type || '',
            entry.status || '',
            round4(entry.amount),
            entry.original_cashier_name || entry.original_cashier_id || '',
            entry.original_shift_id || '',
            entry.actor_name || entry.actor_user_id || '',
            entry.actor_shift_id || '',
            entry.reason || ''
        ]);
    });
    return rows;
};

export const posRepository = {
    async findActiveDiscountRuleByType(type, options = {}) {
        const PosDiscountRule = dbStore.get('PosDiscountRule');
        const row = await PosDiscountRule.findOne({
            where: { type, is_active: true },
            order: [['id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findActiveEmployeeById(userId, options = {}) {
        const User = dbStore.get('User');
        const row = await User.findOne({
            where: buildVisibleWhere({ user_id: userId, is_active: true }),
            attributes: ['user_id', 'username', 'email', 'role'],
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async listActiveDiscountApprovers(options = {}) {
        const User = dbStore.get('User');
        const rows = await User.findAll({
            where: buildVisibleWhere({
                is_active: true
            }),
            attributes: ['user_id', 'username', 'role', 'is_master_admin', 'permissions', 'pos_approval_pin_hash'],
            order: [['username', 'ASC']],
            transaction: options.transaction
        });
        return rows
            .map(serializeDiscountAuthorizer)
            .filter((row) => row?.can_authorize_discounts === true)
            .map((row) => ({
                user_id: row.user_id,
                username: row.username,
                role: row.role,
                is_master_admin: row.is_master_admin,
                can_authorize_discounts: true,
                pos_approval_pin_configured: Boolean(String(row.pos_approval_pin_hash || '').trim())
            }));
    },

    async findActiveDiscountApproverById(userId, options = {}) {
        const User = dbStore.get('User');
        const row = await User.findOne({
            where: buildVisibleWhere({ user_id: userId, is_active: true }),
            attributes: ['user_id', 'username', 'role', 'is_active', 'deleted_at', 'is_master_admin', 'permissions', 'pos_approval_pin_hash'],
            transaction: options.transaction
        });
        return serializeDiscountAuthorizer(row);
    },

    async findActivePosDrawerOperatorById(userId, options = {}) {
        const User = dbStore.get('User');
        const row = await User.findOne({
            where: buildVisibleWhere({ user_id: userId, is_active: true }),
            attributes: ['user_id', 'username', 'role', 'is_active', 'deleted_at', 'is_master_admin', 'pos_approval_pin_hash'],
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async findActiveDayCloseOperatorById(userId, options = {}) {
        const User = dbStore.get('User');
        const row = await User.findOne({
            where: buildVisibleWhere({ user_id: userId, is_active: true }),
            attributes: ['user_id', 'username', 'is_active', 'deleted_at', 'pos_day_close_pin_hash'],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findSystemSettingByKey(key, options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        const row = await SystemSetting.findOne({
            where: { setting_key: key },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async updateSystemSettingValueByKey(key, value, options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        const row = await SystemSetting.findOne({
            where: { setting_key: key },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update({
            setting_value: typeof value === 'string' ? value : JSON.stringify(value),
            data_type: typeof value === 'string' ? row.data_type : 'json'
        }, { transaction: options.transaction });
        return toPlain(row);
    },

    async getItemById(itemId, options = {}) {
        const Item = dbStore.get('Item');
        return Item.findOne({
            where: buildVisibleWhere(
                { item_id: itemId },
                { statusField: 'status', excludeInactiveStatus: false }
            ),
            attributes: ['item_id', 'name', 'sku_code', 'category', 'product_type', 'mode_item_preset', 'status', 'default_sale_price', 'current_stock'],
            include: buildServiceDetailInclude(),
            transaction: options.transaction
        });
    },

    async findItemsBySkuCodes(skuCodes = [], options = {}) {
        const Item = dbStore.get('Item');
        const normalizedSkuCodes = [...new Set((Array.isArray(skuCodes) ? skuCodes : [])
            .map((value) => String(value || '').trim())
            .filter(Boolean))];
        if (normalizedSkuCodes.length === 0) return [];

        return Item.findAll({
            where: buildVisibleWhere(
                { sku_code: { [Op.in]: normalizedSkuCodes } },
                { statusField: 'status', excludeInactiveStatus: false }
            ),
            attributes: ['item_id', 'name', 'sku_code', 'category', 'product_type', 'mode_item_preset', 'status', 'default_sale_price', 'current_stock'],
            include: buildServiceDetailInclude(),
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
            const stockMap = await loadItemLocationStockMap(
                catalogItems.map((item) => Number(item.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && stockMap.locationScopeResolved
                ? applyItemLocationStockMap(catalogItems, stockMap.stockMap)
                : catalogItems;
        } catch (error) {
            if (!isMissingVatTypeColumnError(error)) {
                throw error;
            }

            const catalogItems = await applyCatalogOverrides(withLegacyVatFallback(await Item.findAll({
                ...queryOptions,
                attributes: BASE_POS_ITEM_ATTRIBUTES
            })), options);
            const stockMap = await loadItemLocationStockMap(
                catalogItems.map((item) => Number(item.item_id)),
                normalizedLocationId,
                options
            );
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && stockMap.locationScopeResolved
                ? applyItemLocationStockMap(catalogItems, stockMap.stockMap)
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
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!counter) return 0;

        return Number.parseInt(counter.current_value, 10) || 0;
    },

    async getVerifiedFiscalTerminalRegistration(filters = {}, options = {}) {
        const PosFiscalTerminalRegistration = safeGetModel('PosFiscalTerminalRegistration');
        if (!PosFiscalTerminalRegistration) return null;

        const where = { accreditation_status: 'verified' };
        const terminalId = String(filters?.terminal_id || '').trim().toUpperCase();
        if (terminalId) {
            where.terminal_id = terminalId;
        }

        const row = await PosFiscalTerminalRegistration.findOne({
            where,
            order: [['verified_at', 'DESC'], ['updated_at', 'DESC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });

        return toPlain(row);
    },

    async createFiscalEvent(payload = {}, options = {}) {
        const PosFiscalEvent = safeGetModel('PosFiscalEvent');
        if (!PosFiscalEvent) return null;

        const transaction = options.transaction;
        const previous = await PosFiscalEvent.findOne({
            order: [['event_sequence', 'DESC']],
            transaction,
            lock: transaction ? transaction.LOCK.UPDATE : undefined
        });
        const previousPayload = toPlain(previous);
        const eventSequence = (Number.parseInt(previousPayload?.event_sequence, 10) || 0) + 1;
        const previousEventHash = previousPayload?.event_hash || null;
        const eventPayload = payload.payload && typeof payload.payload === 'object'
            ? payload.payload
            : {};
        const hashInput = {
            event_sequence: eventSequence,
            previous_event_hash: previousEventHash,
            event_type: payload.event_type,
            pos_transaction_id: payload.pos_transaction_id || null,
            document_type: payload.document_type || null,
            invoice_number: payload.invoice_number || null,
            terminal_id: payload.terminal_id || null,
            payload: eventPayload,
            actor_user_id: payload.actor_user_id || null
        };
        const eventHash = hashFiscalEventPayload(hashInput);

        const row = await PosFiscalEvent.create({
            pos_transaction_id: payload.pos_transaction_id || null,
            event_type: payload.event_type,
            document_type: payload.document_type || null,
            invoice_number: payload.invoice_number || null,
            terminal_id: payload.terminal_id || null,
            event_sequence: eventSequence,
            event_hash: eventHash,
            previous_event_hash: previousEventHash,
            payload: eventPayload,
            actor_user_id: payload.actor_user_id || null
        }, { transaction });

        return toPlain(row);
    },

    async countFiscalPrintEvents(posTransactionId, options = {}) {
        const PosFiscalPrintEvent = safeGetModel('PosFiscalPrintEvent');
        if (!PosFiscalPrintEvent) return 0;

        return PosFiscalPrintEvent.count({
            where: { pos_transaction_id: posTransactionId },
            transaction: options.transaction
        });
    },

    async createFiscalPrintEvent(payload = {}, options = {}) {
        const PosFiscalPrintEvent = safeGetModel('PosFiscalPrintEvent');
        if (!PosFiscalPrintEvent) return null;

        const row = await PosFiscalPrintEvent.create(payload, {
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async updateTransactionLifecycle(posTransactionId, payload = {}, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const row = await PosTransaction.findByPk(posTransactionId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async listStockMovementsForPosTransaction(posTransactionId, options = {}) {
        const StockMovement = safeGetModel('StockMovement');
        if (!StockMovement) return [];

        const rows = await StockMovement.findAll({
            where: {
                reference_type: 'POS',
                reference_id: String(posTransactionId),
                movement_type: 'goods_issue'
            },
            order: [['movement_id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async listFiscalTransactionsForMonth(reportMonth, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const startAt = new Date(`${reportMonth}-01T00:00:00.000+08:00`);
        const nextMonth = new Date(startAt);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const rows = await PosTransaction.findAll({
            where: {
                document_type: 'fiscal_invoice',
                created_at: {
                    [Op.gte]: startAt,
                    [Op.lt]: nextMonth
                }
            },
            order: [['created_at', 'ASC'], ['pos_transaction_id', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async upsertESalesReport(payload = {}, options = {}) {
        const PosESalesReport = safeGetModel('PosESalesReport');
        if (!PosESalesReport) return null;

        const [row] = await PosESalesReport.upsert(payload, {
            transaction: options.transaction,
            returning: true
        });
        if (row && typeof row === 'object' && typeof row.toJSON === 'function') return toPlain(row);

        const persisted = await PosESalesReport.findOne({
            where: { report_month: payload.report_month },
            transaction: options.transaction
        });
        return toPlain(persisted);
    },

    async listESalesReports(options = {}) {
        const PosESalesReport = safeGetModel('PosESalesReport');
        if (!PosESalesReport) return [];

        const rows = await PosESalesReport.findAll({
            order: [['report_month', 'DESC']],
            limit: Math.min(Number.parseInt(options.limit, 10) || 24, 100),
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async findESalesReportById(reportId, options = {}) {
        const PosESalesReport = safeGetModel('PosESalesReport');
        if (!PosESalesReport) return null;

        const row = await PosESalesReport.findByPk(reportId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async updateESalesReportStatus(reportId, payload = {}, options = {}) {
        const PosESalesReport = safeGetModel('PosESalesReport');
        if (!PosESalesReport) return null;

        const row = await PosESalesReport.findByPk(reportId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async upsertFiscalTerminalRegistration(payload = {}, options = {}) {
        const PosFiscalTerminalRegistration = safeGetModel('PosFiscalTerminalRegistration');
        if (!PosFiscalTerminalRegistration) return null;

        const [row] = await PosFiscalTerminalRegistration.upsert(payload, {
            transaction: options.transaction,
            returning: true
        });
        if (row && typeof row === 'object' && typeof row.toJSON === 'function') return toPlain(row);

        const persisted = await PosFiscalTerminalRegistration.findOne({
            where: { terminal_id: payload.terminal_id },
            transaction: options.transaction
        });
        return toPlain(persisted);
    },

    async listFiscalTerminalRegistrations(options = {}) {
        const PosFiscalTerminalRegistration = safeGetModel('PosFiscalTerminalRegistration');
        if (!PosFiscalTerminalRegistration) return [];

        const rows = await PosFiscalTerminalRegistration.findAll({
            order: [['terminal_id', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async listFiscalEvents(options = {}) {
        const PosFiscalEvent = safeGetModel('PosFiscalEvent');
        if (!PosFiscalEvent) return [];

        const rows = await PosFiscalEvent.findAll({
            order: [['event_sequence', 'ASC']],
            limit: Math.min(Number.parseInt(options.limit, 10) || 1000, 5000),
            transaction: options.transaction
        });
        return rows.map(toPlain);
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

    async createGovernedTransactionDiscount({ transactionId, application, calculation }, options = {}) {
        const PosTransactionDiscount = dbStore.get('PosTransactionDiscount');
        const PosTransactionDiscountLine = dbStore.get('PosTransactionDiscountLine');
        const PosTransactionLine = dbStore.get('PosTransactionLine');
        const transaction = options.transaction;
        const created = await PosTransactionDiscount.create({
            transaction_id: transactionId,
            discount_rule_id: application.rule_id || null,
            discount_type: application.type,
            discount_method: calculation.method,
            discount_rate: calculation.rate,
            discount_amount: calculation.discount_amount,
            vat_removed: calculation.vat_removed,
            vat_exempt_amount: calculation.vat_exempt_amount,
            customer_name: application.customer_name || null,
            senior_pwd_id_number: application.id_number || null,
            employee_name: application.employee_name || null,
            employee_id: application.employee_id || null,
            promo_code: application.promo_code || null,
            manager_approval_id: application.manager_approval_id || null,
            manager_approved_at: application.manager_approved_at || null,
            self_approved: application.self_approved === true,
            reason: application.reason || null,
            calculation_version: 'pos-discount.v2'
        }, { transaction });
        const transactionLines = await PosTransactionLine.findAll({
            where: { pos_transaction_id: transactionId },
            order: [['line_id', 'ASC']],
            transaction
        });
        const calculatedByItem = new Map(calculation.lines.map((line) => [Number(line.item_id), line]));
        const rows = transactionLines.map((line) => {
            const allocation = calculatedByItem.get(Number(line.item_id)) || {};
            return {
                transaction_discount_id: created.id,
                transaction_line_id: line.line_id,
                item_id: line.item_id,
                eligible_quantity: allocation.eligible_quantity || 0,
                gross_eligible_amount: allocation.gross_eligible_amount || 0,
                vat_removed: allocation.vat_removed || 0,
                vat_exempt_amount: allocation.vat_exempt_amount || 0,
                discount_amount: allocation.discount_amount || 0,
                final_line_amount: allocation.final_line_amount || line.line_subtotal,
                eligibility_override_reason: allocation.eligibility_override_reason || null
            };
        });
        if (rows.length > 0) await PosTransactionDiscountLine.bulkCreate(rows, { transaction });
        return created;
    },

    async listProductCompositionsForItems(itemIds = [], options = {}) {
        const ProductComposition = safeGetModel('ProductComposition');
        const Item = safeGetModel('Item');
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
        const locationStock = await loadItemLocationStockMap(ingredientIds, normalizedLocationId, options);
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

    async createFnbKitchenOrderForTransaction(payload = {}, options = {}) {
        const FnbCheck = dbStore.get('FnbCheck');
        const FnbCheckLine = dbStore.get('FnbCheckLine');
        const FnbKitchenTicket = dbStore.get('FnbKitchenTicket');
        const PosTransaction = dbStore.get('PosTransaction');
        if (!FnbCheck || !FnbCheckLine || !FnbKitchenTicket || !PosTransaction) return null;

        const transaction = options.transaction;
        const posTransactionId = toPositiveInt(payload.pos_transaction_id);
        if (!posTransactionId) return null;
        const orderNotes = String(payload.order_notes || '').trim() || null;

        let checkId = toPositiveInt(payload.check_id);
        const usesExistingCheck = Boolean(checkId);
        let check;
        if (checkId) {
            check = await FnbCheck.findByPk(checkId, {
                transaction,
                lock: options.lock && transaction ? transaction.LOCK.UPDATE : undefined
            });
            if (!check) return null;
            const existingTicket = await FnbKitchenTicket.findOne({
                where: {
                    check_id: checkId,
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
                table_id: toPositiveInt(payload.table_id),
                server_id: toPositiveInt(payload.server_id),
                guest_count: toPositiveInt(payload.guest_count) || 1,
                order_method: ['dine_in', 'takeout', 'pickup', 'delivery'].includes(payload.order_method)
                    ? payload.order_method
                    : 'dine_in',
                status: 'sent_to_kitchen',
                pos_transaction_id: posTransactionId,
                notes: orderNotes
            }, { transaction });
            checkId = Number(check.check_id);
            await PosTransaction.update(
                {
                    fnb_check_id: checkId,
                    fnb_metadata: {
                        source: 'pos_checkout',
                        check_id: checkId
                    }
                },
                {
                    where: { pos_transaction_id: posTransactionId },
                    transaction
                }
            );
        }

        let lineRows = (Array.isArray(payload.lines) ? payload.lines : [])
            .map((line) => ({
                check_id: checkId,
                item_id: toPositiveInt(line.item_id),
                quantity: Number(line.quantity),
                course: ['appetizer', 'main', 'dessert', 'drink', 'other'].includes(line.fnb_course_snapshot)
                    ? line.fnb_course_snapshot
                    : 'main',
                modifiers_snapshot: line.fnb_modifiers_snapshot || null,
                special_instructions: line.fnb_special_instructions || null,
                kitchen_station_id: toPositiveInt(line.fnb_kitchen_station_snapshot?.kitchen_station_id),
                status: 'sent'
            }))
            .filter((line) => line.item_id && Number.isFinite(line.quantity) && line.quantity > 0);

        if (!usesExistingCheck && lineRows.length > 0) {
            await FnbCheckLine.bulkCreate(lineRows, { transaction });
        } else if (usesExistingCheck) {
            const existingLines = await FnbCheckLine.findAll({
                where: { check_id: checkId },
                order: [['created_at', 'ASC']],
                transaction,
                lock: options.lock && transaction ? transaction.LOCK.UPDATE : undefined
            });
            const existingLineRows = existingLines.map(toPlain).map((line) => ({
                check_line_id: toPositiveInt(line.check_line_id),
                check_id: checkId,
                item_id: toPositiveInt(line.item_id),
                quantity: Number(line.quantity),
                course: ['appetizer', 'main', 'dessert', 'drink', 'other'].includes(line.course) ? line.course : 'main',
                modifiers_snapshot: line.modifiers_snapshot || null,
                special_instructions: line.special_instructions || null,
                kitchen_station_id: toPositiveInt(line.kitchen_station_id),
                status: line.status || 'sent'
            })).filter((line) => line.item_id && Number.isFinite(line.quantity) && line.quantity > 0);
            if (existingLineRows.length > 0) {
                lineRows = existingLineRows;
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
            }
            const checkUpdate = { status: 'sent_to_kitchen', pos_transaction_id: posTransactionId };
            if (orderNotes !== null) checkUpdate.notes = orderNotes;
            await check.update(checkUpdate, { transaction });
        }

        const ticket = await FnbKitchenTicket.create({
            check_id: checkId,
            kitchen_station_id: lineRows.find((line) => line.kitchen_station_id)?.kitchen_station_id || null,
            ticket_number: `POS-${posTransactionId}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
            status: 'queued',
            lines_snapshot: {
                source: 'pos_checkout',
                pos_transaction_id: posTransactionId,
                lines: lineRows,
                recipe_movements: Array.isArray(payload.recipe_movements) ? payload.recipe_movements : []
            },
            fired_at: new Date()
        }, { transaction });

        return {
            check: toPlain(check),
            kitchen_ticket: toPlain(ticket)
        };
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
        const whereAnd = [];
        const cashierId = Number.parseInt(filters.cashier_id, 10);
        if (Number.isInteger(cashierId) && cashierId > 0) {
            whereAnd.push({
                [Op.or]: [
                { cashier_id: cashierId },
                { accepted_by: cashierId }
                ]
            });
        }
        const cashierName = String(filters.cashier_name || '').trim();
        if (cashierName) {
            const cashierIds = await findHistoryUserIds(dbStore.get('User'), cashierName);
            whereAnd.push({
                [Op.or]: [
                    { cashier_id: { [Op.in]: cashierIds } },
                    { accepted_by: { [Op.in]: cashierIds } }
                ]
            });
        }
        if (filters.payment_type) where.payment_type = filters.payment_type;
        if (filters.payment_status) where.payment_status = filters.payment_status;
        if (filters.order_method) where.order_method = filters.order_method;
        if (filters.order_source) where.order_source = filters.order_source;
        if (filters.status) where.status = filters.status;
        const searchConditions = buildPosTransactionHistorySearchConditions({
            sequelize: PosTransaction.sequelize,
            search: filters.search
        });
        const searchText = String(filters.search || '').trim();
        if (searchText) {
            const matchingUserIds = await findHistoryUserIds(dbStore.get('User'), searchText);
            const matchingDiscountTransactionIds = await findHistoryDiscountTransactionIds(
                dbStore.get('PosTransactionDiscount'),
                searchText,
                matchingUserIds
            );
            searchConditions.push(
                { cashier_id: { [Op.in]: matchingUserIds } },
                { accepted_by: { [Op.in]: matchingUserIds } },
                { pos_transaction_id: { [Op.in]: matchingDiscountTransactionIds } }
            );
        }
        if (searchConditions.length > 0) {
            whereAnd.push({ [Op.or]: searchConditions });
        }
        if (whereAnd.length > 0) {
            where[Op.and] = whereAnd;
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
                    attributes: ['user_id', 'username'],
                    required: false
                },
                {
                    model: dbStore.get('User'),
                    as: 'acceptedByUser',
                    attributes: ['user_id', 'username'],
                    required: false
                },
                {
                    model: dbStore.get('User'),
                    as: 'voidedByUser',
                    attributes: ['user_id', 'username'],
                    required: false
                },
                {
                    model: dbStore.get('PosTerminalShift'),
                    as: 'shift',
                    attributes: ['pos_terminal_shift_id', 'business_date', 'terminal_id', 'location_id', 'status']
                },
                {
                    model: dbStore.get('PosTransactionLine'),
                    as: 'lines',
                    attributes: ['line_id', 'pos_transaction_id', 'quantity', 'cost_snapshot']
                },
                {
                    model: dbStore.get('PosTransactionDiscount'),
                    as: 'discount',
                    required: false,
                    include: [{
                        model: dbStore.get('User'),
                        as: 'approvedBy',
                        attributes: ['user_id', 'username', 'role'],
                        required: false
                    }]
                }
            ],
            distinct: true,
            order: [['created_at', 'DESC']],
            limit,
            offset
        });

        return {
            transactions: rows.map((row) => {
                const payload = toPlain(row);
                return {
                    ...payload,
                    total_cost: computeTransactionTotalCost(payload.lines)
                };
            }),
            pagination: {
                page,
                limit,
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        };
    },

    async listReportTransactions(filters = {}, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const { startAt, endAtExclusive } = resolveReportDateRange(filters);
        const where = buildPosReportWhere(filters, { startAt, endAtExclusive });
        const rows = await PosTransaction.findAll({
            where,
            include: buildReportInclude(),
            order: [['created_at', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async listReportTransactionAdjustments(filters = {}, options = {}) {
        const PosTransactionAdjustment = safeGetModel('PosTransactionAdjustment');
        if (!PosTransactionAdjustment) return [];

        const { startAt, endAtExclusive } = resolveReportDateRange(filters);
        const scopeConditions = [];
        const cashierId = toPositiveInt(filters.cashier_id);
        const locationId = toPositiveInt(filters.location_id);
        const terminalId = String(filters.terminal_id || '').trim();
        const paymentType = String(filters.payment_type || '').trim();
        if (cashierId) scopeConditions.push({ original_cashier_id: cashierId });
        if (locationId) {
            scopeConditions.push({
                [Op.or]: [
                    { original_location_id: locationId },
                    { actor_location_id: locationId }
                ]
            });
        }
        if (terminalId) {
            scopeConditions.push({
                [Op.or]: [
                    { original_terminal_id: terminalId },
                    { actor_terminal_id: terminalId }
                ]
            });
        }
        if (paymentType) scopeConditions.push({ tender_type: paymentType });

        const User = safeGetModel('User');
        const PosTransaction = safeGetModel('PosTransaction');
        const include = [];
        if (PosTransaction) include.push({ model: PosTransaction, as: 'transaction', attributes: ['pos_transaction_id', 'invoice_number'], required: false });
        if (User) {
            include.push({ model: User, as: 'originalCashier', attributes: ['user_id', 'username'], required: false });
            include.push({ model: User, as: 'actorUser', attributes: ['user_id', 'username'], required: false });
        }

        const rows = await PosTransactionAdjustment.findAll({
            where: {
                adjustment_type: { [Op.in]: Array.from(REPORT_ADJUSTMENT_TYPES) },
                [Op.and]: [
                    {
                        [Op.or]: [
                            { completed_at: { [Op.gte]: startAt, [Op.lt]: endAtExclusive } },
                            {
                                completed_at: null,
                                failed_at: { [Op.gte]: startAt, [Op.lt]: endAtExclusive }
                            },
                            {
                                completed_at: null,
                                failed_at: null,
                                cancelled_at: { [Op.gte]: startAt, [Op.lt]: endAtExclusive }
                            },
                            {
                                completed_at: null,
                                failed_at: null,
                                cancelled_at: null,
                                created_at: { [Op.gte]: startAt, [Op.lt]: endAtExclusive }
                            }
                        ]
                    },
                    ...scopeConditions
                ]
            },
            include,
            order: [['created_at', 'ASC'], ['pos_transaction_adjustment_id', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async listActiveReportCategories(options = {}) {
        const ItemFolder = dbStore.get('ItemFolder');
        if (!ItemFolder) return [];

        const rows = await ItemFolder.findAll({
            where: {
                is_active: true,
                deleted_at: null
            },
            attributes: ['folder_id', 'name'],
            order: [['name', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async getReportsOverview(filters = {}, options = {}) {
        const [transactions, categoryOptions, adjustments] = await Promise.all([
            this.listReportTransactions(filters, options),
            this.listActiveReportCategories(options),
            this.listReportTransactionAdjustments(filters, options)
        ]);
        const cashierReconciliation = await loadReportCashierReconciliation({
            transactions,
            filters,
            options
        });
        const cashierLifecycle = await loadCashierLifecycleReport({
            filters,
            options,
            registerReconciliation: cashierReconciliation
        });
        const payload = buildReportPayloadFromTransactions(
            transactions,
            filters,
            categoryOptions,
            cashierReconciliation,
            adjustments,
            cashierLifecycle
        );
        const cashierNetSales = round4((payload.daily_report?.cashier_summary || []).reduce(
            (total, row) => total + Number(row.summary?.net_sales || 0),
            0
        ));
        const registerNetSales = round4(payload.daily_report?.summary?.net_sales || 0);
        payload.cashier_lifecycle.reconciliation = {
            cashier_net_sales: cashierNetSales,
            register_transaction_net_sales: registerNetSales,
            difference: round4(cashierNetSales - registerNetSales),
            reconciled: round4(cashierNetSales - registerNetSales) === 0,
            exclusions: ['cash drawer movements are register ledger entries, not sales']
        };
        return payload;
    },

    async exportReports(filters = {}, options = {}) {
        const payload = await this.getReportsOverview(filters, options);
        const section = String(filters.section || 'daily').trim().toLowerCase() || 'daily';
        const rows = buildReportExportRows(section, payload);
        const content = rows
            .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const dateSuffix = payload?.applied_filters?.dateFrom && payload?.applied_filters?.dateTo
            ? `${payload.applied_filters.dateFrom}_to_${payload.applied_filters.dateTo}`
            : getManilaDateParts(new Date()).date;

        return {
            filename: `pos-${section}-report-${dateSuffix}.csv`,
            content_type: 'text/csv; charset=utf-8',
            content
        };
    },

    async getZReadingSummary({
        startAt,
        endAt,
        terminalId = null,
        cashierId = null,
        shiftId = null,
        locationId = null,
        includeOnlineStoreAcrossTerminals = false
    }, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const PosTransactionLine = dbStore.get('PosTransactionLine');
        const Item = dbStore.get('Item');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

        const where = buildTerminalScopedSalesWhere({
            startAt,
            endAt,
            terminalId,
            cashierId,
            shiftId,
            locationId,
            includeOnlineStoreAcrossTerminals
        });
        const voidWhere = buildTerminalScopedVoidWhere({
            startAt,
            endAt,
            terminalId,
            cashierId,
            shiftId,
            locationId,
            includeOnlineStoreAcrossTerminals
        });

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
            attributes: ['pos_transaction_id', 'payment_type', 'total_amount', 'payment_breakdown'],
            raw: true,
            transaction: options.transaction
        });
        const [voidSummaryRow] = await PosTransaction.findAll({
            where: voidWhere,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'void_transaction_count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'void_amount']
            ],
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

        const lineSummaryRows = PosTransactionLine
            ? await PosTransactionLine.findAll({
                include: [{
                    model: PosTransaction,
                    as: 'transaction',
                    attributes: [],
                    required: true,
                    where
                }],
                attributes: [
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'item_count'],
                    [
                        sequelize.literal('COALESCE(SUM(`PosTransactionLine`.`quantity` * COALESCE(`PosTransactionLine`.`cost_snapshot`, 0)), 0)'),
                        'total_cost'
                    ],
                    [
                        sequelize.literal('COALESCE(SUM(CASE WHEN `transaction`.`discount_amount` > 0 THEN `PosTransactionLine`.`quantity` ELSE 0 END), 0)'),
                        'discount_item_count'
                    ]
                ],
                raw: true,
                transaction: options.transaction
            })
            : [];

        const lineSummary = lineSummaryRows[0] || {};
        const voidLineSummaryRows = PosTransactionLine
            ? await PosTransactionLine.findAll({
                include: [{
                    model: PosTransaction,
                    as: 'transaction',
                    attributes: [],
                    required: true,
                    where: voidWhere
                }],
                attributes: [
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'voided_item_count']
                ],
                raw: true,
                transaction: options.transaction
            })
            : [];
        const voidLineSummary = voidLineSummaryRows[0] || {};

        const popularItemRows = PosTransactionLine
            ? await PosTransactionLine.findAll({
                include: [
                    {
                        model: PosTransaction,
                        as: 'transaction',
                        attributes: [],
                        required: true,
                        where
                    },
                    ...(Item ? [{
                        model: Item,
                        as: 'item',
                        attributes: [],
                        required: false
                    }] : [])
                ],
                attributes: [
                    'item_id',
                    ...(Item ? [
                        [sequelize.col('item.name'), 'item_name'],
                        [sequelize.col('item.sku_code'), 'sku_code']
                    ] : []),
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'quantity'],
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('line_subtotal')), 0), 'amount'],
                    [
                        sequelize.literal('COALESCE(SUM(`PosTransactionLine`.`quantity` * COALESCE(`PosTransactionLine`.`cost_snapshot`, 0)), 0)'),
                        'cost'
                    ]
                ],
                group: [
                    'PosTransactionLine.item_id',
                    ...(Item ? ['item.name', 'item.sku_code'] : [])
                ],
                order: [[sequelize.literal('quantity'), 'DESC']],
                limit: 10,
                raw: true,
                transaction: options.transaction
            })
            : [];

        const dailyStartAt = new Date(startAt.getTime() - (10 * 24 * 60 * 60 * 1000));
        const dailyWhere = buildTerminalScopedSalesWhere({
            startAt: dailyStartAt,
            endAt,
            terminalId,
            cashierId,
            shiftId,
            locationId,
            includeOnlineStoreAcrossTerminals
        });
        const dailyVoidWhere = buildTerminalScopedVoidWhere({
            startAt: dailyStartAt,
            endAt,
            terminalId,
            cashierId,
            shiftId,
            locationId,
            includeOnlineStoreAcrossTerminals
        });

        const dailyTransactionBusinessDate = sequelize.literal("DATE_FORMAT(DATE_ADD(`PosTransaction`.`created_at`, INTERVAL 8 HOUR), '%Y-%m-%d')");
        const dailyLineBusinessDate = sequelize.literal("DATE_FORMAT(DATE_ADD(`transaction`.`created_at`, INTERVAL 8 HOUR), '%Y-%m-%d')");
        const dailyVoidBusinessDate = sequelize.literal("DATE_FORMAT(DATE_ADD(`PosTransaction`.`voided_at`, INTERVAL 8 HOUR), '%Y-%m-%d')");
        const dailyVoidLineBusinessDate = sequelize.literal("DATE_FORMAT(DATE_ADD(`transaction`.`voided_at`, INTERVAL 8 HOUR), '%Y-%m-%d')");

        const dailyTotalRows = await PosTransaction.findAll({
            where: dailyWhere,
            attributes: [
                [dailyTransactionBusinessDate, 'business_date'],
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'transaction_count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('discount_amount')), 0), 'discount_amount'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_amount']
            ],
            group: [dailyTransactionBusinessDate],
            order: [[dailyTransactionBusinessDate, 'ASC']],
            raw: true,
            transaction: options.transaction
        });
        const dailyLineRows = PosTransactionLine
            ? await PosTransactionLine.findAll({
                include: [{
                    model: PosTransaction,
                    as: 'transaction',
                    attributes: [],
                    required: true,
                    where: dailyWhere
                }],
                attributes: [
                    [dailyLineBusinessDate, 'business_date'],
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'item_count'],
                    [
                        sequelize.literal('COALESCE(SUM(`PosTransactionLine`.`quantity` * COALESCE(`PosTransactionLine`.`cost_snapshot`, 0)), 0)'),
                        'total_cost'
                    ],
                    [
                        sequelize.literal('COALESCE(SUM(CASE WHEN `transaction`.`discount_amount` > 0 THEN `PosTransactionLine`.`quantity` ELSE 0 END), 0)'),
                        'discount_item_count'
                    ]
                ],
                group: [dailyLineBusinessDate],
                raw: true,
                transaction: options.transaction
            })
            : [];
        const dailyLinesByDate = new Map(dailyLineRows.map((row) => [
            String(row?.business_date || '').slice(0, 10),
            row
        ]));
        const dailyVoidRows = await PosTransaction.findAll({
            where: dailyVoidWhere,
            attributes: [
                [dailyVoidBusinessDate, 'business_date'],
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'void_transaction_count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'void_amount']
            ],
            group: [dailyVoidBusinessDate],
            raw: true,
            transaction: options.transaction
        });
        const dailyVoidLineRows = PosTransactionLine
            ? await PosTransactionLine.findAll({
                include: [{
                    model: PosTransaction,
                    as: 'transaction',
                    attributes: [],
                    required: true,
                    where: dailyVoidWhere
                }],
                attributes: [
                    [dailyVoidLineBusinessDate, 'business_date'],
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'voided_item_count']
                ],
                group: [dailyVoidLineBusinessDate],
                raw: true,
                transaction: options.transaction
            })
            : [];
        const dailyVoidsByDate = new Map(dailyVoidRows.map((row) => [
            String(row?.business_date || '').slice(0, 10),
            row
        ]));
        const dailyVoidLinesByDate = new Map(dailyVoidLineRows.map((row) => [
            String(row?.business_date || '').slice(0, 10),
            row
        ]));
        const dailyTotalsByDate = new Map(dailyTotalRows.map((row) => [
            String(row?.business_date || '').slice(0, 10),
            row
        ]));
        const dailyBusinessDates = Array.from(new Set([
            ...dailyTotalsByDate.keys(),
            ...dailyVoidsByDate.keys(),
            ...dailyVoidLinesByDate.keys()
        ])).filter(Boolean).sort();

        return {
            transaction_count: Number.parseInt(summaryRow?.transaction_count || 0, 10),
            subtotal_amount: round4(summaryRow?.subtotal_amount),
            discount_amount: round4(summaryRow?.discount_amount),
            service_fee_total: round4(summaryRow?.service_fee_total),
            restaurant_service_charge_total: round4(summaryRow?.restaurant_service_charge_total),
            vatable_sales: round4(summaryRow?.vatable_sales),
            vat_amount: round4(summaryRow?.vat_amount),
            vat_exempt_sales: round4(summaryRow?.vat_exempt_sales),
            zero_rated_sales: round4(summaryRow?.zero_rated_sales),
            total_amount: round4(summaryRow?.total_amount),
            item_count: round4(lineSummary?.item_count),
            discount_item_count: round4(lineSummary?.discount_item_count),
            total_cost: round4(lineSummary?.total_cost),
            void_transaction_count: Number.parseInt(voidSummaryRow?.void_transaction_count || 0, 10),
            void_amount: round4(voidSummaryRow?.void_amount),
            voided_item_count: round4(voidLineSummary?.voided_item_count),
            refund_amount: 0,
            refunded_item_count: 0,
            provider_refunds_included: false,
            net_profit: round4(summaryRow?.total_amount) - round4(lineSummary?.total_cost),
            daily_totals: dailyBusinessDates.map((businessDate) => {
                const row = dailyTotalsByDate.get(businessDate) || {};
                return {
                business_date: businessDate,
                transaction_count: Number.parseInt(row.transaction_count || 0, 10),
                total_amount: round4(row.total_amount),
                discount_amount: round4(row.discount_amount),
                item_count: round4(dailyLinesByDate.get(businessDate)?.item_count),
                discount_item_count: round4(dailyLinesByDate.get(businessDate)?.discount_item_count),
                total_cost: round4(dailyLinesByDate.get(businessDate)?.total_cost),
                void_transaction_count: Number.parseInt(dailyVoidsByDate.get(businessDate)?.void_transaction_count || 0, 10),
                void_amount: round4(dailyVoidsByDate.get(businessDate)?.void_amount),
                voided_item_count: round4(dailyVoidLinesByDate.get(businessDate)?.voided_item_count),
                refund_amount: 0,
                refunded_item_count: 0,
                provider_refunds_included: false,
                net_profit: round4(row.total_amount) - round4(dailyLinesByDate.get(businessDate)?.total_cost)
                };
            }),
            popular_items: popularItemRows.map((row) => ({
                item_id: toPositiveInt(row.item_id),
                item_name: row.item_name || `Item #${row.item_id}`,
                sku_code: row.sku_code || null,
                quantity: round4(row.quantity),
                amount: round4(row.amount),
                cost: round4(row.cost),
                net_profit: round4(row.amount) - round4(row.cost)
            })),
            payment_breakdown: buildZReadingPaymentBreakdown(paymentBreakdownRows),
            order_method_breakdown: orderMethodBreakdownRows.map((row) => ({
                order_method: row.order_method,
                count: Number.parseInt(row.count || 0, 10),
                amount: round4(row.amount)
            }))
        };
    },

    async getPostCloseVoidSummaryForShift({
        shiftId,
        closedAt,
        terminalId = null,
        locationId = null
    } = {}, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const PosTransactionLine = dbStore.get('PosTransactionLine');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const where = buildPostCloseVoidWhere({
            closedAt,
            shiftId: toPositiveInt(shiftId),
            terminalId,
            locationId: toPositiveInt(locationId)
        });
        if (!where) {
            return {
                post_close_void_transaction_count: 0,
                post_close_void_amount: 0,
                post_close_voided_item_count: 0
            };
        }

        const [summaryRow] = await PosTransaction.findAll({
            where,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'post_close_void_transaction_count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'post_close_void_amount']
            ],
            raw: true,
            transaction: options.transaction
        });
        const lineSummaryRows = PosTransactionLine
            ? await PosTransactionLine.findAll({
                include: [{
                    model: PosTransaction,
                    as: 'transaction',
                    attributes: [],
                    required: true,
                    where
                }],
                attributes: [
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('quantity')), 0), 'post_close_voided_item_count']
                ],
                raw: true,
                transaction: options.transaction
            })
            : [];

        return {
            post_close_void_transaction_count: Number.parseInt(summaryRow?.post_close_void_transaction_count || 0, 10),
            post_close_void_amount: round4(summaryRow?.post_close_void_amount),
            post_close_voided_item_count: round4(lineSummaryRows[0]?.post_close_voided_item_count)
        };
    },

    async getPostCloseAdjustmentSummaryForShift({
        shiftId,
        closedAt,
        terminalId = null,
        locationId = null
    } = {}, options = {}) {
        const PosTransactionAdjustment = safeGetModel('PosTransactionAdjustment');
        const normalizedShiftId = toPositiveInt(shiftId);
        const normalizedClosedAt = new Date(closedAt || '');
        if (!PosTransactionAdjustment || !normalizedShiftId || !Number.isFinite(normalizedClosedAt.getTime())) {
            return {
                post_close_adjustment_count: 0,
                post_close_refund_amount: 0,
                post_close_pending_amount: 0,
                post_close_manual_review_amount: 0,
                post_close_adjustments: []
            };
        }

        const where = {
            original_shift_id: normalizedShiftId,
            adjustment_type: { [Op.in]: Array.from(REPORT_ADJUSTMENT_TYPES) },
            [Op.or]: [
                { completed_at: { [Op.gte]: normalizedClosedAt } },
                {
                    completed_at: null,
                    failed_at: { [Op.gte]: normalizedClosedAt }
                },
                {
                    completed_at: null,
                    failed_at: null,
                    cancelled_at: { [Op.gte]: normalizedClosedAt }
                },
                {
                    completed_at: null,
                    failed_at: null,
                    cancelled_at: null,
                    created_at: { [Op.gte]: normalizedClosedAt }
                }
            ]
        };
        if (terminalId) where.original_terminal_id = String(terminalId).trim();
        const normalizedLocationId = toPositiveInt(locationId);
        if (normalizedLocationId) where.original_location_id = normalizedLocationId;

        const User = safeGetModel('User');
        const include = User ? [
            { model: User, as: 'originalCashier', attributes: ['user_id', 'username'], required: false },
            { model: User, as: 'actorUser', attributes: ['user_id', 'username'], required: false }
        ] : [];
        const rows = await PosTransactionAdjustment.findAll({
            where,
            include,
            order: [['created_at', 'ASC'], ['pos_transaction_adjustment_id', 'ASC']],
            transaction: options.transaction
        });
        const adjustments = normalizeReportAdjustmentRows(rows.map(toPlain));
        const summary = summarizeReportAdjustments(adjustments);
        return {
            post_close_adjustment_count: summary.adjustment_count,
            post_close_refund_amount: summary.succeeded_amount,
            post_close_pending_amount: summary.pending_amount,
            post_close_manual_review_amount: summary.manual_review_amount,
            post_close_adjustments: adjustments
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
        const where = {
            business_date: businessDate,
            reading_identifier: { [Op.like]: 'ZR-%' }
        };
        if (Object.prototype.hasOwnProperty.call(options, 'locationId')) {
            where.location_id = options.locationId;
        }
        const row = await PosZReadingSnapshot.findOne({
            where,
            order: [['generated_at', 'DESC'], ['pos_z_reading_snapshot_id', 'DESC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
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

    async getTerminalPairingPolicySettings(options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        if (!SystemSetting) return { active_registry: [] };
        const row = await SystemSetting.findOne({
            where: { setting_key: 'pos_terminal_registry' },
            attributes: ['setting_value', 'data_type'],
            transaction: options.transaction
        });
        const rawRegistry = row?.data_type === 'json'
            ? parseJsonLoosely(row.setting_value)
            : row?.setting_value;
        return { active_registry: normalizeTerminalPairingRegistry(rawRegistry) };
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
        const stockMap = await loadItemLocationStockMap([itemPayload.item_id], location_id);
        const [itemWithLocationStock] = Number.isInteger(Number.parseInt(location_id, 10)) && stockMap.locationScopeResolved
            ? applyItemLocationStockMap([itemPayload], stockMap.stockMap)
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
                pos_always_available: override?.pos_always_available === true,
                pos_best_seller_mode: ['force', 'never'].includes(override?.pos_best_seller_mode)
                    ? override.pos_best_seller_mode
                    : 'auto',
                pos_image_path: override?.pos_image_path || null,
                pos_image_url: override?.pos_image_url || null,
                pos_image_variants: deriveImageAssetVariantUrls({
                    storedPath: override?.pos_image_path || null,
                    storedUrl: override?.pos_image_url || null
                }),
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
                ...buildItemFolderInclude(),
                ...buildServiceDetailInclude(),
                ...buildFnbCatalogIncludes()
            ],
            order: [['name', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 100, 500)
        };

        try {
            const catalogItems = await applyCatalogOverrides(await Item.findAll(queryOptions), { includePrimaryBarcode: true });
            const stockMap = await loadItemLocationStockMap(
                catalogItems.map((item) => Number(item.item_id)),
                location_id
            );
            const normalizedLocationId = Number.parseInt(location_id, 10);
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && stockMap.locationScopeResolved
                ? applyItemLocationStockMap(catalogItems, stockMap.stockMap)
                : catalogItems;
        } catch (error) {
            if (!isMissingVatTypeColumnError(error)) {
                throw error;
            }

            const catalogItems = await applyCatalogOverrides(withLegacyVatFallback(await Item.findAll({
                ...queryOptions,
                attributes: BASE_POS_ITEM_ATTRIBUTES
            })), { includePrimaryBarcode: true });
            const stockMap = await loadItemLocationStockMap(
                catalogItems.map((item) => Number(item.item_id)),
                location_id
            );
            const normalizedLocationId = Number.parseInt(location_id, 10);
            return Number.isInteger(normalizedLocationId) && normalizedLocationId > 0 && stockMap.locationScopeResolved
                ? applyItemLocationStockMap(catalogItems, stockMap.stockMap)
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
                'mode_item_preset',
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
        const workflowMode = await getCurrentWorkflowMode();
        return items.map((item) => {
            const payload = toPlain(item);
            const override = overrideMap.get(payload.item_id);
            const readiness = buildPosReadiness({ item: payload, override });
            const recommendation = buildCatalogSetupRecommendation({
                item: payload,
                workflowMode,
                posReadiness: readiness
            });
            return {
                ...payload,
                pos_visible: resolveCatalogVisibility({ item: payload, override, surface: 'pos' }),
                pos_always_available: override?.pos_always_available === true,
                pos_image_url: override?.pos_image_url || null,
                pos_image_path: override?.pos_image_path || null,
                pos_image_variants: deriveImageAssetVariantUrls({
                    storedPath: override?.pos_image_path || null,
                    storedUrl: override?.pos_image_url || null
                }),
                has_override: Boolean(override),
                pos_readiness: readiness,
                catalog_setup_recommendation: recommendation
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
                'mode_item_preset',
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
        const workflowMode = await getCurrentWorkflowMode();
        const recommendation = buildCatalogSetupRecommendation({
            item: payload,
            workflowMode,
            posReadiness: readiness
        });
        const storefrontImageMap = await loadStorefrontCatalogImageMap([normalizedItemId]);
        const storefrontImage = storefrontImageMap.get(normalizedItemId);
        const posDisplayImage = resolvePosDisplayImage({ override: effectiveOverride, storefrontImage });

        return {
            item_id: payload.item_id,
            pos_visible: resolveCatalogVisibility({ item: payload, override: effectiveOverride, surface: 'pos' }),
            pos_always_available: effectiveOverride?.pos_always_available === true,
            pos_image_url: posDisplayImage.url,
            pos_image_path: posDisplayImage.path,
            pos_image_variants: posDisplayImage.variants,
            storefront_image_path: storefrontImage?.storefront_image_path || null,
            storefront_image_url: storefrontImage?.storefront_image_url || null,
            storefront_image_variants: deriveImageAssetVariantUrls({
                storedPath: storefrontImage?.storefront_image_path || null,
                storedUrl: storefrontImage?.storefront_image_url || null
            }),
            storefront_image_gallery: storefrontImage?.storefront_image_gallery || null,
            pos_readiness: readiness,
            catalog_setup_recommendation: recommendation
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
            pos_always_available: Object.prototype.hasOwnProperty.call(payload, 'pos_always_available')
                ? payload.pos_always_available === true
                : (existing?.pos_always_available ?? false),
            pos_best_seller_mode: Object.prototype.hasOwnProperty.call(payload, 'pos_best_seller_mode')
                ? payload.pos_best_seller_mode
                : (existing?.pos_best_seller_mode || 'auto'),
            pos_image_path: payload.pos_image_path ?? (existing?.pos_image_path ?? null),
            pos_image_url: payload.pos_image_url ?? (existing?.pos_image_url ?? null)
        };

        // Keep items.tracking_mode in sync so the untracked exemption this flag
        // grants is honoured on the Storefront too, not just POS (see
        // docs/features/INVENTORY_TRACKING_MODES.md's 'untracked' section).
        // Turning it on always wins (explicit operator intent). Turning it off
        // only clears tracking_mode when it's still exactly 'untracked' - if a
        // future direct tracking_mode API call set something else in between,
        // this toggle doesn't clobber that separate choice.
        if (Object.prototype.hasOwnProperty.call(payload, 'pos_always_available')) {
            const Item = dbStore.get('Item');
            if (Item) {
                if (nextPayload.pos_always_available) {
                    await Item.update(
                        { tracking_mode: 'untracked' },
                        { where: { item_id: itemId }, transaction }
                    );
                } else {
                    await Item.update(
                        { tracking_mode: null },
                        { where: { item_id: itemId, tracking_mode: 'untracked' }, transaction }
                    );
                }
            }
        }

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

    async findParkedSaleByIdempotencyKey(idempotencyKey, options = {}) {
        const PosParkedSale = dbStore.get('PosParkedSale');
        const normalizedKey = String(idempotencyKey || '').trim();
        if (!normalizedKey) return null;

        return PosParkedSale.findOne({
            where: { idempotency_key: normalizedKey },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
    },

    async createParkedSale(payload = {}, options = {}) {
        const PosParkedSale = dbStore.get('PosParkedSale');
        if (!PosParkedSale) throw new Error('PosParkedSale model is unavailable');

        try {
            const created = await PosParkedSale.create(payload, {
                transaction: options.transaction
            });
            return toPlain(created);
        } catch (error) {
            if (error?.name !== 'SequelizeUniqueConstraintError') throw error;

            const existing = await this.findParkedSaleByIdempotencyKey(
                payload.idempotency_key,
                options
            );
            if (existing) return toPlain(existing);
            throw error;
        }
    },

    async listParkedSales({
        shiftId = null,
        cashierId = null,
        locationId = null,
        sharedLocation = false,
        statuses = ['parked', 'claimed'],
        limit = 100
    } = {}, options = {}) {
        const PosParkedSale = dbStore.get('PosParkedSale');
        const where = {
            status: { [Op.in]: Array.isArray(statuses) && statuses.length > 0 ? statuses : ['parked', 'claimed'] }
        };
        if (!sharedLocation) {
            where.shift_id = toPositiveInt(shiftId);
            where.cashier_id = toPositiveInt(cashierId);
        }
        const normalizedLocationId = toPositiveInt(locationId);
        if (normalizedLocationId) where.location_id = normalizedLocationId;

        const rows = await PosParkedSale.findAll({
            where,
            order: [['created_at', 'DESC'], ['pos_parked_sale_id', 'DESC']],
            limit: Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 100)),
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async getParkedSaleById(parkedSaleId, options = {}) {
        const PosParkedSale = dbStore.get('PosParkedSale');
        const normalizedId = toPositiveInt(parkedSaleId);
        if (!normalizedId) return null;

        const row = await PosParkedSale.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return row ? toPlain(row) : null;
    },

    async updateParkedSale(parkedSaleId, payload = {}, options = {}) {
        const PosParkedSale = dbStore.get('PosParkedSale');
        const normalizedId = toPositiveInt(parkedSaleId);
        if (!normalizedId) return null;

        const row = await PosParkedSale.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async countActiveParkedSalesForShift(shiftId, options = {}) {
        const PosParkedSale = dbStore.get('PosParkedSale');
        return PosParkedSale.count({
            where: {
                shift_id: toPositiveInt(shiftId),
                // An unclaimed cart is branch-shared handoff work and may outlive
                // the shift that originally parked it. Only an actively claimed
                // cart remains an unresolved obligation of this shift.
                status: 'claimed'
            },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
    },

    async findPosPaymentSessionByIdempotencyKey(idempotencyKey, options = {}) {
        const PosPaymentSession = dbStore.get('PosPaymentSession');
        const normalizedKey = String(idempotencyKey || '').trim();
        if (!normalizedKey) return null;

        return PosPaymentSession.findOne({
            where: { idempotency_key: normalizedKey },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        }).then(toPlainPaymentSession);
    },

    async findPosPaymentSessionByCompletedTransactionId(transactionId, options = {}) {
        const PosPaymentSession = dbStore.get('PosPaymentSession');
        const normalizedId = toPositiveInt(transactionId);
        if (!normalizedId) return null;

        const row = await PosPaymentSession.findOne({
            where: { completed_transaction_id: normalizedId },
            order: [['completed_at', 'DESC'], ['pos_payment_session_id', 'DESC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlainPaymentSession(row);
    },

    async findActivePosPaymentSessionForScope(scope = {}, options = {}) {
        const PosPaymentSession = dbStore.get('PosPaymentSession');
        const cashierId = toPositiveInt(scope.cashierId);
        const shiftId = toPositiveInt(scope.shiftId);
        const locationId = toPositiveInt(scope.locationId);
        const terminalId = String(scope.terminalId || '').trim().toUpperCase();
        if (!cashierId || !shiftId || !locationId || !terminalId) return null;

        const row = await PosPaymentSession.findOne({
            where: {
                cashier_id: cashierId,
                shift_id: shiftId,
                location_id: locationId,
                terminal_id: terminalId,
                status: { [Op.in]: ['open', 'partially_paid', 'ready_to_complete'] }
            },
            order: [['created_at', 'DESC'], ['pos_payment_session_id', 'DESC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlainPaymentSession(row);
    },

    async listUnresolvedFundedPaymentSessionsForShift(shiftId, options = {}) {
        const PosPaymentSession = dbStore.get('PosPaymentSession');
        const normalizedShiftId = toPositiveInt(shiftId);
        if (!normalizedShiftId) return [];

        const rows = await PosPaymentSession.findAll({
            where: {
                shift_id: normalizedShiftId,
                status: { [Op.in]: ['open', 'partially_paid', 'ready_to_complete'] },
                paid_amount: { [Op.gt]: 0 }
            },
            order: [['created_at', 'ASC'], ['pos_payment_session_id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlainPaymentSession);
    },

    async listInFlightPaymentSessionsForShift(shiftId, options = {}) {
        const PosPaymentSession = dbStore.get('PosPaymentSession');
        const normalizedShiftId = toPositiveInt(shiftId);
        if (!PosPaymentSession || !normalizedShiftId) return [];

        const rows = await PosPaymentSession.findAll({
            where: {
                shift_id: normalizedShiftId,
                status: { [Op.in]: ['open', 'partially_paid', 'ready_to_complete'] }
            },
            order: [['created_at', 'ASC'], ['pos_payment_session_id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlainPaymentSession);
    },

    async findInFlightOperatorMutationForShift(shiftId, { staleBefore, transaction, lock = false } = {}) {
        const PosTerminalOperatorSession = dbStore.get('PosTerminalOperatorSession');
        const normalizedShiftId = toPositiveInt(shiftId);
        if (!PosTerminalOperatorSession || !normalizedShiftId) return null;
        const where = {
            pos_terminal_shift_id: normalizedShiftId,
            status: 'active',
            protected_operation_key: { [Op.ne]: null }
        };
        if (staleBefore) where.protected_operation_started_at = { [Op.gte]: staleBefore };
        const row = await PosTerminalOperatorSession.findOne({
            where,
            order: [['protected_operation_started_at', 'DESC']],
            transaction,
            lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
        });
        return row?.toJSON ? row.toJSON() : row || null;
    },

    async createPosPaymentSession(payload = {}, options = {}) {
        const PosPaymentSession = dbStore.get('PosPaymentSession');
        if (!PosPaymentSession) throw new Error('PosPaymentSession model is unavailable');

        try {
            const created = await PosPaymentSession.create(payload, { transaction: options.transaction });
            return toPlainPaymentSession(created);
        } catch (error) {
            if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
            const existing = await this.findPosPaymentSessionByIdempotencyKey(payload.idempotency_key, options);
            if (existing) return existing;
            throw error;
        }
    },

    async getPosPaymentSessionById(paymentSessionId, options = {}) {
        const PosPaymentSession = dbStore.get('PosPaymentSession');
        const normalizedId = toPositiveInt(paymentSessionId);
        if (!normalizedId) return null;

        const row = await PosPaymentSession.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlainPaymentSession(row);
    },

    async updatePosPaymentSession(paymentSessionId, payload = {}, options = {}) {
        const PosPaymentSession = dbStore.get('PosPaymentSession');
        const normalizedId = toPositiveInt(paymentSessionId);
        if (!normalizedId) return null;

        const row = await PosPaymentSession.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlainPaymentSession(row);
    },

    async listPosPaymentAllocationsForSession(paymentSessionId, options = {}) {
        const PosPaymentAllocation = dbStore.get('PosPaymentAllocation');
        const normalizedId = toPositiveInt(paymentSessionId);
        if (!normalizedId) return [];

        const rows = await PosPaymentAllocation.findAll({
            where: { session_id: normalizedId },
            order: [['created_at', 'ASC'], ['pos_payment_allocation_id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async findPosPaymentAllocationByIdempotencyKey(paymentSessionId, idempotencyKey, options = {}) {
        const PosPaymentAllocation = dbStore.get('PosPaymentAllocation');
        const normalizedSessionId = toPositiveInt(paymentSessionId);
        const normalizedKey = String(idempotencyKey || '').trim();
        if (!normalizedSessionId || !normalizedKey) return null;

        const row = await PosPaymentAllocation.findOne({
            where: { session_id: normalizedSessionId, idempotency_key: normalizedKey },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createPosPaymentAllocation(payload = {}, options = {}) {
        const PosPaymentAllocation = dbStore.get('PosPaymentAllocation');
        if (!PosPaymentAllocation) throw new Error('PosPaymentAllocation model is unavailable');

        try {
            const created = await PosPaymentAllocation.create(payload, { transaction: options.transaction });
            return toPlain(created);
        } catch (error) {
            if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
            const existing = await this.findPosPaymentAllocationByIdempotencyKey(
                payload.session_id,
                payload.idempotency_key,
                options
            );
            if (existing) return existing;
            throw error;
        }
    },

    async getPosPaymentAllocationById(allocationId, options = {}) {
        const PosPaymentAllocation = dbStore.get('PosPaymentAllocation');
        const normalizedId = toPositiveInt(allocationId);
        if (!normalizedId) return null;

        const row = await PosPaymentAllocation.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findPosPaymentAllocationByProviderEventId(providerEventId, options = {}) {
        const PosPaymentAllocation = dbStore.get('PosPaymentAllocation');
        const normalizedEventId = String(providerEventId || '').trim();
        if (!normalizedEventId) return null;

        const row = await PosPaymentAllocation.findOne({
            where: { provider_event_id: normalizedEventId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findPosPaymentAllocationByProviderRefundEventId(providerEventId, options = {}) {
        const PosPaymentAllocation = dbStore.get('PosPaymentAllocation');
        const normalizedEventId = String(providerEventId || '').trim();
        if (!normalizedEventId) return null;

        const row = await PosPaymentAllocation.findOne({
            where: { provider_refund_event_id: normalizedEventId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async updatePosPaymentAllocation(allocationId, payload = {}, options = {}) {
        const PosPaymentAllocation = dbStore.get('PosPaymentAllocation');
        const normalizedId = toPositiveInt(allocationId);
        if (!normalizedId) return null;

        const row = await PosPaymentAllocation.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async listPosTransactionAdjustmentsForTransaction(transactionId, options = {}) {
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        const normalizedTransactionId = toPositiveInt(transactionId);
        if (!normalizedTransactionId) return [];

        const User = safeGetModel('User');
        const include = User ? [
            { model: User, as: 'originalCashier', attributes: ['user_id', 'username'], required: false },
            { model: User, as: 'actorUser', attributes: ['user_id', 'username'], required: false },
            { model: User, as: 'approvedByUser', attributes: ['user_id', 'username'], required: false }
        ] : [];
        const rows = await PosTransactionAdjustment.findAll({
            where: { pos_transaction_id: normalizedTransactionId },
            include,
            order: [['created_at', 'ASC'], ['pos_transaction_adjustment_id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async listPosTransactionAdjustmentsForAllocation(allocationId, options = {}) {
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        const normalizedId = toPositiveInt(allocationId);
        if (!normalizedId) return [];

        const rows = await PosTransactionAdjustment.findAll({
            where: { pos_payment_allocation_id: normalizedId },
            order: [['created_at', 'ASC'], ['pos_transaction_adjustment_id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async findPosTransactionAdjustmentByIdempotencyKey(transactionId, idempotencyKey, options = {}) {
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        const normalizedTransactionId = toPositiveInt(transactionId);
        const normalizedKey = String(idempotencyKey || '').trim();
        if (!normalizedTransactionId || !normalizedKey) return null;

        const row = await PosTransactionAdjustment.findOne({
            where: { pos_transaction_id: normalizedTransactionId, idempotency_key: normalizedKey },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findPosTransactionAdjustmentByReference(adjustmentReference, options = {}) {
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        const normalizedReference = String(adjustmentReference || '').trim();
        if (!normalizedReference) return null;

        const row = await PosTransactionAdjustment.findOne({
            where: { adjustment_reference: normalizedReference },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findPosTransactionAdjustmentByProviderEventId(providerEventId, options = {}) {
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        const normalizedEventId = String(providerEventId || '').trim();
        if (!normalizedEventId) return null;

        const row = await PosTransactionAdjustment.findOne({
            where: { provider_event_id: normalizedEventId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createPosTransactionAdjustment(payload = {}, options = {}) {
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        if (!PosTransactionAdjustment) throw new Error('PosTransactionAdjustment model is unavailable');

        try {
            const created = await PosTransactionAdjustment.create(payload, { transaction: options.transaction });
            return toPlain(created);
        } catch (error) {
            if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
            const existing = await this.findPosTransactionAdjustmentByIdempotencyKey(
                payload.pos_transaction_id,
                payload.idempotency_key,
                options
            );
            if (existing) return existing;
            throw error;
        }
    },

    async updatePosTransactionAdjustment(adjustmentId, payload = {}, options = {}) {
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        const normalizedId = toPositiveInt(adjustmentId);
        if (!PosTransactionAdjustment || !normalizedId) return null;

        const row = await PosTransactionAdjustment.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async getPosTransactionAdjustmentById(adjustmentId, options = {}) {
        const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
        const normalizedId = toPositiveInt(adjustmentId);
        if (!normalizedId) return null;

        const row = await PosTransactionAdjustment.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
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
                    model: dbStore.get('User'),
                    as: 'cashier',
                    attributes: ['user_id', 'username', 'email'],
                    required: false
                },
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

    async listCashierShiftHistory({
        cashierId,
        locationId = null,
        dateFrom = null,
        dateTo = null,
        status = 'all',
        page = 1,
        limit = 20
    } = {}, options = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
        const normalizedLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 20));
        const where = {
            cashier_id: toPositiveInt(cashierId)
        };

        const normalizedLocationId = toPositiveInt(locationId);
        if (normalizedLocationId) where.location_id = normalizedLocationId;

        const normalizedStatus = String(status || 'all').trim().toLowerCase();
        if (normalizedStatus !== 'all') where.status = normalizedStatus;

        const normalizedDateFrom = normalizeBusinessDateValue(dateFrom);
        const normalizedDateTo = normalizeBusinessDateValue(dateTo);
        if (normalizedDateFrom || normalizedDateTo) {
            where.business_date = {};
            if (normalizedDateFrom) where.business_date[Op.gte] = normalizedDateFrom;
            if (normalizedDateTo) where.business_date[Op.lte] = normalizedDateTo;
        }

        const { rows, count } = await PosTerminalShift.findAndCountAll({
            where,
            include: [
                {
                    model: dbStore.get('User'),
                    as: 'cashier',
                    attributes: ['user_id', 'username', 'email'],
                    required: false
                },
                {
                    model: dbStore.get('TenantLocation'),
                    as: 'location',
                    attributes: ['location_id', 'name'],
                    required: false
                },
                {
                    model: dbStore.get('PosCashDrawerEvent'),
                    as: 'cashEvents',
                    required: false,
                    separate: true,
                    order: [['created_at', 'ASC']]
                }
            ],
            order: [
                ['business_date', 'DESC'],
                ['opened_at', 'DESC'],
                ['pos_terminal_shift_id', 'DESC']
            ],
            limit: normalizedLimit,
            offset: (normalizedPage - 1) * normalizedLimit,
            distinct: true,
            transaction: options.transaction
        });

        return {
            rows: rows.map(toPlain),
            pagination: {
                page: normalizedPage,
                limit: normalizedLimit,
                total: count,
                totalPages: Math.max(1, Math.ceil(count / normalizedLimit))
            }
        };
    },

    async listOpenTerminalShiftsForLocation({ locationId } = {}, options = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        return PosTerminalShift.findAll({
            where: {
                status: 'open',
                location_id: locationId
            },
            include: [
                {
                    model: dbStore.get('User'),
                    as: 'cashier',
                    attributes: ['user_id', 'username', 'email'],
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

    async countOpenTerminalShifts(options = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        return PosTerminalShift.count({
            where: { status: 'open' },
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

    async getTerminalOperatorSessionById(operatorSessionId, options = {}) {
        const PosTerminalOperatorSession = dbStore.get('PosTerminalOperatorSession');
        const normalizedId = toPositiveInt(operatorSessionId);
        if (!PosTerminalOperatorSession || !normalizedId) return null;
        const row = await PosTerminalOperatorSession.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createCashDrawerEvent(payload = {}, options = {}) {
        const PosCashDrawerEvent = dbStore.get('PosCashDrawerEvent');
        return PosCashDrawerEvent.create(payload, { transaction: options.transaction });
    },

    async getCashDrawerEventById(eventId, options = {}) {
        const PosCashDrawerEvent = dbStore.get('PosCashDrawerEvent');
        const normalizedId = toPositiveInt(eventId);
        if (!normalizedId) return null;

        const row = await PosCashDrawerEvent.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createAuditLog(payload = {}, options = {}) {
        const AuditLog = dbStore.get('AuditLog');
        if (!AuditLog) {
            throw new Error('AuditLog model is unavailable');
        }

        const changes = payload?.changes && typeof payload.changes === 'object'
            ? payload.changes
            : {};
        const eventType = String(
            payload.event_type
            || changes.event
            || changes.event_type
            || changes.operation
            || `${payload.entity_type || 'unknown'}.${String(payload.action || 'VIEW').toLowerCase()}`
        ).trim().slice(0, 100);
        const normalizedPayload = {
            ...payload,
            event_type: eventType || null,
            actor_username: payload.actor_username || changes.actor_username || null,
            terminal_id: payload.terminal_id || changes.terminal_id || null,
            shift_id: payload.shift_id || changes.shift_id || null,
            location_id: payload.location_id || changes.location_id || null,
            reason: payload.reason || changes.reason || changes.void_reason || changes.cancel_reason || null,
            request_id: payload.request_id || changes.request_id || null
        };

        const created = await AuditLog.create(normalizedPayload, {
            transaction: options.transaction
        });
        return toPlain(created);
    },

    async getReceiptPrintStatuses(posTransactionIds = []) {
        const AuditLog = dbStore.get('AuditLog');
        const normalizedIds = Array.from(new Set((Array.isArray(posTransactionIds) ? posTransactionIds : [])
            .map(toPositiveInt)
            .filter(Boolean)));
        if (!AuditLog || normalizedIds.length === 0) return {};

        const rows = await AuditLog.findAll({
            where: {
                entity_type: 'pos_device_receipt',
                entity_id: { [Op.in]: normalizedIds }
            },
            attributes: ['entity_id', 'changes', 'timestamp', 'log_id'],
            order: [['timestamp', 'DESC'], ['log_id', 'DESC']]
        });
        const statuses = {};
        rows.forEach((row) => {
            const id = toPositiveInt(row.entity_id);
            if (!id || statuses[id]) return;
            const changes = parseJsonLoosely(row.changes) || {};
            const bridgeResult = changes.bridge_result || changes.client_result || {};
            statuses[id] = {
                status: bridgeResult?.success === false || bridgeResult?.ok === false ? 'failed' : 'printed',
                printed_at: row.timestamp || null,
                reason_code: bridgeResult?.reason_code || null,
                message: bridgeResult?.message || null
            };
        });
        return statuses;
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

    async getMerchantTenderExpectedByShift(shiftId, options = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const PosPaymentAllocation = dbStore.get('PosPaymentAllocation');
        const methods = ['gcash', 'maya', 'card', 'bank_transfer'];
        const totals = Object.fromEntries(methods.map((method) => [method, 0]));
        const counts = Object.fromEntries(methods.map((method) => [method, 0]));

        // Ordinary walk-in digital sales are manual store tenders. Completed
        // split sales are excluded here because their provider identity is held
        // by the allocation ledger and is counted below.
        const directSales = await PosTransaction.findAll({
            where: buildFinanciallyRecognizedSalesWhere({
                shift_id: toPositiveInt(shiftId),
                order_source: 'in_store',
                payment_status: 'paid',
                payment_type: { [Op.in]: methods },
                payment_session_reference: { [Op.is]: null },
                [Op.and]: [{
                    [Op.or]: [
                        { payment_provider: { [Op.is]: null } },
                        { payment_provider: '' },
                        { payment_provider: 'merchant_owned' }
                    ]
                }]
            }),
            attributes: ['payment_type', 'total_amount'],
            raw: true,
            transaction: options.transaction
        });
        directSales.forEach((row) => {
            const method = String(row.payment_type || '').trim().toLowerCase();
            if (!methods.includes(method)) return;
            totals[method] = round4(totals[method] + Number(row.total_amount || 0));
            counts[method] += 1;
        });

        const splitAllocations = await PosPaymentAllocation.findAll({
            where: {
                shift_id: toPositiveInt(shiftId),
                status: 'successful',
                payment_provider: 'merchant_owned',
                payment_method: { [Op.in]: methods }
            },
            attributes: ['payment_method', 'applied_amount'],
            raw: true,
            transaction: options.transaction
        });
        splitAllocations.forEach((row) => {
            const method = String(row.payment_method || '').trim().toLowerCase();
            if (!methods.includes(method)) return;
            totals[method] = round4(totals[method] + Number(row.applied_amount || 0));
            counts[method] += 1;
        });

        return {
            breakdown: Object.fromEntries(methods.map((method) => [method, {
                amount: round4(totals[method]),
                count: counts[method]
            }])),
            total: round4(methods.reduce((sum, method) => sum + totals[method], 0))
        };
    },

    async findMerchantTenderReconciliationByIdempotencyKey(shiftId, idempotencyKey, options = {}) {
        const Model = dbStore.get('PosMerchantTenderReconciliation');
        return Model.findOne({
            where: { shift_id: toPositiveInt(shiftId), idempotency_key: idempotencyKey },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
    },

    async getLatestMerchantTenderReconciliation(shiftId, options = {}) {
        const Model = dbStore.get('PosMerchantTenderReconciliation');
        return Model.findOne({
            where: { shift_id: toPositiveInt(shiftId) },
            order: [['reviewed_at', 'DESC'], ['pos_merchant_tender_reconciliation_id', 'DESC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
    },

    async createMerchantTenderReconciliation(payload, options = {}) {
        const Model = dbStore.get('PosMerchantTenderReconciliation');
        return Model.create(payload, { transaction: options.transaction });
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

    async listOnlineOrderHistory({
        locationId = null,
        search = '',
        fulfillmentStatus = null,
        paymentStatus = null,
        page = 1,
        limit = 100
    } = {}) {
        const PosTransaction = dbStore.get('PosTransaction');
        const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
        const normalizedLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 100));
        const where = {
            order_source: 'online_store',
            [Op.and]: [
                {
                    [Op.or]: [
                        { fulfillment_status: { [Op.in]: ['cancelled', 'rejected'] } },
                        {
                            fulfillment_status: 'completed',
                            payment_status: { [Op.ne]: 'paid' }
                        }
                    ]
                }
            ]
        };
        if (locationId) where.location_id = locationId;
        if (fulfillmentStatus) where.fulfillment_status = fulfillmentStatus;
        if (paymentStatus) where.payment_status = paymentStatus;
        const normalizedSearch = String(search || '').trim();
        if (normalizedSearch) {
            where.invoice_number = { [Op.like]: `%${normalizedSearch}%` };
        }

        const { rows, count } = await PosTransaction.findAndCountAll({
            where,
            include: buildTransactionInclude(),
            distinct: true,
            order: [['created_at', 'DESC']],
            limit: normalizedLimit,
            offset: (normalizedPage - 1) * normalizedLimit
        });

        return {
            orders: rows.map(toPlain),
            pagination: {
                page: normalizedPage,
                limit: normalizedLimit,
                total: count,
                totalPages: Math.max(1, Math.ceil(count / normalizedLimit))
            }
        };
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
    },

    // Phase 148 (#825): the POS side of the `pos_order_payments` ledger. Phase 141 (#822) writes
    // row 1 (`kind: 'downpayment'`) from storeRepository.createOrderPaymentEntry on the storefront
    // checkout path; this is row 2 (`kind: 'balance'`), written when staff record the remaining
    // balance at handover. Deliberately a mirror of that method rather than an import of it -- the
    // POS module must not reach into the store module's repository, and both resolve the same
    // tenant-scoped model through dbStore anyway.
    //
    // Not to be confused with commercePayments/repositories/tenantOrderPaymentLedgerRepository.js
    // (Phase 144, #824), which writes the REVERSAL kinds from the landlord-scoped PayMongo webhook
    // path and therefore has to reach the tenant DB explicitly. This path is an ordinary
    // tenant-scoped POS request, so dbStore is in scope and the explicit connector is unnecessary.
    async createOrderPaymentEntry({
        posTransactionId,
        kind,
        status = 'successful',
        amount,
        paymentMethod,
        paymentProvider = null,
        providerEventId = null,
        paymentReference = null,
        idempotencyKey,
        relatedPosOrderPaymentId = null,
        recordedBy = null
    }, options = {}) {
        const PosOrderPayment = dbStore.get('PosOrderPayment');
        const created = await PosOrderPayment.create({
            pos_transaction_id: posTransactionId,
            kind,
            status,
            amount,
            payment_method: paymentMethod,
            payment_provider: paymentProvider,
            provider_event_id: providerEventId,
            payment_reference: paymentReference,
            idempotency_key: idempotencyKey,
            related_pos_order_payment_id: relatedPosOrderPaymentId,
            recorded_by: recordedBy,
            confirmed_at: new Date()
        }, { transaction: options.transaction });
        return created.pos_order_payment_id;
    },

    // Oldest row of a given kind for an order. Used to resolve the `downpayment` row a `balance`
    // row links back to via related_pos_order_payment_id (ADR 0069 clause 4b, carried forward by
    // ADR 0070) -- the same back-link convention tenantOrderPaymentLedgerRepository.js already
    // uses for refund/forfeiture rows.
    async findOrderPaymentEntryByKind(posTransactionId, kind, options = {}) {
        const PosOrderPayment = dbStore.get('PosOrderPayment');
        const row = await PosOrderPayment.findOne({
            where: { pos_transaction_id: posTransactionId, kind },
            order: [['pos_order_payment_id', 'ASC']],
            transaction: options.transaction
        });
        return toPlain(row);
    },

    async updateDeliveryJobByOrderId(orderId, payload = {}, options = {}) {
        const DeliveryJob = dbStore.get('DeliveryJob');
        const row = await DeliveryJob.findOne({
            where: { pos_transaction_id: orderId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async listActiveDeliveryPersonnel({ locationId = null, transaction = null } = {}) {
        const DeliveryPersonnel = dbStore.get('DeliveryPersonnel');
        const normalizedLocationId = toPositiveInt(locationId);
        const where = { is_active: true };
        if (normalizedLocationId) {
            where[Op.or] = [
                { location_id: null },
                { location_id: normalizedLocationId }
            ];
        }

        const rows = await DeliveryPersonnel.findAll({
            where,
            attributes: ['delivery_personnel_id', 'display_name', 'phone', 'location_id', 'is_active'],
            order: [['display_name', 'ASC'], ['delivery_personnel_id', 'ASC']],
            transaction
        });
        return rows.map(toPlain);
    },

    async findActiveDeliveryPersonnelById(deliveryPersonnelId, { locationId = null, transaction = null, lock = false } = {}) {
        const DeliveryPersonnel = dbStore.get('DeliveryPersonnel');
        const normalizedPersonnelId = toPositiveInt(deliveryPersonnelId);
        if (!normalizedPersonnelId) return null;

        const normalizedLocationId = toPositiveInt(locationId);
        const where = {
            delivery_personnel_id: normalizedPersonnelId,
            is_active: true
        };
        if (normalizedLocationId) {
            where[Op.or] = [
                { location_id: null },
                { location_id: normalizedLocationId }
            ];
        }

        const row = await DeliveryPersonnel.findOne({
            where,
            attributes: ['delivery_personnel_id', 'display_name', 'phone', 'location_id', 'is_active'],
            transaction,
            lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async assignDeliveryPersonnelToJob(orderId, payload = {}, options = {}) {
        const DeliveryJob = dbStore.get('DeliveryJob');
        const row = await DeliveryJob.findOne({
            where: { pos_transaction_id: orderId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update({
            delivery_personnel_id: payload.delivery_personnel_id ?? null,
            delivery_personnel_name: payload.delivery_personnel_name ?? null,
            assigned_by: payload.assigned_by,
            assigned_shift_id: payload.assigned_shift_id,
            assigned_at: payload.assigned_at,
            ...(payload.status ? { status: payload.status } : {})
        }, { transaction: options.transaction });
        return toPlain(row);
    }
};

assertPosRepositoryContract(posRepository);
