// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { validateFnbModifierSelections } from '../components/FnbModifierPickerDialog.jsx';
import FnbModifierPickerDialog from '../components/FnbModifierPickerDialog.jsx';

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

  it('treats an unrequired group as optional even when a stale minimum remains', () => {
    expect(validateFnbModifierSelections([{
      ...groups[0],
      required: false,
      min_select: 1,
      max_select: 5
    }], [])).toBe('');
    expect(validateFnbModifierSelections([{
      ...groups[0],
      required: true,
      min_select: 1,
      max_select: 5
    }], [])).toContain('Size requires 1');
    expect(validateFnbModifierSelections([{
      ...groups[0],
      required: true,
      min_select: 1,
      max_select: 5,
      FnbItemModifierGroup: { is_required_override: false }
    }], [])).toBe('');
  });

  it('starts a fresh picker session when the active POS line changes', () => {
    cleanup();
    const pickerGroups = [{
      modifier_group_id: 5,
      display_name: 'Size',
      required: false,
      min_select: 0,
      max_select: 1,
      is_active: true,
      visible_in_pos: true,
      options: [
        { modifier_option_id: 8, name: 'Large', is_active: true, visible_in_pos: true },
        { modifier_option_id: 9, name: 'Small', is_active: true, visible_in_pos: true }
      ]
    }];
    const firstLine = { line_key: 'line-a', item_name: 'Burger A', modifier_groups: pickerGroups, line_modifiers: [{ modifier_group_id: 5, modifier_option_id: 8 }] };
    const secondLine = { line_key: 'line-b', item_name: 'Burger B', modifier_groups: pickerGroups, line_modifiers: [] };
    function Harness() {
      const [line, setLine] = useState(firstLine);
      return (
        <>
          <button type="button" onClick={() => setLine(secondLine)}>Switch line</button>
          <FnbModifierPickerDialog
            key={line.line_key}
            open
            line={line}
            locationId={null}
            onClose={() => {}}
            onSave={() => {}}
          />
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('radio', { name: /Large/ }).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Switch line' }));
    expect(screen.getByRole('radio', { name: /Large/ }).checked).toBe(false);
    expect(screen.getByRole('radio', { name: /Small/ }).checked).toBe(false);
  });
});
