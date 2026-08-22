// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FnbGuestEmailVerification } from '../modes/fnb/checkout/components/FnbGuestEmailVerification.jsx';
import { ServiceBookingGuestEmailVerification } from '../modes/services/booking/components/ServiceBookingGuestEmailVerification.jsx';
import { RetailOrderGuestEmailVerification } from '../modes/retail/checkout/components/RetailOrderGuestEmailVerification.jsx';
import { SimpleCheckoutGuestEmailVerification } from '../modes/simple/checkout/components/SimpleCheckoutGuestEmailVerification.jsx';

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
    ['F&B', FnbGuestEmailVerification, 'Recommended', 'Send code again'],
    ['Retail', RetailOrderGuestEmailVerification, 'Recommended', 'Send code again'],
    ['Simple MSME', SimpleCheckoutGuestEmailVerification, 'Recommended', 'Send code again'],
    ['Services', ServiceBookingGuestEmailVerification, 'Required', 'Send verification code']
  ])('%s renders the verification controls and keeps the callbacks wired', (_mode, Component, badge, requestLabel) => {
    const props = buildProps();
    render(<Component {...props} />);

    expect(screen.getByText('Verify your email')).toBeTruthy();
    expect(screen.getByText(badge)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: requestLabel }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(props.onRequestCode).toHaveBeenCalledTimes(1);
    expect(props.onVerifyCode).toHaveBeenCalledTimes(1);
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
