/* @vitest-environment jsdom */
// #1615: same scenario set as fnbCheckoutSummary.test.jsx, for Simple (MSME) mode's
// SimpleCheckoutSummaryContent / SimpleCheckoutMobileSummaryPanel. Note:
// simpleCheckoutSummaryPresentation.test.js is an unrelated source-grep test -- this is a new
// file, not an edit to that one.
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SimpleCheckoutSummaryContent } from '../modes/simple/checkout/components/SimpleCheckoutSummaryContent.jsx';
import { SimpleCheckoutMobileSummaryPanel } from '../modes/simple/checkout/components/SimpleCheckoutMobileSummaryPanel.jsx';
import { VAT_DISCLOSURE_LABEL, VAT_DISCLOSURE_NOTE } from '../shared/model/storefrontFeesAndTaxesPresentation.js';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const cart = [{ item_id: 1, cart_line_id: 'l1', name: 'Grocery Bundle', quantity: 1, price: 105 }];

// Same PHP 105 gross / PHP 10.50 discount / PHP 11.25 inclusive-VAT basis as the F&B test.
const baseTotals = {
  subtotal_amount: 105,
  delivery_fee: 0,
  vat_amount: 11.25,
  vatable_sales: 93.75,
  vat_exempt_sales: 0,
  zero_rated_sales: 0
};

const desktopBaseProps = {
  bodyFont: 'sans-serif',
  cart,
  cartCount: 1,
  cartImageErrors: new Set(),
  displayFont: 'sans-serif',
  isDeliveryOrder: false,
  money,
  onImageError: vi.fn(),
  promoDiscountSummaryRow: { label: 'Promo', value: '- PHP 10.50' },
  voucherDiscountSummaryRow: null,
  promoPanel: null,
  scheduleLabel: 'NOW',
  withAssetOrigin: (value) => value
};

const mobileBaseProps = {
  cart,
  cartCount: 1,
  cartImageErrors: new Set(),
  checkoutAllowed: true,
  checkoutLoading: false,
  customerStepComplete: true,
  fulfillmentStepComplete: true,
  isDeliveryOrder: false,
  money,
  onBackToCatalog: vi.fn(),
  onCheckout: vi.fn(),
  onImageError: vi.fn(),
  onStepChange: vi.fn(),
  orderStep: 3,
  promoDiscountSummaryRow: { label: 'Promo', value: '- PHP 10.50' },
  voucherDiscountSummaryRow: null,
  promoPanel: null,
  scheduleLabel: 'NOW',
  setSummaryOpen: vi.fn(),
  showSummary: true,
  withAssetOrigin: (value) => value
};

afterEach(cleanup);

describe('Simple (MSME) checkout summary -- fee/VAT split (#1615)', () => {
  describe('zero-fee scenario (revenue sharing) -- PHP 94.50 total', () => {
    const totals = { ...baseTotals, service_fee_amount: 0, total_amount: 94.5 };

    it('reconciles subtotal - discount + deliveryFee + serviceFee === total_amount', () => {
      expect(totals.subtotal_amount - 10.5 + totals.delivery_fee + totals.service_fee_amount).toBeCloseTo(totals.total_amount, 2);
    });

    it('desktop shows the split rows and the disclosure note', () => {
      render(<SimpleCheckoutSummaryContent {...desktopBaseProps} totals={totals} />);
      expect(screen.queryByText('Fees & Taxes')).toBeNull();
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getAllByText('PHP 0.00').length).toBeGreaterThan(0);
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_NOTE)).toBeTruthy();
      expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
    });

    it('mobile summary sheet shows the same split rows and total', () => {
      render(<SimpleCheckoutMobileSummaryPanel {...mobileBaseProps} totals={totals} />);
      expect(screen.queryByText('Fees & Taxes')).toBeNull();
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_NOTE)).toBeTruthy();
      expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
    });
  });

  describe('1%-fee scenario -- PHP 95.55 total', () => {
    const totals = { ...baseTotals, service_fee_amount: 1.05, total_amount: 95.55 };

    it('reconciles subtotal - discount + deliveryFee + serviceFee === total_amount', () => {
      expect(totals.subtotal_amount - 10.5 + totals.delivery_fee + totals.service_fee_amount).toBeCloseTo(totals.total_amount, 2);
    });

    it('desktop shows the nonzero fee, unchanged VAT figure, and new total', () => {
      render(<SimpleCheckoutSummaryContent {...desktopBaseProps} totals={totals} />);
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getByText('PHP 1.05')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getAllByText('PHP 95.55').length).toBeGreaterThan(0);
    });

    it('mobile summary sheet shows the same nonzero fee and new total', () => {
      render(<SimpleCheckoutMobileSummaryPanel {...mobileBaseProps} totals={totals} />);
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getByText('PHP 1.05')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getAllByText('PHP 95.55').length).toBeGreaterThan(0);
    });
  });

  describe('voucher applied -- VAT figure is unchanged (pre-discount basis)', () => {
    const totals = { ...baseTotals, service_fee_amount: 1.05, total_amount: 85.55 };
    const voucherDiscountSummaryRow = { label: 'Voucher', value: '- PHP 10.00' };

    it('still shows the same pre-discount vat_amount the backend sent, not a recomputed figure', () => {
      render(
        <SimpleCheckoutSummaryContent
          {...desktopBaseProps}
          totals={totals}
          voucherDiscountSummaryRow={voucherDiscountSummaryRow}
        />
      );
      expect(screen.getByText('Voucher')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getAllByText('PHP 85.55').length).toBeGreaterThan(0);
    });
  });

  describe('nonzero delivery fee', () => {
    const totals = { ...baseTotals, delivery_fee: 50, service_fee_amount: 1.05, total_amount: 145.55 };

    it('reconciles with the delivery fee included and leaves the Delivery Fee row untouched', () => {
      expect(totals.subtotal_amount - 10.5 + totals.delivery_fee + totals.service_fee_amount).toBeCloseTo(totals.total_amount, 2);

      render(<SimpleCheckoutSummaryContent {...desktopBaseProps} totals={totals} isDeliveryOrder />);
      expect(screen.getByText('Delivery Fee')).toBeTruthy();
      expect(screen.getByText('PHP 50.00')).toBeTruthy();
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getByText('PHP 1.05')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getAllByText('PHP 145.55').length).toBeGreaterThan(0);
    });
  });
});
