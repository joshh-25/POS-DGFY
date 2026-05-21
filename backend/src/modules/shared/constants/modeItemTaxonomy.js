import { normalizeUom, getUomGroup } from '../../../utils/uomConverter.js';
import { normalizeWorkflowMode } from './workflowModes.js';

export const CORRECTED_ITEM_TAXONOMY_MODES = Object.freeze([
    'food_manufacturing',
    'msme',
    'services',
    'fnb',
    'hospitality'
]);

export const PLACEHOLDER_ITEM_TAXONOMY_MODES = Object.freeze([
    'retail',
    'healthcare',
    'ticketing_transport',
    'logistics_distribution',
    'education_institutions'
]);

export const ITEM_STOCK_BEHAVIOR = Object.freeze({
    STOCK_BEARING: 'stock_bearing',
    STOCK_EXEMPT: 'stock_exempt'
});

export const ITEM_FINANCIAL_VISIBILITY = Object.freeze({
    VISIBLE: 'visible',
    SELLABLE_ONLY: 'sellable_only',
    HIDDEN_OPTIONAL: 'hidden_optional'
});

export const ITEM_FINANCIAL_REQUIREMENT = Object.freeze({
    NEVER: 'never',
    ACTIVE: 'active',
    WHEN_SELLABLE: 'when_sellable'
});

const buildFinancialProfile = ({
    stock_behavior,
    cost_visibility = stock_behavior === ITEM_STOCK_BEHAVIOR.STOCK_EXEMPT
        ? ITEM_FINANCIAL_VISIBILITY.HIDDEN_OPTIONAL
        : ITEM_FINANCIAL_VISIBILITY.VISIBLE,
    sale_price_visibility = ITEM_FINANCIAL_VISIBILITY.SELLABLE_ONLY,
    cost_required = ITEM_FINANCIAL_REQUIREMENT.NEVER,
    sale_price_required = ITEM_FINANCIAL_REQUIREMENT.WHEN_SELLABLE
} = {}) => Object.freeze({
    cost_visibility,
    sale_price_visibility,
    cost_required,
    sale_price_required
});

const preset = ({
    key,
    label,
    category,
    product_type = null,
    default_unit,
    allowed_uom_groups = [],
    allowed_uoms = [],
    stock_behavior = ITEM_STOCK_BEHAVIOR.STOCK_BEARING,
    fifo_enabled = stock_behavior === ITEM_STOCK_BEHAVIOR.STOCK_BEARING,
    max_capacity = 100,
    financial_profile = {}
}) => Object.freeze({
    key,
    label,
    category,
    product_type,
    default_unit: normalizeUom(default_unit),
    allowed_uom_groups: Object.freeze([...allowed_uom_groups]),
    allowed_uoms: Object.freeze([...new Set([default_unit, ...allowed_uoms].map((uom) => normalizeUom(uom)).filter(Boolean))]),
    stock_behavior,
    fifo_enabled,
    max_capacity,
    financial_profile: buildFinancialProfile({
        stock_behavior,
        ...financial_profile
    })
});

const taxonomy = ({ mode, label, default_preset, presets }) => Object.freeze({
    mode,
    label,
    corrected: true,
    default_preset,
    presets: Object.freeze(presets),
    allowed_categories: Object.freeze([...new Set(presets.map((entry) => entry.category))])
});

