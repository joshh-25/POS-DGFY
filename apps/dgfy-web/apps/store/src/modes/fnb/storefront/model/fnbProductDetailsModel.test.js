import { describe, expect, it } from 'vitest';
import { normalizeFnbModifierGroups } from './fnbProductDetailsModel.js';

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
