/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE } from '../../../../shared/checkout/model/guestCheckoutOtp.js';
import { FnbCheckoutPaymentStep } from './FnbCheckoutPaymentStep.jsx';

const baseProps = {
  brandColor: '#1a4e8d',
  canSubmit: false,
  cart: [{ cart_line_id: 'line-1', item_id: 1, name: 'Test item', price: 100, quantity: 1 }],
  cartImageErrors: new Set(),
  checkoutError: GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE,
  closedNotice: null,
  isMobileViewport: false,
  isResponsive: false,
  money: (value) => `₱${value}`,
  onBack: vi.fn(),
  onBackToAccount: vi.fn(),
  onImageError: vi.fn(),
  onSubmit: vi.fn(),
  paymentControl: <div>Payment control</div>,
  processing: false,
  quoteError: '',
  withAssetOrigin: (url) => url,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FnbCheckoutPaymentStep guest verification recovery', () => {
  it('disables payment and provides a customer-details verification path without duplicating the error', () => {
    render(<FnbCheckoutPaymentStep {...baseProps} guestCheckoutVerificationRequired />);

    expect(screen.getByRole('button', { name: 'Place Order' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Back to Customer Details & Verify Email' })).toBeTruthy();
    expect(screen.getAllByText(GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Customer Details & Verify Email' }));

    expect(baseProps.onBackToAccount).toHaveBeenCalledOnce();
    expect(baseProps.onSubmit).not.toHaveBeenCalled();
  });

  it('keeps payment available and hides the recovery notice after guest verification', () => {
    render(<FnbCheckoutPaymentStep {...baseProps} canSubmit guestCheckoutVerificationRequired={false} checkoutError="" />);

    expect(screen.getByRole('button', { name: 'Place Order' }).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Back to Customer Details & Verify Email' })).toBeNull();
    expect(screen.queryByText(GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE)).toBeNull();
  });
});
