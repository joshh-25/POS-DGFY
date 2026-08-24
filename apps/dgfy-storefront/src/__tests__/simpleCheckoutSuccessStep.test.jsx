/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SimpleCheckoutSuccessStep } from '../modes/simple/checkout/components/SimpleCheckoutSuccessStep.jsx';

const checkoutResult = {
  tracking_pin: 'SIMPLE-ORDER-123456789',
  cart_lines: [
    { item_id: 1, name: 'A very long neighborhood-store product name that must wrap safely', quantity: 2, price: 25 }
  ],
  totals: { total_amount: 50 },
  payment: { checkout_url: 'https://example.com/pay' }
};

const sharedProps = {
  checkoutResult,
  displayFont: 'Arial',
  money: (value) => `PHP ${Number(value || 0).toFixed(2)}`,
  onBackToCatalog: vi.fn(),
  onDownload: vi.fn()
};

afterEach(cleanup);

describe('SimpleCheckoutSuccessStep', () => {
  it.each([
    ['Pickup', 'Your pickup order is confirmed and is now in the storefront queue.'],
    ['Delivery', 'Your delivery order is confirmed and is now in the storefront queue.']
  ])('renders a complete responsive %s receipt', (fulfillmentLabel, confirmationCopy) => {
    const { container } = render(
      <SimpleCheckoutSuccessStep
        {...sharedProps}
        fulfillmentLabel={fulfillmentLabel}
        isMobileViewport
      />
    );

    expect(screen.getByText(confirmationCopy)).toBeTruthy();
    expect(screen.getByText(fulfillmentLabel)).toBeTruthy();
    expect(screen.getAllByText('SIMPLE-ORDER-123456789')).toHaveLength(2);
    expect(screen.getAllByText('PHP 50.00').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Pay Now' }).style.width).toBe('100%');
    expect(screen.getByRole('button', { name: 'Download Image' }).style.width).toBe('100%');
    expect(screen.getByRole('button', { name: 'Back to Catalog' }).style.width).toBe('100%');
    expect(container.querySelector('[data-testid="simple-checkout-success"]').style.minWidth).toBe('0px');
  });

  it('keeps desktop actions compact and the receipt in a two-column layout', () => {
    render(
      <SimpleCheckoutSuccessStep
        {...sharedProps}
        fulfillmentLabel="Delivery"
        isDesktopCheckout
      />
    );

    expect(screen.getByRole('button', { name: 'Download Image' }).style.width).toBe('auto');
    expect(screen.getByTestId('simple-checkout-success').style.gridTemplateColumns).toContain('1.45fr');
  });

  // Phase 142 (#823): additive-only pin -- the fixture above (no checkoutResult.order) must keep
  // rendering exactly as before; this covers the order-sourced downpayment branch specifically.
  it('shows the downpayment/balance split for a partially_paid order, and stays unaffected otherwise', () => {
    const downpaymentCheckoutResult = {
      ...checkoutResult,
      order: { payment_status: 'partially_paid', amount_paid: 101, balance_due: 404, total_amount: 505 }
    };

    render(
      <SimpleCheckoutSuccessStep
        {...sharedProps}
        checkoutResult={downpaymentCheckoutResult}
        fulfillmentLabel="Delivery"
        paymentType="gcash"
      />
    );

    expect(screen.getByText('GCASH DOWNPAYMENT')).toBeTruthy();
    expect(screen.getByText('Paid now')).toBeTruthy();
    expect(screen.getByText('Balance due on delivery')).toBeTruthy();
    expect(screen.getByText('PHP 101.00')).toBeTruthy();
    expect(screen.getByText('PHP 404.00')).toBeTruthy();
  });

  it('does not show the downpayment split for a plain paid/unpaid order', () => {
    render(
      <SimpleCheckoutSuccessStep
        {...sharedProps}
        fulfillmentLabel="Pickup"
        paymentType="cash"
      />
    );

    expect(screen.getByText('CASH')).toBeTruthy();
    expect(screen.queryByText('Paid now')).toBeNull();
  });
});
