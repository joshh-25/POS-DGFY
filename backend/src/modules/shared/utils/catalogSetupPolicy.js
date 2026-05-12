import {
    PLACEHOLDER_ITEM_TAXONOMY_MODES,
    resolveItemPreset
} from '../constants/modeItemTaxonomy.js';
import {
    DEFAULT_WORKFLOW_MODE,
    normalizeWorkflowMode
} from '../constants/workflowModes.js';
import {
    resolveCatalogVisibility,
    resolveStorefrontCatalogVisibility
} from './catalogVisibilityPolicy.js';
import { resolveItemFinancialPolicy } from './itemFinancialPolicy.js';
import { isStockExemptServiceItem } from './stockBearingPolicy.js';

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const toNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const toPositiveNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const normalizeToken = (value) => String(value || '').trim().toLowerCase();

const blocker = (code, label, fixHint) => ({
    code,
    label,
    fix_hint: fixHint
});

const scoreFromChecks = (checks) => {
    const values = Object.values(checks);
    const passingCount = values.filter(Boolean).length;
    return Math.round((passingCount / Math.max(values.length, 1)) * 100);
};

export const buildPosReadiness = ({ item, override }) => {
    const payload = toPlain(item) || {};
    const currentStock = toNumber(payload.current_stock, 0);
    const defaultSalePrice = toPositiveNumber(payload.default_sale_price);
    const status = normalizeToken(payload.status);
    const stockExempt = isStockExemptServiceItem(payload);

    const checks = {
        pos_visible: resolveCatalogVisibility({ item: payload, override, surface: 'pos' }) !== false,
        has_sale_price: defaultSalePrice > 0,
        stock_non_negative: currentStock >= 0,
        status_active: status === 'active',
        has_available_stock: stockExempt || currentStock > 0
    };

    const missingRequirements = [];
    if (!checks.pos_visible) {
        missingRequirements.push(blocker(
            'POS_VISIBILITY_DISABLED',
            'Enable POS visibility',
            'Turn on Show in POS Menu for this item.'
        ));
    }
    if (!checks.has_sale_price) {
        missingRequirements.push(blocker(
            'SALE_PRICE_MISSING',
            'Set a sale price',
            'Set default_sale_price above zero before selling in POS.'
        ));
    }
    if (!checks.stock_non_negative) {
        missingRequirements.push(blocker(
            'STOCK_INVALID',
            'Fix stock value',
            'Stock cannot be negative.'
        ));
    }
    if (!checks.status_active) {
        missingRequirements.push(blocker(
            'ITEM_NOT_ACTIVE',
            'Activate item',
            'Only active items are considered POS-ready.'
        ));
    }
    if (!checks.has_available_stock) {
        missingRequirements.push(blocker(
            'STOCK_UNAVAILABLE',
            'Add available stock',
            'Stock-bearing items need available stock before they can be sold in POS.'
        ));
    }

    return {
        ready: missingRequirements.length === 0,
        state: missingRequirements.length === 0 ? 'ready' : 'needs_attention',
        score: scoreFromChecks(checks),
        checks,
        missing_requirements: missingRequirements
    };
};

export const buildStorefrontReadiness = ({
    item,
    override = null,
    legacyPosOverride = null,
    forcedStorefrontVisible = null
} = {}) => {
    const payload = toPlain(item) || {};
    const effectiveOverride = forcedStorefrontVisible === null
        ? override
        : { ...(override || {}), storefront_visible: forcedStorefrontVisible === true };
    const storefrontVisible = resolveStorefrontCatalogVisibility({
        item: payload,
        override: effectiveOverride,
        legacyPosOverride
    }) !== false;
    const status = normalizeToken(payload.status);
    const hasSalePrice = toPositiveNumber(payload.default_sale_price) > 0;
    const hasImage = Boolean(
        effectiveOverride?.storefront_image_url
        || effectiveOverride?.storefront_image_path
        || legacyPosOverride?.pos_image_url
        || legacyPosOverride?.pos_image_path
    );
    const checks = {
        storefront_visible: storefrontVisible,
        has_sale_price: !storefrontVisible || hasSalePrice,
        status_active: status === 'active',
        has_image: hasImage
    };
    const missingRequirements = [];
    if (!checks.storefront_visible) {
        missingRequirements.push(blocker(
            'STOREFRONT_VISIBILITY_DISABLED',
            'Enable Storefront visibility',
            'Turn on Show in Storefront for this item.'
        ));
    }
    if (!checks.has_sale_price) {
        missingRequirements.push(blocker(
            'SALE_PRICE_MISSING',
            'Set a customer price',
            'Set default_sale_price above zero before showing this item to customers.'
        ));
    }
    if (!checks.status_active) {
        missingRequirements.push(blocker(
            'ITEM_NOT_ACTIVE',
            'Activate item',
            'Only active items are considered Storefront-ready.'
        ));
    }

    const blockingChecks = {
        storefront_visible: checks.storefront_visible,
        has_sale_price: checks.has_sale_price,
        status_active: checks.status_active
    };

    return {
        ready: Object.values(blockingChecks).every(Boolean),
        state: Object.values(blockingChecks).every(Boolean) ? 'ready' : 'needs_attention',
        score: scoreFromChecks(checks),
        checks,
        missing_requirements: missingRequirements,
        image_state: hasImage ? 'has_image' : 'missing_image'
    };
};

