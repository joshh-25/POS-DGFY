// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ItemOptionsDialog from '../components/ItemOptionsDialog.jsx';

afterEach(() => cleanup());

describe('ItemOptionsDialog', () => {
  it('saves the note and independent item discount together', () => {
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
        discountApprovers={[{ user_id: 7, username: 'Manager' }]}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Apply an item-only discount' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Item discount rate' }), { target: { value: '15' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Authorizing employee' }), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Approval PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({
      note: 'No onions',
      selections: [],
      item_discount: {
        enabled: true,
        discount_type: 'manual',
        method: 'percentage',
        rate: '15',
        amount: '',
        customer_name: '',
        id_number: '',
        employee_name: '',
        employee_id: '',
        promo_code: '',
        reason: '',
        approver_user_id: '7',
        manager_pin: '1234',
      },
    });
  });

  it('keeps the item customization entry point as one modal surface', () => {
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
    expect(screen.getByRole('heading', { name: 'Discount for this item' })).toBeDefined();
    expect(screen.queryByText(/Update this item's note/i)).toBeNull();
    expect(screen.queryByText(/This note applies only to this item/i)).toBeNull();
    expect(screen.queryByText(/Choose the options for this item/i)).toBeNull();
    expect(screen.queryByText(/This discount applies only to Burger/i)).toBeNull();
    expect(screen.getByText(/no global discount is applied to this sale/i)).toBeDefined();
  });

  it('offers governed discount types inside the item customization modal', () => {
    render(
      <ItemOptionsDialog
        open
        line={{ item_name: 'Burger', quantity: 1, sale_price: 150, modifier_groups: [], line_modifiers: [] }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Apply an item-only discount' }));

    expect(screen.getByRole('tab', { name: 'Employee' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'PWD' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Senior' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Promo' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Other' })).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: 'PWD' }));
    expect(screen.getByLabelText(/Customer name/)).toBeDefined();
    expect(screen.getByLabelText(/Senior\/PWD ID number/)).toBeDefined();
    expect(screen.getByText(/configured Senior\/PWD discount rate is verified by the server/i)).toBeDefined();
  });

  it('defaults the employee and authorizing employee to the active shift cashier', () => {
    render(
      <ItemOptionsDialog
        open
        line={{ item_name: 'Burger', quantity: 1, sale_price: 150, modifier_groups: [], line_modifiers: [] }}
        discountApprovers={[{ user_id: 7, username: 'Cashier' }]}
        defaultDiscountApprover={{ user_id: 7, username: 'Cashier' }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Apply an item-only discount' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Employee' }));

    expect(screen.getByLabelText(/Employee name/).value).toBe('Cashier');
    expect(screen.getByRole('combobox', { name: 'Authorizing employee' }).value).toBe('7');
  });
});
