/* @vitest-environment jsdom */
// #1615: F&B has no existing render-level summary test -- this covers the split fee/VAT rows
// (replacing the old combined "Fees & Taxes" row) across desktop (both `detailed` and `compact`
// variants) and mobile, using the issue's own reported numbers (gross subtotal PHP 105, VAT PHP
// 11.25 already included, zero-fee total PHP 94.50 / 1%-fee total PHP 95.55).
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FnbCheckoutSummaryContent } from '../modes/fnb/checkout/components/FnbCheckoutSummaryContent.jsx';
import { FnbCheckoutMobileSummaryPanel } from '../modes/fnb/checkout/components/FnbCheckoutMobileSummaryPanel.jsx';
import { VAT_DISCLOSURE_LABEL, VAT_DISCLOSURE_NOTE } from '../shared/model/storefrontFeesAndTaxesPresentation.js';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const cart = [{ item_id: 1, cart_line_id: 'l1', name: 'Silog Meal', quantity: 1, price: 105 }];

// PHP 105 gross subtotal, PHP 10.50 promo discount, PHP 11.25 VAT already included in the gross
// (pre-discount basis -- unaffected by the promo/voucher below). Reconciliation:
// subtotal - discount + deliveryFee + serviceFee === total_amount.
const baseTotals = {
  subtotal_amount: 105,
  delivery_fee: 0,
  vat_amount: 11.25,
  vatable_sales: 93.75,
  vat_exempt_sales: 0,
  zero_rated_sales: 0
};

const desktopBaseProps = {
  accentColor: '#1a4e8d',
  accentSoft: '#b9cfe8',
  accentTint: '#eef4fb',
  bodyFont: 'sans-serif',
  cart,
  cartImageErrors: new Set(),
  cartCount: 1,
  checkoutAllowed: true,
  displayFont: 'sans-serif',
  isDeliveryOrder: false,
  money,
  onImageError: vi.fn(),
  promoDiscountSummaryRow: { label: 'Promo', value: '- PHP 10.50' },
  voucherDiscountSummaryRow: null,
  promoPanel: null,
  scheduleLabel: 'NOW'
};

const mobileBaseProps = {
  brandColor: '#1a4e8d',
  brandColorDark: '#1a4586',
  brandShadowStrong: 'rgba(26,78,141,.28)',
  cart,
  cartCount: 1,
  cartImageErrors: new Set(),
  checkoutAllowed: true,
  checkoutLoading: false,
  fnbCustomerStepComplete: true,
  fnbFulfillmentStepComplete: true,
  isDeliveryOrder: false,
  itemCountLabel: '1 Item',
  money,
  onBackToCart: vi.fn(),
  onCheckout: vi.fn(),
  onDecreaseStep: vi.fn(),
  onImageError: vi.fn(),
  onIncreaseStep: vi.fn(),
  onToggleSummary: vi.fn(),
  orderStep: 4,
  promoDiscountSummaryRow: { label: 'Promo', value: '- PHP 10.50' },
  voucherDiscountSummaryRow: null,
  promoPanel: null,
  scheduleLabel: 'NOW',
  setSummaryOpen: vi.fn(),
  showSummary: true
};

afterEach(cleanup);

describe('F&B checkout summary -- fee/VAT split (#1615)', () => {
  describe('zero-fee scenario (revenue sharing) -- PHP 94.50 total', () => {
    const totals = { ...baseTotals, service_fee_amount: 0, total_amount: 94.5 };

    it('reconciles subtotal - discount + deliveryFee + serviceFee === total_amount', () => {
      expect(totals.subtotal_amount - 10.5 + totals.delivery_fee + totals.service_fee_amount).toBeCloseTo(totals.total_amount, 2);
    });

    it('desktop detailed variant shows the split rows and the disclosure note', () => {
      render(<FnbCheckoutSummaryContent {...desktopBaseProps} totals={totals} variant="detailed" />);
      expect(screen.queryByText('Fees & Taxes')).toBeNull();
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getAllByText('PHP 0.00').length).toBeGreaterThan(0);
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_NOTE)).toBeTruthy();
      expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
    });

    it('desktop compact variant (OrderSummaryCard) shows the same split rows and footnote', () => {
      render(<FnbCheckoutSummaryContent {...desktopBaseProps} totals={totals} variant="compact" />);
      expect(screen.queryByText('Fees & Taxes')).toBeNull();
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_NOTE)).toBeTruthy();
      expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
    });

    it('mobile summary sheet shows the same split rows and total', () => {
      render(<FnbCheckoutMobileSummaryPanel {...mobileBaseProps} totals={totals} />);
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

    it('desktop detailed variant shows the nonzero fee, unchanged VAT figure, and new total', () => {
      render(<FnbCheckoutSummaryContent {...desktopBaseProps} totals={totals} variant="detailed" />);
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getByText('PHP 1.05')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getAllByText('PHP 95.55').length).toBeGreaterThan(0);
    });

    it('mobile summary sheet shows the same nonzero fee and new total', () => {
      render(<FnbCheckoutMobileSummaryPanel {...mobileBaseProps} totals={totals} />);
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
        <FnbCheckoutSummaryContent
          {...desktopBaseProps}
          totals={totals}
          voucherDiscountSummaryRow={voucherDiscountSummaryRow}
          variant="detailed"
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

      render(<FnbCheckoutSummaryContent {...desktopBaseProps} totals={totals} isDeliveryOrder variant="detailed" />);
      expect(screen.getByText('Delivery Fee')).toBeTruthy();
      expect(screen.getByText('PHP 50.00')).toBeTruthy();
      expect(screen.getByText('Service Fee')).toBeTruthy();
      expect(screen.getByText('PHP 1.05')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getAllByText('PHP 145.55').length).toBeGreaterThan(0);
    });
  });
});
