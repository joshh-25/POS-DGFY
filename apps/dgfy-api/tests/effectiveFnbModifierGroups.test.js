import { resolveEffectiveFnbModifierGroups } from '../src/modules/shared/utils/effectiveFnbModifierGroups.js';

const group = (id, name, through = {}) => ({ modifier_group_id: id, name, ...through });

describe('effective F&B modifier group resolution', () => {
  test('inherits folder assignments when an item has no direct assignment', () => {
    const result = resolveEffectiveFnbModifierGroups({
      item_id: 5,
      folder: {
        folder_id: 20,
        fnbModifierGroups: [
          group(10, 'Extras', { FnbFolderModifierGroup: { folder_id: 20, modifier_group_id: 10, sort_order: 0 } })
        ]
      },
      fnbModifierGroups: []
    });
    expect(result).toHaveLength(1);
    expect(result[0].assignment_source).toBe('folder');
    expect(result[0].FnbItemModifierGroup.assignment_folder_id).toBe(20);
  });

  test('lets an item override and exclude inherited groups', () => {
    const result = resolveEffectiveFnbModifierGroups({
      item_id: 5,
      folder: {
        folder_id: 20,
        fnbModifierGroups: [
          group(10, 'Extras', { FnbFolderModifierGroup: { folder_id: 20, modifier_group_id: 10, sort_order: 0 } }),
          group(11, 'Sauces', { FnbFolderModifierGroup: { folder_id: 20, modifier_group_id: 11, sort_order: 1 } })
        ]
      },
      fnbModifierGroups: [
        group(10, 'Extras', { FnbItemModifierGroup: { item_id: 5, modifier_group_id: 10, is_required_override: true, sort_order: 2 } }),
        group(11, 'Sauces', { FnbItemModifierGroup: { item_id: 5, modifier_group_id: 11, is_excluded: true } })
      ]
    });
    expect(result.map((entry) => entry.modifier_group_id)).toEqual([10]);
    expect(result[0].assignment_source).toBe('item');
    expect(result[0].FnbItemModifierGroup.is_required_override).toBe(true);
  });

  test('deduplicates direct rows deterministically by assignment order', () => {
    const result = resolveEffectiveFnbModifierGroups({
      fnbModifierGroups: [
        group(12, 'Zeta', { FnbItemModifierGroup: { sort_order: 2 } }),
        group(10, 'Alpha', { FnbItemModifierGroup: { sort_order: 0 } }),
        group(12, 'Zeta duplicate', { FnbItemModifierGroup: { sort_order: 1 } })
      ]
    });
    expect(result.map((entry) => entry.modifier_group_id)).toEqual([10, 12]);
    expect(result[1].name).toBe('Zeta duplicate');
  });
});
