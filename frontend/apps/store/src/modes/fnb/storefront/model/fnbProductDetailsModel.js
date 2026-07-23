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
          };
        })
        .filter(Boolean);
      if (!options.length) return null;
      return {
        modifier_group_id: group.modifier_group_id ?? group.group_id ?? group.id ?? `group-${groupIndex}`,
        group_name: String(group.display_name || group.group_name || group.name || group.label || `Add-on Group ${groupIndex + 1}`).trim(),
        min_select: Number(group.min_select ?? group.min ?? 0) || 0,
        max_select: Number(group.max_select ?? group.max ?? options.length) || options.length,
        options,
      };
    })
    .filter(Boolean);
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