export const MODE_ITEM_TAXONOMY = Object.freeze({
    food_manufacturing: taxonomy({
        mode: 'food_manufacturing',
        label: 'Food Manufacturing',
        default_preset: 'raw_material',
        presets: [
            preset({ key: 'raw_material', label: 'Raw Material / Ingredient', category: 'raw_material', default_unit: 'kg', allowed_uom_groups: ['weight', 'volume', 'count'], allowed_uoms: ['kg', 'g', 'mL', 'L', 'pcs'], max_capacity: 300 }),
            preset({ key: 'packaging', label: 'Packaging', category: 'packaging', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'case', 'carton', 'box'], max_capacity: 300 }),
            preset({ key: 'supplies', label: 'Supplies', category: 'supplies', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'case', 'box'], max_capacity: 300 }),
            preset({ key: 'finished_product', label: 'Finished Product', category: 'product', product_type: 'finished_goods', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'box'], max_capacity: 1000, financial_profile: { sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE } })
        ]
    }),
    msme: taxonomy({
        mode: 'msme',
        label: 'Simple (MSME)',
        default_preset: 'supplies',
        presets: [
            preset({ key: 'product', label: 'Products', category: 'product', product_type: 'finished_goods', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'case', 'box'], max_capacity: 100, financial_profile: { sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE, cost_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE, sale_price_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE } }),
            preset({ key: 'supplies', label: 'Supplies', category: 'supplies', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'case', 'box'], max_capacity: 100, financial_profile: { sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE, cost_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE, sale_price_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE } })
        ]
    }),
    services: taxonomy({
        mode: 'services',
        label: 'Services',
        default_preset: 'service',
        presets: [
            preset({ key: 'service', label: 'Service', category: 'service', default_unit: 'service', allowed_uom_groups: ['presentation', 'time'], allowed_uoms: ['service', 'session', 'booking', 'hour'], stock_behavior: ITEM_STOCK_BEHAVIOR.STOCK_EXEMPT, fifo_enabled: false, max_capacity: 1, financial_profile: { sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE } }),
            preset({ key: 'physical_add_on', label: 'Physical Add-on / Product', category: 'product', product_type: 'finished_goods', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'bottle', 'case'], max_capacity: 100 }),
            preset({ key: 'supplies', label: 'Supplies', category: 'supplies', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'case'], max_capacity: 100 })
        ]
    }),
    fnb: taxonomy({
        mode: 'fnb',
        label: 'Food & Beverage',
        default_preset: 'menu_item',
        presets: [
            preset({ key: 'menu_item', label: 'Menu Item', category: 'product', product_type: 'finished_goods', default_unit: 'serving', allowed_uom_groups: ['presentation'], allowed_uoms: ['serving', 'portion'], fifo_enabled: false, max_capacity: 180, financial_profile: { sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE } }),
            preset({ key: 'ingredient', label: 'Ingredient', category: 'raw_material', default_unit: 'kg', allowed_uom_groups: ['weight', 'volume', 'count'], allowed_uoms: ['kg', 'g', 'mL', 'L', 'pcs'], max_capacity: 300 }),
            preset({ key: 'packaged_beverage', label: 'Packaged Beverage / Retail Item', category: 'product', product_type: 'finished_goods', default_unit: 'bottle', allowed_uom_groups: ['packaging', 'count', 'volume'], allowed_uoms: ['bottle', 'can', 'pcs', 'mL', 'L', 'case'], max_capacity: 180, financial_profile: { sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE } }),
            preset({ key: 'packaging_supply', label: 'Packaging / To-go Supply', category: 'packaging', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'case', 'carton', 'box', 'bag'], max_capacity: 300 })
        ]
    }),
    hospitality: taxonomy({
        mode: 'hospitality',
        label: 'Hospitality',
        default_preset: 'room_night',
        presets: [
            preset({ key: 'room_night', label: 'Room Night / Accommodation', category: 'service', default_unit: 'room_night', allowed_uom_groups: ['time', 'presentation'], allowed_uoms: ['room_night', 'booking'], stock_behavior: ITEM_STOCK_BEHAVIOR.STOCK_EXEMPT, fifo_enabled: false, max_capacity: 1, financial_profile: { sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE } }),
            preset({ key: 'paid_amenity', label: 'Paid Amenity / Add-on', category: 'service', default_unit: 'service', allowed_uom_groups: ['presentation', 'time'], allowed_uoms: ['service', 'booking', 'hour'], stock_behavior: ITEM_STOCK_BEHAVIOR.STOCK_EXEMPT, fifo_enabled: false, max_capacity: 1, financial_profile: { sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE } }),
            preset({ key: 'facility_booking', label: 'Facility Booking', category: 'service', default_unit: 'booking', allowed_uom_groups: ['presentation', 'time'], allowed_uoms: ['booking', 'hour'], stock_behavior: ITEM_STOCK_BEHAVIOR.STOCK_EXEMPT, fifo_enabled: false, max_capacity: 1, financial_profile: { sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE } }),
            preset({ key: 'minibar_retail_product', label: 'Minibar / Retail Product', category: 'product', product_type: 'finished_goods', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging', 'volume'], allowed_uoms: ['pcs', 'bottle', 'can', 'pack', 'case', 'mL', 'L'], max_capacity: 180, financial_profile: { cost_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE, sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE } }),
            preset({ key: 'physical_add_on', label: 'Physical Add-on', category: 'product', product_type: 'finished_goods', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'box', 'case'], max_capacity: 100, financial_profile: { cost_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE, sale_price_visibility: ITEM_FINANCIAL_VISIBILITY.VISIBLE } }),
            preset({ key: 'housekeeping_supply', label: 'Housekeeping Supply', category: 'supplies', default_unit: 'pcs', allowed_uom_groups: ['count', 'packaging'], allowed_uoms: ['pcs', 'pack', 'box', 'case'], max_capacity: 300, financial_profile: { cost_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE } }),
            preset({ key: 'linen_reusable_asset', label: 'Linen / Reusable Asset', category: 'supplies', default_unit: 'pcs', allowed_uom_groups: ['count'], allowed_uoms: ['pcs'], max_capacity: 300, financial_profile: { cost_required: ITEM_FINANCIAL_REQUIREMENT.ACTIVE } })
        ]
    })
});

