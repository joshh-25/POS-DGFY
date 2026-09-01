const locationOverride = (entry, locationId) => (
  (entry?.locationAvailability || []).find(
    (row) => Number(row.location_id) === Number(locationId)
  )
);

export const isAvailableFnbModifierGroup = (group, locationId) => (
  group?.is_active !== false
  && group?.visible_in_pos !== false
  && locationOverride(group, locationId)?.is_available !== false
);

export const isAvailableFnbModifierOption = (option, locationId) => (
  option?.is_active !== false
  && option?.visible_in_pos !== false
  && option?.is_sold_out !== true
  && locationOverride(option, locationId)?.is_available !== false
  && locationOverride(option, locationId)?.is_sold_out !== true
);

export const getFnbModifierGroupMinimum = (group) => {
  const through = group?.FnbItemModifierGroup || group?.fnbItemModifierGroup || {};
  const required = through.is_required_override == null
    ? group.required === true
    : through.is_required_override === true;
  return required
    ? Math.max(1, Number(group.min_select || 0))
    : 0;
};

export const validateFnbModifierSelections = (
  groups = [],
  selections = [],
  locationId = null
) => {
  for (const group of groups.filter((entry) => isAvailableFnbModifierGroup(entry, locationId))) {
    if (
      group.parent_modifier_option_id
      && !selections.some(
        (entry) => Number(entry.modifier_option_id) === Number(group.parent_modifier_option_id)
      )
    ) continue;

    const count = selections.filter(
      (entry) => Number(entry.modifier_group_id) === Number(group.modifier_group_id)
    ).length;
    const min = getFnbModifierGroupMinimum(group);
    const max = Math.max(1, Number(group.max_select || 1));
    if (count < min || count > max) {
      return `${group.display_name || group.name} requires ${min}–${max} selection${max === 1 ? '' : 's'}.`;
    }
  }
  return '';
};
