/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RetailOrderMobileSummaryPanel } from '../modes/retail/checkout/components/RetailOrderMobileSummaryPanel.jsx';
import { RetailOrderSummaryContent } from '../modes/retail/checkout/components/RetailOrderSummaryContent.jsx';

const cart = [{ item_id: 1, name: 'Canvas Tote', quantity: 1, price: 399 }];
const totals = {
  subtotal_amount: 399,
  discount_amount: 39.9,
  discount_label: 'Retail Promo',
  delivery_fee: 40,
  service_fee_amount: 3.99,
  vat_amount: 0,
  total_amount: 403.09
};
const promoDiscountSummaryRow = { label: 'Retail Promo', value: '- PHP 39.90' };
const sharedProps = {
  cart,
  cartCount: 1,
  cartImageErrors: new Set(),
  isDeliveryOrder: true,
  money: (value) => `PHP ${Number(value || 0).toFixed(2)}`,
  onImageError: vi.fn(),
  promoDiscountSummaryRow,
  promoPanel: <button type="button">Apply discount or voucher</button>,
  totals,
  withAssetOrigin: (value) => value
};

afterEach(cleanup);

describe('retail checkout order summary', () => {
  it('shows the shared promo control, deduction, fees, and payable total on desktop', () => {
    render(<RetailOrderSummaryContent {...sharedProps} />);

    expect(screen.getByRole('button', { name: 'Apply discount or voucher' })).toBeTruthy();
    expect(screen.getByText('Retail Promo')).toBeTruthy();
    expect(screen.getByText('- PHP 39.90')).toBeTruthy();
    expect(screen.getByText('Delivery Fee').compareDocumentPosition(screen.getByText('Retail Promo')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('PHP 403.09').length).toBeGreaterThan(0);
  });

  it('shows the same promo deduction and total in the mobile summary sheet', () => {
    render(
      <RetailOrderMobileSummaryPanel
        {...sharedProps}
        checkoutLoading={false}
        onBackToCatalog={vi.fn()}
        onCheckout={vi.fn()}
        onStepChange={vi.fn()}
        orderStep={2}
        setSummaryOpen={vi.fn()}
        showSummary
      />
    );

    expect(screen.getByRole('button', { name: 'Apply discount or voucher' })).toBeTruthy();
    expect(screen.getByText('Retail Promo')).toBeTruthy();
    expect(screen.getByText('- PHP 39.90')).toBeTruthy();
    expect(screen.getByText('Delivery Fee').compareDocumentPosition(screen.getByText('Retail Promo')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('PHP 403.09').length).toBeGreaterThan(0);
  });
});
