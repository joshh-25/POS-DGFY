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
});
