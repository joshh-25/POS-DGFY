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
      discount: { discount_type: 'promo', promo_code: 'SAVE20' },
      lines: [{ line_id: 1, item_id: 10, quantity: 1, sale_price: 100, line_subtotal: 100, item: { name: 'Meal' } }]
    }} />);

    expect(screen.getByText('Promo (SAVE20)')).toBeTruthy();
    expect(screen.queryByText('DGFY convenience fee')).toBeNull();
    expect(screen.getByText('Delivery Fee')).toBeTruthy();
    expect(screen.getByText('111.00')).toBeTruthy();
    expect(screen.queryByText('Tax')).toBeNull();
  });

  it('shows persisted change for a completed cash payment', () => {
    render(<OrderPreviewView transaction={{
      invoice_number: 'INV-CASH-1',
      status: 'completed',
      payment_type: 'cash',
      subtotal_amount: 400,
      total_amount: 400,
      cash_received: 500,
      change_amount: 100,
      lines: []
    }} />);

    expect(screen.getByText('Change')).toBeTruthy();
    expect(screen.getByText('100.00')).toBeTruthy();
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
