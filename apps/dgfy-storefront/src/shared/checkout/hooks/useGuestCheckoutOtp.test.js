// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGuestCheckoutOtp } from './useGuestCheckoutOtp.js';

const buildProps = (requestJson) => ({
  customerEmail: 'guest@example.com',
  isDgfyCustomerSignedIn: false,
  requestJson,
  selectedStore: { slug: 'masu-cafe' },
  toast: { success: vi.fn() }
});

describe('useGuestCheckoutOtp delivery handling', () => {
  it('starts the cooldown only after the API confirms email delivery', async () => {
    const requestJson = vi.fn().mockResolvedValue({ delivery_status: 'sent' });
    const props = buildProps(requestJson);
    const { result } = renderHook(() => useGuestCheckoutOtp(props));

    let requested;
    await act(async () => {
      requested = await result.current.handleRequestGuestCheckoutOtp();
    });

    expect(requested).toBe(true);
    expect(result.current.isGuestCheckoutOtpCooldownActive).toBe(true);
    expect(props.toast.success).toHaveBeenCalledWith('Verification code sent to your email.');
  });

  it('does not start the cooldown when delivery is recorded locally', async () => {
    const requestJson = vi.fn().mockResolvedValue({ delivery_status: 'recorded' });
    const props = buildProps(requestJson);
    const { result } = renderHook(() => useGuestCheckoutOtp(props));

    let requested;
    await act(async () => {
      requested = await result.current.handleRequestGuestCheckoutOtp();
    });

    expect(requested).toBe(false);
    expect(result.current.isGuestCheckoutOtpCooldownActive).toBe(false);
    expect(result.current.guestCheckoutOtpError).toBe('Email verification code could not be delivered. Please try again later.');
    expect(props.toast.success).not.toHaveBeenCalled();
  });

  it('requests the code for the just-applied email before React state flushes', async () => {
    const requestJson = vi.fn().mockResolvedValue({ delivery_status: 'sent' });
    const props = buildProps(requestJson);
    const { result } = renderHook(() => useGuestCheckoutOtp(props));

    await act(async () => {
      await result.current.handleRequestGuestCheckoutOtp('FreshGuest@Example.com');
    });

    expect(requestJson).toHaveBeenCalledWith(
      '/api/v1/store/checkout/guest-otp/request',
      expect.objectContaining({
        body: expect.objectContaining({ email: 'freshguest@example.com' })
      })
    );
  });

  it('does not mark the guest checkout as verified without a server proof', async () => {
    const requestJson = vi.fn().mockResolvedValue({});
    const props = buildProps(requestJson);
    const { result } = renderHook(() => useGuestCheckoutOtp(props));

    await act(async () => {
      result.current.handleGuestCheckoutOtpCodeChange('528372');
    });

    let verified;
    await act(async () => {
      verified = await result.current.handleVerifyGuestCheckoutOtp();
    });

    expect(verified).toBe(false);
    expect(result.current.guestCheckoutOtpVerified).toBe(false);
    expect(result.current.guestCheckoutOtpError).toBe('Email verification could not be completed. Please try again.');
  });

  it('marks the guest checkout as verified only after the server returns a proof', async () => {
    const requestJson = vi.fn().mockResolvedValue({ guest_checkout_proof: 'signed-guest-proof-value' });
    const props = buildProps(requestJson);
    const { result } = renderHook(() => useGuestCheckoutOtp(props));

    await act(async () => {
      result.current.handleGuestCheckoutOtpCodeChange('528372');
    });
    await act(async () => {
      await result.current.handleVerifyGuestCheckoutOtp();
    });

    expect(result.current.guestCheckoutOtpVerified).toBe(true);
    expect(result.current.guestCheckoutProof).toEqual({
      email: 'guest@example.com',
      proof: 'signed-guest-proof-value'
    });
    expect(props.toast.success).toHaveBeenCalledWith('Email verified. You can now place your order.');
  });

  it('keeps a verified proof while the checkout email is temporarily empty during state hydration', async () => {
    const requestJson = vi.fn().mockResolvedValue({ guest_checkout_proof: 'signed-guest-proof-value' });
    const props = buildProps(requestJson);
    const { result, rerender } = renderHook(() => useGuestCheckoutOtp(props));

    await act(async () => {
      result.current.handleGuestCheckoutOtpCodeChange('528372');
    });
    await act(async () => {
      await result.current.handleVerifyGuestCheckoutOtp();
    });

    props.customerEmail = '';
    rerender();

    expect(result.current.guestCheckoutOtpVerified).toBe(true);
    expect(result.current.guestCheckoutProof).toEqual({
      email: 'guest@example.com',
      proof: 'signed-guest-proof-value'
    });
  });
});
