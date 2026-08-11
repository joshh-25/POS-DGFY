const toPlain = (value) => (
  value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

const getThrough = (group, names = []) => {
  for (const name of names) {
    if (group?.[name]) return toPlain(group[name]);
  }
  return {};
};

const getGroupId = (group, through = {}) => {
  const id = group?.modifier_group_id ?? through.modifier_group_id;
  const normalized = Number.parseInt(id, 10);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const sortAssignments = (left, right) => {
  const leftOrder = Number.isFinite(Number(left?.assignment?.sort_order)) ? Number(left.assignment.sort_order) : 0;
  const rightOrder = Number.isFinite(Number(right?.assignment?.sort_order)) ? Number(right.assignment.sort_order) : 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const leftGroupOrder = Number.isFinite(Number(left?.group?.sort_order)) ? Number(left.group.sort_order) : 0;
  const rightGroupOrder = Number.isFinite(Number(right?.group?.sort_order)) ? Number(right.group.sort_order) : 0;
  if (leftGroupOrder !== rightGroupOrder) return leftGroupOrder - rightGroupOrder;
  return String(left?.group?.name || left?.group?.display_name || '').localeCompare(
    String(right?.group?.name || right?.group?.display_name || ''),
    undefined,
    { sensitivity: 'base' }
  );
};

/**
 * Combines folder-level and item-level assignments without mutating Sequelize rows.
 * Item assignments win over inherited rows; `is_excluded` removes one inherited group.
 */
export const resolveEffectiveFnbModifierGroups = (item = {}) => {
  const folder = toPlain(item?.folder || item?.ItemFolder || {});
  const folderGroups = item?.folder?.fnbModifierGroups
    || item?.folder?.FnbModifierGroups
    || folder?.fnbModifierGroups
    || [];
  const directGroups = item?.fnbModifierGroups
    || item?.FnbModifierGroups
    || item?.fnb_modifier_groups
    || [];
  const effective = new Map();

  for (const rawGroup of Array.isArray(folderGroups) ? folderGroups : []) {
    const group = toPlain(rawGroup);
    const assignment = getThrough(group, ['FnbFolderModifierGroup', 'fnbFolderModifierGroup']);
    const id = getGroupId(group, assignment);
    if (!id) continue;
    effective.set(id, {
      group,
      assignment: {
        ...assignment,
        modifier_group_id: id,
        assignment_source: 'folder',
        assignment_folder_id: Number(folder?.folder_id) || assignment.folder_id || null
      }
    });
  }

  for (const rawGroup of Array.isArray(directGroups) ? directGroups : []) {
    const group = toPlain(rawGroup);
    const assignment = getThrough(group, ['FnbItemModifierGroup', 'fnbItemModifierGroup']);
    const id = getGroupId(group, assignment);
    if (!id) continue;
    if (assignment.is_excluded === true) {
      effective.delete(id);
      continue;
    }
    effective.set(id, {
      group,
      assignment: {
        ...assignment,
        modifier_group_id: id,
        assignment_source: 'item',
        assignment_item_id: Number(item?.item_id) || assignment.item_id || null
      }
    });
  }

  return [...effective.values()]
    .sort(sortAssignments)
    .map(({ group, assignment }) => ({
      ...group,
      modifier_group_id: getGroupId(group, assignment),
      FnbItemModifierGroup: assignment,
      fnbItemModifierGroup: assignment,
      assignment_source: assignment.assignment_source,
      assignment_folder_id: assignment.assignment_folder_id || null,
      assignment_item_id: assignment.assignment_item_id || null
    }));
};

export default resolveEffectiveFnbModifierGroups;
