// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CashDrawerEventForm from '../components/CashDrawerEventForm.jsx';

afterEach(() => cleanup());

const initialForm = { eventType: 'cash_in', amount: '', reason: '' };

describe('CashDrawerEventForm', () => {
  it('renders the reference layout with accessible required fields and DGFY actions', () => {
    render(
      <CashDrawerEventForm
        canAdjustCashDrawer
        currencySymbol="PHP"
        cashEventForm={initialForm}
      />
    );

    expect(screen.getByRole('heading', { name: 'Cash Drawer Event' })).toBeTruthy();
    expect(screen.getByText('Manual Log')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Event Type (required)' }).getAttribute('aria-required')).toBe('true');
    expect(screen.getByRole('spinbutton', { name: /Amount \(PHP\)/ })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Reason/ })).toBeTruthy();
    expect(screen.getByText('PHP', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Add cash to the drawer.')).toBeTruthy();
    expect(screen.queryByText(/precise physical bill and coin/)).toBeNull();
    expect(screen.getByText('Explain this adjustment for the audit trail.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record Cash Event' }).classList.contains('!bg-[#1A4E8D]')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cashier History' }).classList.contains('border-[#8AA8CD]')).toBe(true);
  });

  it('keeps controlled field updates and action callbacks connected', () => {
    const setCashEventForm = vi.fn();
    const onRecord = vi.fn();
    const onOpenCashierHistory = vi.fn();
    render(
      <CashDrawerEventForm
        canAdjustCashDrawer
        cashEventForm={initialForm}
        setCashEventForm={setCashEventForm}
        onRecord={onRecord}
        onOpenCashierHistory={onOpenCashierHistory}
      />
    );

    fireEvent.change(screen.getByRole('spinbutton', { name: /Amount \(PHP\)/ }), { target: { value: '25.50' } });
    expect(setCashEventForm.mock.calls[0][0](initialForm)).toEqual({ ...initialForm, amount: '25.50' });
    fireEvent.change(screen.getByRole('textbox', { name: /Reason/ }), { target: { value: 'Till top-up' } });
    expect(setCashEventForm.mock.calls[1][0](initialForm)).toEqual({ ...initialForm, reason: 'Till top-up' });
    fireEvent.click(screen.getByRole('button', { name: 'Record Cash Event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cashier History' }));
    expect(onRecord).toHaveBeenCalledOnce();
    expect(onOpenCashierHistory).toHaveBeenCalledOnce();
  });

  it('preserves the permission gate and disables recording while saving', () => {
    const { rerender } = render(<CashDrawerEventForm canAdjustCashDrawer={false} />);
    expect(screen.getByRole('alert').textContent).toMatch(/need cash drawer adjustment permission/i);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /record cash event/i })).toBeNull();

    rerender(<CashDrawerEventForm canAdjustCashDrawer saving cashEventForm={initialForm} />);
    expect(screen.getByRole('button', { name: 'Saving Event...' }).disabled).toBe(true);
  });
});