export const resolveModeItemTaxonomy = (workflowMode) => (
    MODE_ITEM_TAXONOMY[normalizeWorkflowMode(workflowMode)] || null
);

export const isCorrectedItemTaxonomyMode = (workflowMode) => Boolean(resolveModeItemTaxonomy(workflowMode));

export const getDefaultItemPreset = (workflowMode) => {
    const taxonomyConfig = resolveModeItemTaxonomy(workflowMode);
    if (!taxonomyConfig) return null;
    return taxonomyConfig.presets.find((entry) => entry.key === taxonomyConfig.default_preset) || taxonomyConfig.presets[0] || null;
};

export const findItemPresetForValues = (workflowMode, { category, product_type, unit_of_measure } = {}) => {
    const taxonomyConfig = resolveModeItemTaxonomy(workflowMode);
    if (!taxonomyConfig) return null;
    const normalizedUnit = normalizeUom(unit_of_measure);
    return taxonomyConfig.presets.find((entry) => (
        entry.category === category
        && (entry.category !== 'product' || entry.product_type === product_type)
        && (
            !normalizedUnit
            || entry.allowed_uoms.includes(normalizedUnit)
            || (entry.allowed_uoms.length === 0 && entry.allowed_uom_groups.includes(getUomGroup(normalizedUnit)))
        )
    )) || taxonomyConfig.presets.find((entry) => (
        entry.category === category
        && (entry.category !== 'product' || entry.product_type === product_type)
    )) || null;
};

export const resolveItemPreset = (workflowMode, presetKey) => {
    const taxonomyConfig = resolveModeItemTaxonomy(workflowMode);
    if (!taxonomyConfig) return null;
    return taxonomyConfig.presets.find((entry) => entry.key === presetKey) || null;
};

export const resolveItemPresetOrDefault = (workflowMode, presetKey) => {
    const taxonomyConfig = resolveModeItemTaxonomy(workflowMode);
    if (!taxonomyConfig) return null;
    return resolveItemPreset(workflowMode, presetKey) || getDefaultItemPreset(workflowMode);
};

export const resolveItemDefaultsForMode = (workflowMode) => {
    const presetConfig = getDefaultItemPreset(workflowMode);
    if (!presetConfig) return null;
    return {
        category: presetConfig.category,
        product_type: presetConfig.product_type,
        unit_of_measure: presetConfig.default_unit,
        max_capacity: presetConfig.max_capacity,
        fifo_enabled: presetConfig.fifo_enabled,
        stock_behavior: presetConfig.stock_behavior
    };
};

