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
});
