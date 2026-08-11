// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

    fireEvent.click(screen.getByRole('button', { name: /Size.*Active/ }));
    expect(screen.getByLabelText('Group name').value).toBe('size');
    expect(screen.getByLabelText('Customer-facing name').value).toBe('Size');
    expect(screen.getByLabelText('Option 1 name').value).toBe('Large');

    fireEvent.click(screen.getByRole('button', { name: /New group/ }));
    expect(screen.getByLabelText('Group name').value).toBe('');
    expect(screen.getByLabelText('Customer-facing name').value).toBe('');
    expect(screen.getByLabelText('Option 1 name').value).toBe('');
  });

  it('keeps long add-on option lists inside a scrollable bounded panel', () => {
    render(<PosFnbModifierManager groups={groups} items={[]} locations={[]} />);

    const optionsList = screen.getByTestId('fnb-modifier-options-list');
    expect(optionsList.className).toContain('max-h-96');
    expect(optionsList.className).toContain('overflow-y-auto');
  });
});
