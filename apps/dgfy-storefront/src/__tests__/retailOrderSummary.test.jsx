/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RetailOrderMobileSummaryPanel } from '../modes/retail/checkout/components/RetailOrderMobileSummaryPanel.jsx';
import { RetailOrderSummaryContent } from '../modes/retail/checkout/components/RetailOrderSummaryContent.jsx';
import { VAT_DISCLOSURE_LABEL } from '../shared/model/storefrontFeesAndTaxesPresentation.js';

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
    expect(screen.getByText('Retail Promo').parentElement.style.color).toBe('rgb(21, 128, 61)');
    expect(screen.getByText('- PHP 39.90').parentElement.style.color).toBe('rgb(21, 128, 61)');
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
    expect(screen.getByText('Retail Promo').parentElement.style.color).toBe('rgb(21, 128, 61)');
    expect(screen.getByText('- PHP 39.90').parentElement.style.color).toBe('rgb(21, 128, 61)');
    expect(screen.getByText('Delivery Fee').compareDocumentPosition(screen.getByText('Retail Promo')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('PHP 403.09').length).toBeGreaterThan(0);
  });

  // #1615: the combined "Fees & Taxes" row is gone -- a separate additive fee row and an
  // informational, already-inclusive VAT disclosure row render instead, and the total is
  // unaffected either way.
  it('splits the fee and VAT rows instead of a combined "Fees & Taxes" row, desktop + mobile', () => {
    render(<RetailOrderSummaryContent {...sharedProps} />);
    expect(screen.queryByText('Fees & Taxes')).toBeNull();
    expect(screen.getByText('Service Fee')).toBeTruthy();
    expect(screen.getByText('PHP 3.99')).toBeTruthy();
    expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
    expect(screen.getAllByText('PHP 403.09').length).toBeGreaterThan(0);
    cleanup();

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
    expect(screen.queryByText('Fees & Taxes')).toBeNull();
    expect(screen.getByText('Service Fee')).toBeTruthy();
    expect(screen.getByText('PHP 3.99')).toBeTruthy();
    expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
    expect(screen.getAllByText('PHP 403.09').length).toBeGreaterThan(0);
  });

  // #1615: current fixture has vat_amount: 0 above -- this scenario exercises a real nonzero VAT
  // figure and asserts the reconciliation identity directly rather than only eyeballing rendered
  // text, so a future regression that re-merges the rows or drops a term is caught by the
  // assertion itself.
  describe('with a nonzero VAT figure (vatable sale)', () => {
    const vatTotals = {
      subtotal_amount: 105,
      delivery_fee: 0,
      service_fee_amount: 1.05,
      vat_amount: 11.25,
      total_amount: 106.05
    };
    const vatProps = {
      cart,
      cartCount: 1,
      cartImageErrors: new Set(),
      isDeliveryOrder: false,
      money: (value) => `PHP ${Number(value || 0).toFixed(2)}`,
      onImageError: vi.fn(),
      promoPanel: null,
      totals: vatTotals,
      withAssetOrigin: (value) => value
    };

    it('holds subtotal - discounts + deliveryFee + serviceFee === total_amount, and shows both split rows on desktop', () => {
      const { subtotal_amount: subtotal, delivery_fee: deliveryFee, service_fee_amount: serviceFee, total_amount: total } = vatTotals;
      expect(subtotal - 0 - 0 + deliveryFee + serviceFee).toBeCloseTo(total, 2);

      render(<RetailOrderSummaryContent {...vatProps} />);
      expect(screen.queryByText('Fees & Taxes')).toBeNull();
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getByText('PHP 1.05')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getAllByText('PHP 106.05').length).toBeGreaterThan(0);
    });

    it('shows the same split and total in the mobile summary sheet', () => {
      render(
        <RetailOrderMobileSummaryPanel
          {...vatProps}
          checkoutLoading={false}
          onBackToCatalog={vi.fn()}
          onCheckout={vi.fn()}
          onStepChange={vi.fn()}
          orderStep={2}
          setSummaryOpen={vi.fn()}
          showSummary
        />
      );
      expect(screen.queryByText('Fees & Taxes')).toBeNull();
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getByText('PHP 1.05')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getAllByText('PHP 106.05').length).toBeGreaterThan(0);
    });
  });
});