const httpError = (message, details = {}) => {
    const error = new Error(message);
    error.statusCode = 422;
    error.details = details;
    return error;
};

const isDraftStatus = (status) => String(status || '').trim().toLowerCase() === 'draft';

export const validateItemAgainstModeTaxonomy = ({
    workflowMode,
    itemData = {},
    existingItem = null,
    operation = 'create'
} = {}) => {
    const taxonomyConfig = resolveModeItemTaxonomy(workflowMode);
    if (!taxonomyConfig) return { ok: true, skipped: 'placeholder_mode' };

    const nextStatus = itemData.status ?? existingItem?.status ?? 'active';
    const shouldValidate = operation === 'create'
        ? !isDraftStatus(nextStatus)
        : operation === 'finalize'
            ? true
            : (
                !existingItem
                || itemData.status === 'active'
                || Object.prototype.hasOwnProperty.call(itemData, 'category')
                || Object.prototype.hasOwnProperty.call(itemData, 'product_type')
                || Object.prototype.hasOwnProperty.call(itemData, 'mode_item_preset')
                || Object.prototype.hasOwnProperty.call(itemData, 'unit_of_measure')
            );

    if (!shouldValidate) return { ok: true, skipped: 'legacy_edit_without_taxonomy_change' };

    const category = itemData.category ?? existingItem?.category;
    const productType = category === 'product'
        ? (itemData.product_type ?? existingItem?.product_type)
        : null;
    const unit = normalizeUom(itemData.unit_of_measure ?? existingItem?.unit_of_measure);
    const uomGroup = getUomGroup(unit);
    const presetKey = itemData.mode_item_preset ?? existingItem?.mode_item_preset ?? null;

    if (presetKey && !taxonomyConfig.presets.some((entry) => entry.key === presetKey)) {
        throw httpError(`${taxonomyConfig.label} mode does not support item preset "${presetKey}"`, {
            reason_code: 'MODE_ITEM_PRESET_UNSUPPORTED',
            workflow_mode: taxonomyConfig.mode,
            mode_item_preset: presetKey,
            allowed_presets: taxonomyConfig.presets.map((entry) => entry.key)
        });
    }

    const candidatePresets = presetKey
        ? taxonomyConfig.presets.filter((entry) => entry.key === presetKey)
        : taxonomyConfig.presets;

    const categoryMatches = candidatePresets.filter((entry) => (
        entry.category === category
        && (entry.category !== 'product' || entry.product_type === productType)
    ));

    if (categoryMatches.length === 0) {
        throw httpError(`${taxonomyConfig.label} mode does not support category/product type combination ${category}${productType ? `/${productType}` : ''}`, {
            reason_code: 'MODE_ITEM_CATEGORY_UNSUPPORTED',
            workflow_mode: taxonomyConfig.mode,
            allowed_presets: taxonomyConfig.presets.map((entry) => ({
                key: entry.key,
                label: entry.label,
                category: entry.category,
                product_type: entry.product_type
            }))
        });
    }

    const unitMatches = categoryMatches.filter((entry) => (
        entry.allowed_uoms.includes(unit)
        || (entry.allowed_uoms.length === 0 && entry.allowed_uom_groups.includes(uomGroup))
    ));

    if (unitMatches.length === 0) {
        throw httpError(`${taxonomyConfig.label} mode does not support unit_of_measure "${unit || ''}" for ${category}`, {
            reason_code: 'MODE_ITEM_UOM_UNSUPPORTED',
            workflow_mode: taxonomyConfig.mode,
            category,
            product_type: productType,
            unit_of_measure: unit,
            allowed_uoms: [...new Set(categoryMatches.flatMap((entry) => entry.allowed_uoms))],
            allowed_uom_groups: [...new Set(categoryMatches.flatMap((entry) => entry.allowed_uom_groups))]
        });
    }

    return {
        ok: true,
        taxonomy: taxonomyConfig.mode,
        preset: unitMatches[0]
    };
};
