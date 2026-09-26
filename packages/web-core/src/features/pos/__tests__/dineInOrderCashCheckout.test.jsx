// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DineInOrderCashCheckout from '../components/DineInOrderCashCheckout.jsx';

afterEach(() => cleanup());

const ORDER = {
  pos_transaction_id: 810,
  tracking_pin: 'SK-MOKTHN',
  customer_name: 'Admin User',
  order_method: 'dine_in',
  payment_type: 'cash',
  payment_status: 'unpaid',
  fulfillment_status: 'ready_for_pickup',
  total_amount: 175
};

const renderCheckout = (overrides = {}) => render(
  <DineInOrderCashCheckout
    order={ORDER}
    cashReceived="200"
    canTransactPos
    hasActiveShift
    isOnline
    onCashReceivedChange={vi.fn()}
    onSubmit={vi.fn()}
    onCancel={vi.fn()}
    {...overrides}
  />
);

describe('DineInOrderCashCheckout', () => {
  it('shows the existing order, total, change, and no-duplicate-sale guarantee', () => {
    renderCheckout();

    expect(screen.getByText('SK-MOKTHN')).toBeTruthy();
    expect(screen.getByText('₱175.00')).toBeTruthy();
    expect(screen.getByText('₱25.00')).toBeTruthy();
    expect(screen.getByText(/will not create a second sale/i)).toBeTruthy();
    expect(screen.getByText(/will not.*mark the order as served/i)).toBeTruthy();
  });

  it('requires the full order total and submits the entered received amount', () => {
    const onCashReceivedChange = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = renderCheckout({ cashReceived: '174', onCashReceivedChange, onSubmit });

    expect(screen.getByRole('button', { name: /collect payment/i }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/cash received/i), { target: { value: '200' } });
    expect(onCashReceivedChange).toHaveBeenCalledWith('200');

    rerender(
      <DineInOrderCashCheckout
        order={ORDER}
        cashReceived="200"
        canTransactPos
        hasActiveShift
        isOnline
        onCashReceivedChange={onCashReceivedChange}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /collect payment/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps payment unavailable offline and does not submit', () => {
    const onSubmit = vi.fn();
    renderCheckout({ isOnline: false, onSubmit });

    expect(screen.getByRole('button', { name: /collect payment/i }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /collect payment/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
