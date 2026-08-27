/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import OrderPreviewView from '../components/OrderPreviewView.jsx';

afterEach(cleanup);

describe('POS order preview financial truth', () => {
  it('shows persisted promo and delivery components without adding VAT or DGFY fee to the total', () => {
    render(<OrderPreviewView transaction={{
      invoice_number: 'INV-ONLINE-1',
      status: 'completed',
      created_at: '2026-07-10T04:00:00.000Z',
      subtotal_amount: 100,
      discount_amount: 20,
      service_fee_amount: 1,
      service_fee_label_snapshot: 'DGFY convenience fee',
      delivery_fee: 30,
      vat_amount: 10.71,
      total_amount: 111,
      amount_paid: 111,
      discount: { discount_type: 'promo', promo_code: 'SAVE20' },
      lines: [{ line_id: 1, item_id: 10, quantity: 1, sale_price: 100, line_subtotal: 100, item: { name: 'Meal' } }]
    }} />);

    expect(screen.getByText('Discount')).toBeTruthy();
    expect(screen.getByText('Discount').className).toContain('text-rose-600');
    expect(screen.getByText('20.00').className).toContain('text-rose-600');
    expect(screen.getByText('Total Payment')).toBeTruthy();
    expect(screen.getByText('111.00')).toBeTruthy();
    expect(screen.queryByText('Meal')).toBeNull();
    expect(screen.queryByText('Order Summary')).toBeNull();
    expect(screen.queryByText('Status')).toBeNull();
    expect(screen.queryByText('DGFY convenience fee')).toBeNull();
    expect(screen.queryByText('Delivery Fee')).toBeNull();
    expect(screen.queryByText('Tax')).toBeNull();
  });

  it('shows persisted change for a completed cash payment', () => {
    render(<OrderPreviewView transaction={{
      invoice_number: 'INV-CASH-1',
      status: 'completed',
      payment_type: 'cash',
      subtotal_amount: 400,
      total_amount: 400,
      amount_paid: 400,
      cash_received: 500,
      change_amount: 100,
      lines: []
    }} />);

    expect(screen.getByText('Change')).toBeTruthy();
    expect(screen.getByText('Change').className).toContain('text-blue-600');
    expect(screen.getByText('100.00')).toBeTruthy();
    expect(screen.getByText('100.00').className).toContain('text-blue-600');
  });

  it.each([
    ['default zero', { amount_paid: 0 }],
    ['missing amount', {}]
  ])('uses the completed order total when amount_paid is %s', (_label, paymentFields) => {
    render(<OrderPreviewView transaction={{
      invoice_number: 'INV-COMPLETE',
      status: 'completed',
      payment_status: 'paid',
      subtotal_amount: 150,
      total_amount: 150,
      lines: [],
      ...paymentFields
    }} />);

    expect(screen.getAllByText('150.00')).toHaveLength(2);
  });

  it('uses amount_paid for a genuinely partial payment', () => {
    render(<OrderPreviewView transaction={{
      invoice_number: 'INV-PARTIAL',
      status: 'completed',
      payment_status: 'partially_paid',
      subtotal_amount: 400,
      total_amount: 400,
      amount_paid: 125,
      balance_due: 275,
      lines: []
    }} />);

    expect(screen.getByText('125.00')).toBeTruthy();
  });

  it.each([
    ['exact cash', { payment_type: 'cash', change_amount: 0 }],
    ['non-cash', { payment_type: 'gcash', change_amount: 100 }],
    ['missing change', { payment_type: 'cash' }]
  ])('hides change for %s payments', (_label, paymentFields) => {
    render(<OrderPreviewView transaction={{
      invoice_number: 'INV-NO-CHANGE',
      status: 'completed',
      subtotal_amount: 400,
      total_amount: 400,
      lines: [],
      ...paymentFields
    }} />);

    expect(screen.queryByText('Change')).toBeNull();
  });
});
