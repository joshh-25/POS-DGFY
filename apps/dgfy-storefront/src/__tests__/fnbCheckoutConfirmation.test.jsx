/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FnbCheckoutConfirmation } from '../modes/fnb/checkout/components/FnbCheckoutConfirmation.jsx';

const sharedProps = {
  brandColor: '#0f766e',
  brandDark: '#0b3d3a',
  brandSoft: '#99f6e4',
  brandTint: '#ecfeff',
  cartLines: [{ item_id: 1, name: 'Adobo Rice Bowl', quantity: 2, price: 150 }],
  isDeliveryOrder: false,
  isMobileViewport: false,
  money: (value) => `PHP ${Number(value || 0).toFixed(2)}`,
  mutedTextColor: '#334155',
  onBackToMenu: vi.fn(),
  onDownload: vi.fn(),
  onOpenTracking: vi.fn(),
  totalAmount: 505
};

afterEach(cleanup);

describe('FnbCheckoutConfirmation', () => {
  // Phase 142 (#823): additive-only pin -- no checkoutResult.order at all must keep rendering
  // exactly as before.
  it('shows the plain payment row when the order carries no downpayment split', () => {
    render(
      <FnbCheckoutConfirmation
        {...sharedProps}
        checkoutResult={{ tracking_pin: 'SK-FNBCONFIRM1' }}
        paymentType="cash"
      />
    );

    expect(screen.getByText('CASH')).toBeTruthy();
    expect(screen.queryByText('Paid now:', { exact: false })).toBeNull();
  });

  it('shows the downpayment/balance split for a partially_paid order (pickup wording)', () => {
    render(
      <FnbCheckoutConfirmation
        {...sharedProps}
        checkoutResult={{
          tracking_pin: 'SK-FNBCONFIRM2',
          order: { payment_status: 'partially_paid', amount_paid: 101, balance_due: 404, total_amount: 505 }
        }}
        paymentType="gcash"
      />
    );

    expect(screen.getByText('GCASH DOWNPAYMENT')).toBeTruthy();
    expect(screen.getByText('PHP 101.00')).toBeTruthy();
    expect(screen.getByText('PHP 404.00')).toBeTruthy();
    expect(screen.getByText('Balance due at pickup:', { exact: false })).toBeTruthy();
  });

  it('uses delivery wording for a delivery order', () => {
    render(
      <FnbCheckoutConfirmation
        {...sharedProps}
        isDeliveryOrder
        checkoutResult={{
          tracking_pin: 'SK-FNBCONFIRM3',
          order: { payment_status: 'partially_paid', amount_paid: 101, balance_due: 404, total_amount: 505 }
        }}
        paymentType="qrph"
      />
    );

    expect(screen.getByText('Balance due on delivery:', { exact: false })).toBeTruthy();
  });
});
