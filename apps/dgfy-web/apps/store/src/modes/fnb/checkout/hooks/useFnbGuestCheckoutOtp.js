import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createFnbGuestCheckoutIntentId,
  FNB_GUEST_CHECKOUT_OTP_REQUEST_ENDPOINT,
  FNB_GUEST_CHECKOUT_OTP_VERIFY_ENDPOINT,
  formatFnbGuestCheckoutCooldown,
  normalizeGuestCheckoutEmail,
  normalizeGuestCheckoutOtpCode,
  RESEND_COOLDOWN_SECONDS,
} from '../model/fnbGuestCheckoutOtp.js';

export function useFnbGuestCheckoutOtp({
  customerEmail,
  isDgfyCustomerSignedIn,
  requestJson,
  selectedStore,
  toast,
}) {
  const [guestCheckoutIntentId, setGuestCheckoutIntentId] = useState(() => createFnbGuestCheckoutIntentId());
  const [guestCheckoutOtpCode, setGuestCheckoutOtpCode] = useState('');
  const [guestCheckoutProof, setGuestCheckoutProof] = useState(null);
  const [guestCheckoutOtpLoading, setGuestCheckoutOtpLoading] = useState(false);
  const [guestCheckoutOtpError, setGuestCheckoutOtpError] = useState('');
  const [guestCheckoutOtpCooldownSeconds, setGuestCheckoutOtpCooldownSeconds] = useState(0);

  const normalizedEmail = normalizeGuestCheckoutEmail(customerEmail);
  const guestCheckoutOtpCooldownLabel = useMemo(
    () => formatFnbGuestCheckoutCooldown(guestCheckoutOtpCooldownSeconds),
    [guestCheckoutOtpCooldownSeconds]
  );
  const isGuestCheckoutOtpCooldownActive = guestCheckoutOtpCooldownSeconds > 0;
  const guestCheckoutOtpVerified = isDgfyCustomerSignedIn || Boolean(guestCheckoutProof?.proof);

  useEffect(() => {
    if (isDgfyCustomerSignedIn) {
      setGuestCheckoutProof(null);
      setGuestCheckoutOtpCode('');
      setGuestCheckoutOtpError('');
      return;
    }

    const verifiedEmail = normalizeGuestCheckoutEmail(guestCheckoutProof?.email);
    if (guestCheckoutProof && verifiedEmail !== normalizedEmail) {
      setGuestCheckoutProof(null);
      setGuestCheckoutOtpCode('');
      setGuestCheckoutOtpError('');
      setGuestCheckoutIntentId(createFnbGuestCheckoutIntentId());
    }
  }, [guestCheckoutProof, isDgfyCustomerSignedIn, normalizedEmail]);

  useEffect(() => {
    if (guestCheckoutOtpCooldownSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setGuestCheckoutOtpCooldownSeconds((previous) => Math.max(0, previous - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [guestCheckoutOtpCooldownSeconds]);

  const handleGuestCheckoutOtpCodeChange = useCallback((nextCode) => {
    setGuestCheckoutOtpCode(normalizeGuestCheckoutOtpCode(nextCode));
    setGuestCheckoutOtpError('');
  }, []);

  const handleRequestGuestCheckoutOtp = useCallback(async () => {
    if (isDgfyCustomerSignedIn) return true;
    if (!normalizedEmail) {
      setGuestCheckoutOtpError('Enter an email address before requesting a code.');
      return false;
    }
    if (isGuestCheckoutOtpCooldownActive) return false;

    setGuestCheckoutOtpLoading(true);
    setGuestCheckoutOtpError('');
    try {
      const data = await requestJson(FNB_GUEST_CHECKOUT_OTP_REQUEST_ENDPOINT, {
        method: 'POST',
        storeSlug: selectedStore?.slug,
        body: {
          email: normalizedEmail,
          idempotency_key: guestCheckoutIntentId,
        },
      });
      if (String(data?.delivery_status || '').trim().toLowerCase() !== 'sent') {
        throw new Error('Email verification code could not be delivered. Please try again later.');
      }
      setGuestCheckoutOtpCooldownSeconds(RESEND_COOLDOWN_SECONDS);
      toast.success('Verification code sent to your email.');
      return true;
    } catch (error) {
      setGuestCheckoutOtpError(error?.message || 'Unable to send verification code.');
      return false;
    } finally {
      setGuestCheckoutOtpLoading(false);
    }
  }, [
    guestCheckoutIntentId,
    isDgfyCustomerSignedIn,
    isGuestCheckoutOtpCooldownActive,
    normalizedEmail,
    requestJson,
    selectedStore?.slug,
    toast,
  ]);

  const handleVerifyGuestCheckoutOtp = useCallback(async () => {
    if (isDgfyCustomerSignedIn) return true;
    if (!normalizedEmail || guestCheckoutOtpCode.length !== 6) {
      setGuestCheckoutOtpError('Enter your email address and the 6-digit verification code.');
      return false;
    }

    setGuestCheckoutOtpLoading(true);
    setGuestCheckoutOtpError('');
    try {
      const data = await requestJson(FNB_GUEST_CHECKOUT_OTP_VERIFY_ENDPOINT, {
        method: 'POST',
        storeSlug: selectedStore?.slug,
        body: {
          email: normalizedEmail,
          code: guestCheckoutOtpCode,
          idempotency_key: guestCheckoutIntentId,
        },
      });
      setGuestCheckoutProof({
        email: normalizedEmail,
        proof: data?.guest_checkout_proof || '',
      });
      setGuestCheckoutOtpCode('');
      toast.success('Email verified. You can now place your order.');
      return true;
    } catch (error) {
      setGuestCheckoutOtpError(error?.message || 'Unable to verify code.');
      return false;
    } finally {
      setGuestCheckoutOtpLoading(false);
    }
  }, [
    guestCheckoutIntentId,
    guestCheckoutOtpCode,
    isDgfyCustomerSignedIn,
    normalizedEmail,
    requestJson,
    selectedStore?.slug,
    toast,
  ]);

  return {
    guestCheckoutIntentId,
    guestCheckoutOtpCode,
    guestCheckoutOtpCooldownLabel,
    guestCheckoutOtpError,
    guestCheckoutOtpLoading,
    guestCheckoutOtpVerified,
    guestCheckoutProof,
    handleGuestCheckoutOtpCodeChange,
    handleRequestGuestCheckoutOtp,
    handleVerifyGuestCheckoutOtp,
    isGuestCheckoutOtpCooldownActive,
  };
}
