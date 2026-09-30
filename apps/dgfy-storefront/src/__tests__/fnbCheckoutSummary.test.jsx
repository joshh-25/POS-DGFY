/* @vitest-environment jsdom */
// #1615: F&B has no existing render-level summary test -- this covers the split fee/VAT rows
// (replacing the old combined "Fees & Taxes" row) across desktop (both `detailed` and `compact`
// variants) and mobile. Legacy positive-fee payloads must not reintroduce the removed customer fee.
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FnbCheckoutSummaryContent } from '../modes/fnb/checkout/components/FnbCheckoutSummaryContent.jsx';
import { FnbCheckoutMobileSummaryPanel } from '../modes/fnb/checkout/components/FnbCheckoutMobileSummaryPanel.jsx';
import { FnbCheckoutCustomerStep } from '../modes/fnb/checkout/components/FnbCheckoutCustomerStep.jsx';
import { VAT_DISCLOSURE_LABEL, VAT_DISCLOSURE_NOTE } from '../shared/model/storefrontFeesAndTaxesPresentation.js';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const cart = [{ item_id: 1, cart_line_id: 'l1', name: 'Silog Meal', quantity: 1, price: 105 }];

// PHP 105 gross subtotal, PHP 10.50 promo discount, PHP 11.25 VAT already included in the gross
// (pre-discount basis -- unaffected by the promo/voucher below). Reconciliation:
// subtotal - discount + deliveryFee === total_amount.
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
  describe('zero-fee scenario -- PHP 94.50 total', () => {
    const totals = { ...baseTotals, service_fee_amount: 0, total_amount: 94.5 };

    it('reconciles subtotal - discount + deliveryFee + serviceFee === total_amount', () => {
      expect(totals.subtotal_amount - 10.5 + totals.delivery_fee).toBeCloseTo(totals.total_amount, 2);
    });

    it('desktop detailed variant shows the split rows and the disclosure note', () => {
      render(<FnbCheckoutSummaryContent {...desktopBaseProps} totals={totals} variant="detailed" />);
      expect(screen.queryByText('Fees & Taxes')).toBeNull();
      expect(screen.queryByText('Service Fee')).toBeNull();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_NOTE)).toBeTruthy();
      expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
    });

    it('desktop compact variant (OrderSummaryCard) shows the same split rows and footnote', () => {
      render(<FnbCheckoutSummaryContent {...desktopBaseProps} totals={totals} variant="compact" />);
      expect(screen.queryByText('Fees & Taxes')).toBeNull();
      expect(screen.queryByText('Service Fee')).toBeNull();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_NOTE)).toBeTruthy();
      expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
    });

    it('mobile summary sheet shows the same split rows and total', () => {
      render(<FnbCheckoutMobileSummaryPanel {...mobileBaseProps} totals={totals} />);
      expect(screen.queryByText('Fees & Taxes')).toBeNull();
      expect(screen.queryByText('Service Fee')).toBeNull();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getByText(VAT_DISCLOSURE_NOTE)).toBeTruthy();
      expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
    });
  });

  describe('legacy fee payload -- customer fee remains hidden', () => {
    const totals = { ...baseTotals, service_fee_amount: 1.05, service_fee_label: 'DGFY convenience fee', total_amount: 94.5 };

    it('reconciles without adding the legacy service fee', () => {
      expect(totals.subtotal_amount - 10.5 + totals.delivery_fee).toBeCloseTo(totals.total_amount, 2);
    });

    it('desktop detailed variant hides the legacy fee and keeps the current total', () => {
      render(<FnbCheckoutSummaryContent {...desktopBaseProps} totals={totals} variant="detailed" />);
      expect(screen.queryByText('Service Fee')).toBeNull();
      expect(screen.queryByText('DGFY convenience fee')).toBeNull();
      expect(screen.queryByText('PHP 1.05')).toBeNull();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
    });

    it('mobile summary sheet hides the legacy fee and keeps the current total', () => {
      render(<FnbCheckoutMobileSummaryPanel {...mobileBaseProps} totals={totals} />);
      expect(screen.queryByText('Service Fee')).toBeNull();
      expect(screen.queryByText('DGFY convenience fee')).toBeNull();
      expect(screen.queryByText('PHP 1.05')).toBeNull();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getByText('PHP 11.25')).toBeTruthy();
      expect(screen.getAllByText('PHP 94.50').length).toBeGreaterThan(0);
    });
  });

  describe('voucher applied -- VAT figure is unchanged (pre-discount basis)', () => {
    const totals = { ...baseTotals, service_fee_amount: 1.05, total_amount: 84.5 };
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
      expect(screen.getAllByText('PHP 84.50').length).toBeGreaterThan(0);
    });
  });

  describe('nonzero delivery fee', () => {
    const totals = { ...baseTotals, delivery_fee: 50, service_fee_amount: 1.05, total_amount: 144.5 };

    it('reconciles with the delivery fee included and leaves the Delivery Fee row untouched', () => {
      expect(totals.subtotal_amount - 10.5 + totals.delivery_fee).toBeCloseTo(totals.total_amount, 2);

      render(<FnbCheckoutSummaryContent {...desktopBaseProps} totals={totals} isDeliveryOrder variant="detailed" />);
      expect(screen.getByText('Delivery fee')).toBeTruthy();
      expect(screen.getByText('PHP 50.00')).toBeTruthy();
      expect(screen.queryByText('Service Fee')).toBeNull();
      expect(screen.queryByText('PHP 1.05')).toBeNull();
      expect(screen.getByText(VAT_DISCLOSURE_LABEL)).toBeTruthy();
      expect(screen.getAllByText('PHP 144.50').length).toBeGreaterThan(0);
    });
  });

  describe('Step 1 delivery-fee expectation', () => {
    const stepProps = {
      brandColor: '#1a4e8d',
      brandDark: '#153e70',
      canContinue: true,
      identityContent: <div>Customer fields</div>,
      isMobileViewport: true,
      isResponsive: true,
      onBack: vi.fn(),
      onContinue: vi.fn(),
    };

    it('shows the non-monetary note when delivery is available', () => {
      render(<FnbCheckoutCustomerStep {...stepProps} showDeliveryFeeExpectationNote />);
      expect(screen.getByText('Delivery fee is shown in Step 2 after you choose Delivery. Pickup has no delivery fee.')).toBeTruthy();
      expect(screen.queryByText(/₱|PHP/)).toBeNull();
    });

    it('omits the delivery-fee note for pickup-only stores', () => {
      render(<FnbCheckoutCustomerStep {...stepProps} showDeliveryFeeExpectationNote={false} />);
      expect(screen.queryByText(/Delivery fee is shown in Step 2/)).toBeNull();
    });

    it('keeps the same expectation copy on the desktop Step 1 layout', () => {
      render(<FnbCheckoutCustomerStep {...stepProps} isMobileViewport={false} isResponsive={false} showDeliveryFeeExpectationNote />);
      expect(screen.getByText('Delivery fee is shown in Step 2 after you choose Delivery. Pickup has no delivery fee.')).toBeTruthy();
    });
  });

  it('shows a recalculation status beside the safe pickup total', () => {
    render(<FnbCheckoutSummaryContent
      {...desktopBaseProps}
      isTotalStale
      orderMethod="pickup"
      totals={{ ...baseTotals, subtotal_amount: 488, delivery_fee: 0, total_amount: 488 }}
      variant="detailed"
    />);

    expect(screen.getByRole('status').textContent).toBe('Recalculating total…');
    expect(screen.getAllByText('PHP 488.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('Delivery Fee')).toBeNull();
  });
});
