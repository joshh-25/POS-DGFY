// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFnbGuestCheckoutOtp } from './useFnbGuestCheckoutOtp.js';

const buildProps = (requestJson) => ({
  customerEmail: 'guest@example.com',
  isDgfyCustomerSignedIn: false,
  requestJson,
  selectedStore: { slug: 'masu-cafe' },
  toast: { success: vi.fn() }
});

describe('useFnbGuestCheckoutOtp delivery handling', () => {
  it('starts the cooldown only after the API confirms email delivery', async () => {
    const requestJson = vi.fn().mockResolvedValue({ delivery_status: 'sent' });
    const props = buildProps(requestJson);
    const { result } = renderHook(() => useFnbGuestCheckoutOtp(props));

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
    const { result } = renderHook(() => useFnbGuestCheckoutOtp(props));

    let requested;
    await act(async () => {
      requested = await result.current.handleRequestGuestCheckoutOtp();
    });

    expect(requested).toBe(false);
    expect(result.current.isGuestCheckoutOtpCooldownActive).toBe(false);
    expect(result.current.guestCheckoutOtpError).toBe('Email verification code could not be delivered. Please try again later.');
    expect(props.toast.success).not.toHaveBeenCalled();
  });
});
