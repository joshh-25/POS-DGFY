// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGuestCheckoutOtp } from './useGuestCheckoutOtp.js';
import {
  buildGuestCheckoutVerificationGrantStorageKey,
  GUEST_CHECKOUT_GRANT_EXCHANGE_ENDPOINT,
  writeGuestCheckoutVerificationGrant
} from '../model/guestCheckoutOtp.js';

const buildProps = (requestJson) => ({
  customerEmail: 'guest@example.com',
  isDgfyCustomerSignedIn: false,
  requestJson,
  selectedStore: { slug: 'masu-cafe' },
  toast: { success: vi.fn() }
});

afterEach(() => {
  window.localStorage.clear();
});

describe('useGuestCheckoutOtp delivery handling', () => {
  it('requests the remembered email when apply-and-request runs in one callback', async () => {
    const requestJson = vi.fn().mockResolvedValue({ delivery_status: 'sent' });
    const props = buildProps(requestJson);
    const { result } = renderHook(() => {
      const [email, setEmail] = useState('');
      const otp = useGuestCheckoutOtp({ ...props, customerEmail: email });

      return {
        ...otp,
        applyRememberedDetailsAndRequestOtp: () => {
          setEmail(props.customerEmail);
          return otp.handleRequestGuestCheckoutOtp(props.customerEmail);
        }
      };
    });

    let requested;
    await act(async () => {
      requested = await result.current.applyRememberedDetailsAndRequestOtp();
    });

    expect(requested).toBe(true);
    expect(requestJson).toHaveBeenCalledWith(
      '/api/v1/store/checkout/guest-otp/request',
      expect.objectContaining({
        body: expect.objectContaining({ email: 'guest@example.com' })
      })
    );
  });

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
      proof: 'signed-guest-proof-value',
      storeSlug: 'masu-cafe'
    });
    expect(props.toast.success).toHaveBeenCalledWith('Email verified. You can now place your order.');
  });

  it('resets the guest checkout and notifies the caller when the OTP is expired', async () => {
    const error = Object.assign(new Error('Email verification code is missing or expired'), {
      details: { reason_code: 'GUEST_CHECKOUT_OTP_EXPIRED' },
      errorCode: 'VALIDATION_FAILED'
    });
    const requestJson = vi.fn().mockRejectedValue(error);
    const onOtpExpired = vi.fn();
    const props = { ...buildProps(requestJson), onOtpExpired };
    const { result } = renderHook(() => useGuestCheckoutOtp(props));

    act(() => result.current.handleGuestCheckoutOtpCodeChange('528372'));
    await act(async () => {
      await result.current.handleVerifyGuestCheckoutOtp();
    });

    expect(onOtpExpired).toHaveBeenCalledOnce();
    expect(result.current.guestCheckoutOtpVerified).toBe(false);
    expect(result.current.guestCheckoutOtpCode).toBe('');
    expect(result.current.guestCheckoutOtpError).toBe('');
    expect(result.current.isGuestCheckoutOtpCooldownActive).toBe(false);
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
      proof: 'signed-guest-proof-value',
      storeSlug: 'masu-cafe'
    });
  });

  it('persists the signed grant and exchanges it for a fresh proof after a checkout remount', async () => {
    const requestJson = vi.fn()
      .mockResolvedValueOnce({
        guest_checkout_proof: 'signed-guest-proof-value',
        guest_checkout_verification_grant: 'signed-guest-grant-value',
        verification_grant_expires_in: 86400
      })
      .mockResolvedValueOnce({ guest_checkout_proof: 'fresh-guest-proof-value' });
    const props = buildProps(requestJson);
    const firstHook = renderHook(() => useGuestCheckoutOtp(props));

    act(() => firstHook.result.current.handleGuestCheckoutOtpCodeChange('528372'));
    await act(async () => {
      await firstHook.result.current.handleVerifyGuestCheckoutOtp();
    });

    const storageKey = buildGuestCheckoutVerificationGrantStorageKey({
      storeSlug: 'masu-cafe',
      email: 'guest@example.com'
    });
    expect(window.localStorage.getItem(storageKey)).toContain('signed-guest-grant-value');
    firstHook.unmount();

    const secondHook = renderHook(() => useGuestCheckoutOtp(props));
    await waitFor(() => expect(secondHook.result.current.guestCheckoutOtpVerified).toBe(true));

    expect(secondHook.result.current.guestCheckoutProof).toEqual({
      email: 'guest@example.com',
      proof: 'fresh-guest-proof-value',
      storeSlug: 'masu-cafe'
    });
    expect(requestJson).toHaveBeenNthCalledWith(
      2,
      GUEST_CHECKOUT_GRANT_EXCHANGE_ENDPOINT,
      expect.objectContaining({
        body: expect.objectContaining({
          verification_grant: 'signed-guest-grant-value',
          email: 'guest@example.com'
        })
      })
    );
    secondHook.unmount();
  });

  it('clears an expired verification grant and requires a new email verification', async () => {
    const storageKey = buildGuestCheckoutVerificationGrantStorageKey({
      storeSlug: 'masu-cafe',
      email: 'guest@example.com'
    });
    writeGuestCheckoutVerificationGrant({
      storeSlug: 'masu-cafe',
      email: 'guest@example.com',
      grant: 'expired-guest-grant-value',
      expiresIn: 3600
    });
    const requestJson = vi.fn().mockRejectedValue(Object.assign(
      new Error('Guest email verification has expired. Verify your email again.'),
      { errorCode: 'AUTHENTICATION_FAILED' }
    ));
    const onOtpExpired = vi.fn();
    const props = { ...buildProps(requestJson), onOtpExpired };
    const { result } = renderHook(() => useGuestCheckoutOtp(props));

    await waitFor(() => expect(onOtpExpired).toHaveBeenCalledOnce());

    expect(result.current.guestCheckoutOtpVerified).toBe(false);
    expect(result.current.guestCheckoutOtpError).toContain('Guest email verification has expired');
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });

  it('rotates the proof and idempotency key after an order completes', async () => {
    const requestJson = vi.fn().mockResolvedValue({ guest_checkout_proof: 'signed-guest-proof-value' });
    const props = buildProps(requestJson);
    const { result } = renderHook(() => useGuestCheckoutOtp(props));
    const firstIntentId = result.current.guestCheckoutIntentId;

    act(() => result.current.handleGuestCheckoutOtpCodeChange('528372'));
    await act(async () => {
      await result.current.handleVerifyGuestCheckoutOtp();
    });

    expect(result.current.guestCheckoutOtpVerified).toBe(true);
    act(() => result.current.resetGuestCheckoutOtp());

    expect(result.current.guestCheckoutIntentId).not.toBe(firstIntentId);
    expect(result.current.guestCheckoutProof).toBeNull();
    expect(result.current.guestCheckoutOtpCode).toBe('');
    expect(result.current.guestCheckoutOtpVerified).toBe(false);
    expect(result.current.isGuestCheckoutOtpCooldownActive).toBe(false);
  });
});
