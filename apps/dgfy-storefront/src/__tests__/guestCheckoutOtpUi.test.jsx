// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FnbGuestEmailVerification } from '../modes/fnb/checkout/components/FnbGuestEmailVerification.jsx';
import { ServiceBookingGuestEmailVerification } from '../modes/services/booking/components/ServiceBookingGuestEmailVerification.jsx';
import { RetailOrderGuestEmailVerification } from '../modes/retail/checkout/components/RetailOrderGuestEmailVerification.jsx';
import { RetailOrderPaymentStep } from '../modes/retail/checkout/components/RetailOrderPaymentStep.jsx';
import { SimpleCheckoutGuestEmailVerification } from '../modes/simple/checkout/components/SimpleCheckoutGuestEmailVerification.jsx';
import { SimpleCheckoutPaymentActions } from '../modes/simple/checkout/components/SimpleCheckoutPaymentActions.jsx';
import { GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE } from '../shared/checkout/model/guestCheckoutOtp.js';

const buildProps = () => ({
  bodyFont: 'Arial, sans-serif',
  code: '123456',
  cooldownActive: false,
  cooldownLabel: '0s',
  error: '',
  isMobileViewport: false,
  loading: false,
  onCodeChange: vi.fn(),
  onRequestCode: vi.fn(),
  onVerifyCode: vi.fn(),
  verified: false
});

describe('mode-owned guest checkout OTP UIs', () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    ['F&B', FnbGuestEmailVerification, 'Recommended', 'Send code again', 'Verify your email'],
    ['Retail', RetailOrderGuestEmailVerification, 'Recommended', 'Send code again', 'Verify your email'],
    ['Simple MSME', SimpleCheckoutGuestEmailVerification, 'Recommended', 'Send code again', 'Verify your email'],
    ['Services', ServiceBookingGuestEmailVerification, 'Required', 'Send verification code', 'Verify your email']
  ])('%s renders the verification controls and keeps the callbacks wired', (_mode, Component, badge, requestLabel, heading) => {
    const props = buildProps();
    render(<Component {...props} />);

    expect(screen.getByText(heading)).toBeTruthy();
    expect(screen.getByText(badge)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: requestLabel }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(props.onRequestCode).toHaveBeenCalledTimes(1);
    expect(props.onVerifyCode).toHaveBeenCalledTimes(1);
  });

  it('blocks the simple Place Order action and offers account sign-in when guest verification is missing', () => {
    const onSignInToCheckout = vi.fn();
    render(
      <SimpleCheckoutPaymentActions
        checkoutError={GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE}
        guestCheckoutVerificationRequired
        onCheckout={vi.fn()}
        onSignInToCheckout={onSignInToCheckout}
        simpleCheckoutAllowed
      />
    );

    expect(screen.getByRole('button', { name: 'Place Order' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with my DGFY account' }));
    expect(onSignInToCheckout).toHaveBeenCalledTimes(1);
  });

  it('blocks the retail Place Order action and sends the guest back to account verification', () => {
    const onCheckout = vi.fn();
    const onBackToAccount = vi.fn();
    render(
      <RetailOrderPaymentStep
        cart={[]}
        cartImageErrors={new Set()}
        guestCheckoutOtpVerified={false}
        isDgfyCustomerSignedIn={false}
        money={(value) => String(value)}
        onBack={vi.fn()}
        onBackToAccount={onBackToAccount}
        onCheckout={onCheckout}
        onImageError={vi.fn()}
        onPaymentTypeChange={vi.fn()}
        withAssetOrigin={(value) => value}
      />
    );

    expect(screen.getByRole('button', { name: 'Place Order' }).disabled).toBe(true);
    expect(screen.getByText(GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Account & Verify Email' }));
    expect(onBackToAccount).toHaveBeenCalledTimes(1);
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it('does not show a stale guest verification error after the guest is verified', () => {
    render(
      <RetailOrderPaymentStep
        cart={[]}
        cartImageErrors={new Set()}
        checkoutError={GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE}
        guestCheckoutOtpVerified
        isDgfyCustomerSignedIn={false}
        money={(value) => String(value)}
        onBack={vi.fn()}
        onCheckout={vi.fn()}
        onImageError={vi.fn()}
        onPaymentTypeChange={vi.fn()}
        withAssetOrigin={(value) => value}
      />
    );

    expect(screen.queryByText(GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE)).toBeNull();
    expect(screen.getByRole('button', { name: 'Place Order' }).disabled).toBe(false);
  });

  // #846: a bare `onClick={onRequestCode}` (no arrow wrapper) passes the click SyntheticEvent as
  // onRequestCode's first argument -- String(event) coerces to "[object Object]", which then
  // reaches the OTP request body as the email. `toHaveBeenCalledTimes(1)` above would pass either
  // way; only checking the call's arguments catches the regression.
  it.each([
    ['F&B', FnbGuestEmailVerification, 'Send code again'],
    ['Retail', RetailOrderGuestEmailVerification, 'Send code again'],
    ['Simple MSME', SimpleCheckoutGuestEmailVerification, 'Send code again'],
    ['Services', ServiceBookingGuestEmailVerification, 'Send verification code']
  ])('%s calls onRequestCode with no arguments, never the click event (#846)', (_mode, Component, requestLabel) => {
    const props = buildProps();
    render(<Component {...props} />);

    fireEvent.click(screen.getByRole('button', { name: requestLabel }));

    expect(props.onRequestCode).toHaveBeenCalledWith();
  });

  it.each([
    ['F&B', FnbGuestEmailVerification],
    ['Retail', RetailOrderGuestEmailVerification],
    ['Simple MSME', SimpleCheckoutGuestEmailVerification],
    ['Services', ServiceBookingGuestEmailVerification]
  ])('%s shows its verified state without exposing the code controls', (_mode, Component) => {
    render(<Component {...buildProps()} verified />);

    expect(screen.getByText('Email verified')).toBeTruthy();
    expect(screen.queryByPlaceholderText('6-digit code')).toBeNull();
  });
});
