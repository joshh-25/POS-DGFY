import { describe, expect, it } from 'vitest';
import { validateFnbModifierSelections } from '../components/FnbModifierPickerDialog.jsx';

const groups = [{
  modifier_group_id: 5,
  name: 'Size',
  required: true,
  min_select: 1,
  max_select: 1,
  is_active: true,
  visible_in_pos: true,
  options: [{ modifier_option_id: 8, name: 'Large', is_active: true, visible_in_pos: true }]
}];

describe('F&B POS modifier selection contract', () => {
  it('blocks checkout when a required group is empty', () => {
    expect(validateFnbModifierSelections(groups, [], 4)).toContain('Size requires 1');
  });

  it('accepts a valid required selection', () => {
    expect(validateFnbModifierSelections(groups, [{ modifier_group_id: 5, modifier_option_id: 8 }], 4)).toBe('');
  });

  it('does not require a group hidden from the POS channel or unavailable at the location', () => {
    expect(validateFnbModifierSelections([{ ...groups[0], visible_in_pos: false }], [], 4)).toBe('');
    expect(validateFnbModifierSelections([{
      ...groups[0],
      locationAvailability: [{ location_id: 4, is_available: false }]
    }], [], 4)).toBe('');
  });
});
