const toPositiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const normalizeServiceOptionGroups = (item = {}) => (
  (Array.isArray(item?.service_option_groups) ? item.service_option_groups : [])
    .map((group) => ({
      group_id: toPositiveInteger(group?.group_id),
      name: String(group?.name || '').trim(),
      description: String(group?.description || '').trim(),
      group_type: group?.group_type === 'variation' ? 'variation' : 'addon',
      selection_type: group?.selection_type === 'multi' ? 'multi' : 'single',
      min_selections: Math.max(0, Number(group?.min_selections || 0)),
      max_selections: Math.max(1, Number(group?.max_selections || 1)),
      is_required: group?.is_required === true,
      options: (Array.isArray(group?.options) ? group.options : [])
        .map((option) => ({
          option_id: toPositiveInteger(option?.option_id),
          name: String(option?.name || '').trim(),
          description: String(option?.description || '').trim(),
          price_adjustment_centavos: Number(option?.price_adjustment_centavos || 0) || 0,
          duration_adjustment_minutes: Number(option?.duration_adjustment_minutes || 0) || 0
        }))
        .filter((option) => option.option_id && option.name)
    }))
    .filter((group) => group.group_id && group.name && group.options.length > 0)
);

export const buildDefaultServiceOptionSelection = (groups = []) => Object.fromEntries(
  groups.map((group) => {
    const shouldDefaultFirst = group.selection_type === 'single'
      && (group.is_required || group.min_selections > 0 || group.group_type === 'variation');
    return [String(group.group_id), shouldDefaultFirst ? [group.options[0].option_id] : []];
  })
);

export const resolveSelectedServiceOptions = (groups = [], selection = {}) => groups.flatMap((group) => {
  const selectedIds = new Set(
    (Array.isArray(selection?.[String(group.group_id)]) ? selection[String(group.group_id)] : [])
      .map(Number)
  );
  return group.options
    .filter((option) => selectedIds.has(Number(option.option_id)))
    .map((option) => ({
      ...option,
      group_id: group.group_id,
      group_name: group.name,
      group_type: group.group_type
    }));
});

export const isServiceOptionSelectionValid = (groups = [], selection = {}) => groups.every((group) => {
  const selectionCount = (Array.isArray(selection?.[String(group.group_id)])
    ? selection[String(group.group_id)]
    : []).length;
  const minimum = group.is_required ? Math.max(1, group.min_selections) : group.min_selections;
  return selectionCount >= minimum && selectionCount <= group.max_selections;
});

export const getServiceOptionAdjustedPrice = (basePrice, selectedOptions = []) => (
  (Number(basePrice) || 0)
  + selectedOptions.reduce(
    (total, option) => total + ((Number(option?.price_adjustment_centavos) || 0) / 100),
    0
  )
);
