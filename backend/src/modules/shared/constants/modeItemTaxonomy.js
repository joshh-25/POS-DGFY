import { normalizeUom, getUomGroup } from '@sieitzz/shared-constants/uomConverter';
import { resolveModeItemTaxonomy } from '@sieitzz/shared-constants/modeItemTaxonomy';

export * from '@sieitzz/shared-constants/modeItemTaxonomy';

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
