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
});
