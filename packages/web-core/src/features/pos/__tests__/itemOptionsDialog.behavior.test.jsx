// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ItemOptionsDialog from '../components/ItemOptionsDialog.jsx';

afterEach(() => cleanup());

describe('ItemOptionsDialog', () => {
  it('saves item notes and modifiers without creating an item-level discount', () => {
    const onSave = vi.fn();
    render(
      <ItemOptionsDialog
        open
        line={{
          line_key: 'line-cheese',
          item_name: 'Cheese',
          quantity: 1,
          special_instructions: 'No onions',
          modifier_groups: [],
          line_modifiers: [],
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({
      note: 'No onions',
      selections: [],
    });
  });

  it('keeps the item customization modal focused on notes and modifiers', () => {
    render(
      <ItemOptionsDialog
        open
        line={{ item_name: 'Burger', quantity: 1, modifier_groups: [], line_modifiers: [] }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Item note' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Modifiers' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Discount for this item' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Apply an item-only discount' })).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Item discount type' })).toBeNull();
    expect(screen.getByText(/Apply discounts from the checkout discount action/i)).toBeDefined();
    expect(screen.getByText(/no global discount is applied to this sale/i)).toBeDefined();
  });

  it('preserves the global discount context as read-only information', () => {
    render(
      <ItemOptionsDialog
        open
        line={{ item_name: 'Burger', quantity: 1, modifier_groups: [], line_modifiers: [] }}
        globalDiscount={{ label: 'Employee Discount', rate: 15, amount: 22.5 }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText(/Global discount also applies to this item/i)).toBeDefined();
    expect(screen.getByText(/Employee Discount · 15.00%/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /apply discount/i })).toBeNull();
  });
});
