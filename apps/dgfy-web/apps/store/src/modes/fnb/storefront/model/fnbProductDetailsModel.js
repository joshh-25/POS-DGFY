function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeFnbModifierGroups(item = {}) {
  return asArray(item?.fnb_modifier_groups)
    .map((group, groupIndex) => {
      if (!group || typeof group !== 'object' || Array.isArray(group)) return null;
      const options = asArray(group.options || group.modifier_options || group.items)
        .map((option, optionIndex) => {
          if (!option || typeof option !== 'object' || Array.isArray(option)) return null;
          const optionName = String(option.option_name || option.name || option.label || '').trim();
          if (!optionName) return null;
          return {
            modifier_option_id: option.modifier_option_id ?? option.option_id ?? option.id ?? `option-${groupIndex}-${optionIndex}`,
            option_name: optionName,
            price_delta: Number(option.price_delta ?? option.price ?? option.default_sale_price ?? 0) || 0,
            is_default: option.is_default === true,
          };
        })
        .filter(Boolean);
      if (!options.length) return null;
      return {
        modifier_group_id: group.modifier_group_id ?? group.group_id ?? group.id ?? `group-${groupIndex}`,
        group_name: String(group.display_name || group.group_name || group.name || group.label || `Add-on Group ${groupIndex + 1}`).trim(),
        group_kind: group.group_kind === 'combo_choice' ? 'combo_choice' : 'modifier',
        parent_modifier_option_id: group.parent_modifier_option_id ? Number(group.parent_modifier_option_id) : null,
        min_select: Number(group.min_select ?? group.min ?? 0) || 0,
        max_select: Number(group.max_select ?? group.max ?? options.length) || options.length,
        required: group.required === true || Number(group.min_select ?? group.min ?? 0) > 0,
        options,
      };
    })
    .filter(Boolean);
}

export function hasRequiredFnbModifierGroups(item = {}) {
  return asArray(item?.fnb_modifier_groups).some((group) => (
    group
    && typeof group === 'object'
    && (group.required === true || Number(group.min_select ?? group.min ?? 0) > 0)
  ));
}

export function buildDefaultFnbModifierSelections(modifierGroups = []) {
  return (Array.isArray(modifierGroups) ? modifierGroups : []).flatMap((group) => {
    const limit = Math.max(0, Number(group?.max_select || 0));
    const defaults = (Array.isArray(group?.options) ? group.options : []).filter((option) => option?.is_default === true);
    return (limit > 0 ? defaults.slice(0, limit) : defaults).map((option) => ({
      modifier_group_id: group.modifier_group_id,
      modifier_option_id: option.modifier_option_id,
      option_name: option.option_name,
      price_delta: Number(option.price_delta || 0),
      quantity: 1
    }));
  });
}

export function validateFnbModifierSelections(modifierGroups = [], selectedModifiers = []) {
  const selected = Array.isArray(selectedModifiers) ? selectedModifiers : [];
  for (const group of Array.isArray(modifierGroups) ? modifierGroups : []) {
    if (group?.parent_modifier_option_id && !selected.some((entry) => Number(entry?.modifier_option_id) === Number(group.parent_modifier_option_id))) continue;
    const count = selected.filter((entry) => Number(entry?.modifier_group_id) === Number(group?.modifier_group_id)).length;
    const minimum = group?.required === true
      ? Math.max(1, Number(group?.min_select || 0))
      : Math.max(0, Number(group?.min_select || 0));
    const maximum = Math.max(0, Number(group?.max_select || 0));
    if (count < minimum) return { valid: false, groupId: group.modifier_group_id, message: `${group.group_name} requires at least ${minimum} selection${minimum === 1 ? '' : 's'}.` };
    if (maximum > 0 && count > maximum) return { valid: false, groupId: group.modifier_group_id, message: `${group.group_name} allows at most ${maximum} selection${maximum === 1 ? '' : 's'}.` };
  }
  return { valid: true, groupId: null, message: '' };
}

export function buildFnbNutritionCards(item = {}) {
  const nutrition = asObject(item?.nutrition);
  if (!nutrition) return [];
  return Object.entries(nutrition)
    .map(([label, value]) => ({ label: String(label || '').trim(), value: String(value ?? '').trim() }))
    .filter((entry) => entry.label && entry.value)
    .slice(0, 8);
}

export function buildFnbAllergens(item = {}) {
  return asArray(item?.allergens)
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') return String(entry.allergen_name || entry.label || entry.name || '').trim();
      return '';
    })
    .filter(Boolean)
    .slice(0, 8);
}

export function countSelectedModifiersByGroup(selectedModifiers = []) {
  return (Array.isArray(selectedModifiers) ? selectedModifiers : []).reduce((counts, entry) => {
    if (entry?.modifier_group_id == null) return counts;
    const key = String(entry.modifier_group_id);
    counts[key] = Number(counts[key] || 0) + 1;
    return counts;
  }, {});
}

export function resolveFnbProductDetailItem({
  selectedDetail,
  routeItemId,
  catalog
}) {
  if (selectedDetail) return selectedDetail;
  if (!routeItemId) return null;
  return (Array.isArray(catalog) ? catalog : []).find((item) => String(item?.item_id) === String(routeItemId)) || null;
}

export function buildFnbProductDetailMetadata({
  detailItem,
  selectedModifiers
}) {
  return {
    modifierGroups: normalizeFnbModifierGroups(detailItem),
    modifierCounts: countSelectedModifiersByGroup(selectedModifiers),
    nutritionCards: buildFnbNutritionCards(detailItem),
    allergens: buildFnbAllergens(detailItem)
  };
}

export function buildFnbRelatedItems({
  detailItem,
  menuItems,
  limit = 3
}) {
  if (!detailItem) return [];
  const currentSection = String(detailItem.sectionKey || '').trim();
  const currentItemId = Number(detailItem.item_id);
  const baseItems = Array.isArray(menuItems) ? menuItems : [];
  const sameSection = baseItems.filter((item) => (
    Number(item?.item_id) !== currentItemId
    && String(item?.sectionKey || '').trim() === currentSection
  ));
  const fallbackItems = baseItems.filter((item) => Number(item?.item_id) !== currentItemId);
  return (sameSection.length > 0 ? sameSection : fallbackItems).slice(0, limit);
}
