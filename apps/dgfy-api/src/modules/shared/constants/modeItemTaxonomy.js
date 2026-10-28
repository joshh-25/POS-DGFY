import { normalizeUom, getUomGroup } from '@sieitzz/shared-constants/uomConverter';
import { resolveEffectiveItemTaxonomy } from '@sieitzz/shared-constants/modeItemTaxonomy';
import { resolveEffectiveCapabilities } from '@sieitzz/shared-constants/workflowModes';

export * from '@sieitzz/shared-constants/modeItemTaxonomy';

const httpError = (message, details = {}) => {
    const error = new Error(message);
    error.statusCode = 422;
    error.details = details;
    return error;
};

const isDraftStatus = (status) => String(status || '').trim().toLowerCase() === 'draft';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const presetMatchesItemShape = (presetConfig, { category, productType }) => (
    presetConfig.category === category
    && (category !== 'product' || !productType || presetConfig.product_type === productType)
);

const presetAllowsUnit = (presetConfig, unit) => {
    const normalizedUnit = normalizeUom(unit);
    if (!normalizedUnit) return false;
    return presetConfig.allowed_uoms.includes(normalizedUnit)
        || (presetConfig.allowed_uoms.length === 0 && presetConfig.allowed_uom_groups.includes(getUomGroup(normalizedUnit)));
};

const resolvePosPreset = ({ taxonomyConfig, category, productType, unit, requestedPresetKey }) => {
    const categoryPresets = taxonomyConfig.presets.filter((entry) => presetMatchesItemShape(entry, { category, productType }));
    const allCategoryPresets = taxonomyConfig.presets.filter((entry) => entry.category === category);
    const candidatePresets = categoryPresets.length > 0
        ? categoryPresets
        : category === 'product'
            ? allCategoryPresets
            : [];
    if (candidatePresets.length === 0) return null;

    const requestedPreset = taxonomyConfig.presets.find((entry) => entry.key === requestedPresetKey);
    if (requestedPreset && presetMatchesItemShape(requestedPreset, { category, productType })) {
        return requestedPreset;
    }

    // An invalid or mismatched preset came from another catalog surface (for
    // example, IMS's `finished_product` sent to an F&B POS). Prefer the
    // taxonomy's default sellable product rather than inferring a different
    // product type from a stale unit value.
    if (requestedPresetKey) {
        const defaultProductPreset = taxonomyConfig.presets.find((entry) => (
            entry.key === taxonomyConfig.default_preset
            && entry.category === category
        ));
        if (defaultProductPreset) return defaultProductPreset;
    }

    return candidatePresets.find((entry) => presetAllowsUnit(entry, unit))
        || candidatePresets.find((entry) => entry.key === taxonomyConfig.default_preset)
        || candidatePresets[0];
};

/**
 * Normalize catalog data originating from POS before applying the normal
 * mode-taxonomy validator. POS and IMS share the catalog and persistence
 * path, but POS's sellable item editor should not fail because a stale IMS
 * preset or unit was included in the request. This changes only taxonomy
 * fields and leaves authentication, permissions, inventory-authority gates,
 * and repository validation untouched.
 */
export const normalizePosCatalogItemData = ({
    workflowMode,
    enabledCapabilities = [],
    disabledCapabilities = [],
    itemData = {},
    existingItem = null
} = {}) => {
    const effectiveCapabilities = resolveEffectiveCapabilities(workflowMode, enabledCapabilities, disabledCapabilities);
    const taxonomyConfig = resolveEffectiveItemTaxonomy(workflowMode, effectiveCapabilities);
    if (!taxonomyConfig) return itemData;

    const hasTaxonomyInput = !existingItem || [
        'category',
        'product_type',
        'mode_item_preset',
        'unit_of_measure'
    ].some((key) => hasOwn(itemData, key));
    if (!hasTaxonomyInput) return itemData;

    const category = itemData.category ?? existingItem?.category;
    if (!category) return itemData;

    const productType = category === 'product'
        ? (itemData.product_type ?? existingItem?.product_type)
        : null;
    const unit = itemData.unit_of_measure ?? existingItem?.unit_of_measure;
    const requestedPresetKey = itemData.mode_item_preset ?? existingItem?.mode_item_preset;
    const selectedPreset = resolvePosPreset({
        taxonomyConfig,
        category,
        productType,
        unit,
        requestedPresetKey
    });
    if (!selectedPreset) return itemData;

    const normalizedData = { ...itemData };
    normalizedData.mode_item_preset = selectedPreset.key;
    if (selectedPreset.category === 'product') {
        normalizedData.product_type = selectedPreset.product_type;
    }
    normalizedData.unit_of_measure = presetAllowsUnit(selectedPreset, unit)
        ? normalizeUom(unit)
        : selectedPreset.default_unit;
    return normalizedData;
};

export const validateItemAgainstModeTaxonomy = ({
    workflowMode,
    enabledCapabilities = [],
    disabledCapabilities = [],
    itemData = {},
    existingItem = null,
    operation = 'create'
} = {}) => {
    // Issue #178 Phase 21: resolve through the FULL effective capability set
    // (base mode ∪ enabled) \ disabled, not just the raw enabled overlay.
    // Before this, a capability that was additively enabled and later
    // subtracted (e.g. a tenant that turned on `services` and then disabled
    // it again) still granted that mode's item-taxonomy presets forever -
    // resolveEffectiveItemTaxonomy only ever saw the enabled list, never the
    // subtraction. resolveEffectiveItemTaxonomy already ignores any
    // capability equal to the base mode itself (taxonomyMode !==
    // baseConfig.mode), so passing the wider effective set here changes
    // nothing for the base mode's own capabilities - only for overlay ones.
    const effectiveCapabilities = resolveEffectiveCapabilities(workflowMode, enabledCapabilities, disabledCapabilities);
    const taxonomyConfig = resolveEffectiveItemTaxonomy(workflowMode, effectiveCapabilities);
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
