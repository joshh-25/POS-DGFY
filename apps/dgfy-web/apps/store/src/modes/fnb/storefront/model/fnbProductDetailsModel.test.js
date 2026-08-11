import { describe, expect, it } from 'vitest';
import {
  buildDefaultFnbModifierSelections,
  hasRequiredFnbModifierGroups,
  normalizeFnbModifierGroups,
  validateFnbModifierSelections
} from './fnbProductDetailsModel.js';

describe('normalizeFnbModifierGroups', () => {
  it('prefers the customer-facing display name over an internal group name', () => {
    const groups = normalizeFnbModifierGroups({
      fnb_modifier_groups: [{
        modifier_group_id: 1,
        name: '[GM-1] Weight',
        display_name: 'Weight',
        min_select: 1,
        max_select: 1,
        options: [{ modifier_option_id: 2, name: '250 g', price_delta: -237.5 }]
      }]
    });

    expect(groups[0].group_name).toBe('Weight');
    expect(groups[0].options[0].price_delta).toBe(-237.5);
  });
});

describe('F&B modifier selection contract', () => {
  const groups = normalizeFnbModifierGroups({
    fnb_modifier_groups: [{
      modifier_group_id: 1,
      display_name: 'Size',
      required: true,
      min_select: 1,
      max_select: 1,
      options: [
        { modifier_option_id: 2, name: 'Regular', price_delta: 0, is_default: true },
        { modifier_option_id: 3, name: 'Large', price_delta: 20 }
      ]
    }]
  });

  it('builds deterministic default selections', () => {
    expect(buildDefaultFnbModifierSelections(groups)).toEqual([expect.objectContaining({ modifier_group_id: 1, modifier_option_id: 2 })]);
  });

  it('detects required modifier groups for catalog quick-add gating', () => {
    expect(hasRequiredFnbModifierGroups({ fnb_modifier_groups: [{ min_select: 1 }] })).toBe(true);
    expect(hasRequiredFnbModifierGroups({ fnb_modifier_groups: [{ required: false, min_select: 0 }] })).toBe(false);
  });

  it('blocks missing required selections', () => {
    expect(validateFnbModifierSelections(groups, [])).toEqual(expect.objectContaining({ valid: false, groupId: 1 }));
  });

  it('accepts a valid required selection', () => {
    expect(validateFnbModifierSelections(groups, [{ modifier_group_id: 1, modifier_option_id: 3 }]).valid).toBe(true);
  });

  it('activates a required conditional group only after its parent option is selected', () => {
    const conditionalGroups = [
      { modifier_group_id: 1, group_name: 'Meal', min_select: 0, max_select: 1, options: [{ modifier_option_id: 2, option_name: 'Make it a combo' }] },
      { modifier_group_id: 3, group_name: 'Drink', required: true, min_select: 1, max_select: 1, parent_modifier_option_id: 2, options: [{ modifier_option_id: 4, option_name: 'Cola' }] }
    ];
    expect(validateFnbModifierSelections(conditionalGroups, [])).toEqual(expect.objectContaining({ valid: true }));
    expect(validateFnbModifierSelections(conditionalGroups, [{ modifier_group_id: 1, modifier_option_id: 2 }])).toEqual(expect.objectContaining({ valid: false, groupId: 3 }));
  });
});
