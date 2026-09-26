// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosFnbModifierManager from '../components/PosFnbModifierManager.jsx';

afterEach(() => cleanup());

const groups = [
  {
    modifier_group_id: 11,
    name: 'size',
    display_name: 'Size',
    options: [{ modifier_option_id: 21, name: 'Large', price_delta: 40 }]
  },
  {
    modifier_group_id: 12,
    name: 'sauce',
    display_name: 'Sauce',
    options: [{ modifier_option_id: 22, name: 'Garlic', price_delta: 10 }]
  }
];

describe('POS F&B modifier manager edit sessions', () => {
  it('hydrates the selected group in the click action and starts a blank new-group session', () => {
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit option group Size' }));
    expect(screen.getByLabelText('Group name').value).toBe('size');
    expect(screen.getByRole('heading', { name: 'Add/Edit Option Name' })).toBeTruthy();
    expect(screen.getByLabelText('Option 1 name').value).toBe('Large');

    fireEvent.click(screen.getByRole('button', { name: 'Add an Option Group' }));
    expect(screen.getByLabelText('Group name').value).toBe('');
    expect(screen.getByLabelText('Option 1 name').value).toBe('');
  });

  it('keeps long add-on option lists inside a scrollable bounded panel', () => {
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add an Option Group' }));
    const editorScroll = screen.getByTestId('fnb-option-group-editor-scroll');
    const optionsList = screen.getByTestId('fnb-modifier-options-list');
    expect(editorScroll.className).toContain('overflow-y-auto');
    expect(editorScroll.className).toContain('pos-fnb-option-group-editor-body');
    expect(screen.getByRole('button', { name: 'Reset All' }).parentElement.className).toContain('pos-fnb-option-group-editor-footer');
    expect(optionsList.className).toContain('max-h-[32rem]');
    expect(optionsList.className).toContain('overflow-y-auto');
  });

  it('saves add-on groups as optional when Required is turned off', async () => {
    const onCreate = vi.fn().mockResolvedValue();
    render(<PosFnbModifierManager groups={[]} items={[]} locations={[]} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add an Option Group' }));
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Extras' } });
    fireEvent.change(screen.getByLabelText('Option 1 name'), { target: { value: 'Cheese' } });
    const required = screen.getByRole('checkbox', { name: 'Required' });

    expect(required.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toEqual(expect.objectContaining({
      min_select: 0,
      max_select: 1,
      required: false
    }));
  });
});