const isPlaceholderMode = (workflowMode) => (
    PLACEHOLDER_ITEM_TAXONOMY_MODES.includes(normalizeWorkflowMode(workflowMode))
);

const presetKey = (item = {}, workflowMode = DEFAULT_WORKFLOW_MODE) => {
    const explicit = normalizeToken(item.mode_item_preset);
    if (explicit) return explicit;
    return resolveItemPreset(workflowMode, explicit)?.key || '';
};

const isFinishedGoodsProduct = (item = {}) => (
    normalizeToken(item.category) === 'product'
    && normalizeToken(item.product_type) === 'finished_goods'
);

const resolveSellableCandidate = ({ item = {}, workflowMode = DEFAULT_WORKFLOW_MODE } = {}) => {
    const mode = normalizeWorkflowMode(workflowMode);
    const preset = presetKey(item, mode);
    const category = normalizeToken(item.category);

    if (mode === 'food_manufacturing') {
        return preset === 'finished_product' || isFinishedGoodsProduct(item);
    }
    if (mode === 'msme') {
        return ['product', 'supplies'].includes(preset) || ['product', 'supplies'].includes(category);
    }
    if (mode === 'services') {
        return ['service', 'physical_add_on'].includes(preset) || ['service', 'product'].includes(category);
    }
    if (mode === 'fnb') {
        return ['menu_item', 'packaged_beverage'].includes(preset) || isFinishedGoodsProduct(item);
    }
    return isFinishedGoodsProduct(item);
};

export const buildCatalogSetupRecommendation = ({
    item,
    workflowMode = DEFAULT_WORKFLOW_MODE,
    posReadiness = null,
    storefrontReadiness = null
} = {}) => {
    const payload = toPlain(item) || {};
    const mode = normalizeWorkflowMode(workflowMode);
    const financialPolicy = resolveItemFinancialPolicy({
        workflowMode: mode,
        item: payload,
        posVisible: posReadiness?.checks?.pos_visible === true,
        storefrontVisible: storefrontReadiness?.checks?.storefront_visible === true
    });
    const sellableCandidate = resolveSellableCandidate({ item: payload, workflowMode: mode });
    const needsSetup = Boolean(
        (posReadiness && posReadiness.ready !== true && sellableCandidate)
        || (storefrontReadiness && storefrontReadiness.ready !== true && sellableCandidate)
    );

    if (isPlaceholderMode(mode)) {
        return {
            code: 'placeholder_conservative_default',
            label: 'Placeholder mode: conservative default',
            surfaces: sellableCandidate ? ['pos', 'storefront'] : [],
            reason: 'This mode has not promoted a corrected item taxonomy yet.'
        };
    }

    if (!sellableCandidate) {
        return {
            code: 'keep_internal',
            label: 'Keep internal',
            surfaces: [],
            reason: 'This item type is mode-native internal inventory or supplies.'
        };
    }

    if (needsSetup) {
        return {
            code: 'needs_setup',
            label: 'Needs setup',
            surfaces: ['pos', 'storefront'],
            reason: financialPolicy.requires_cost
                ? 'Complete required pricing, cost, stock, and visibility fields before exposing this item.'
                : 'Complete required pricing, stock, and visibility fields before exposing this item.'
        };
    }

    return {
        code: 'recommended_for_pos_storefront',
        label: 'Recommended for POS and Storefront',
        surfaces: ['pos', 'storefront'],
        reason: 'This item matches the mode-native sellable catalog profile.'
    };
};

export default {
    buildPosReadiness,
    buildStorefrontReadiness,
    buildCatalogSetupRecommendation
};
