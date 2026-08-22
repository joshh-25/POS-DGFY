import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createGuestCheckoutIntentId,
  GUEST_CHECKOUT_OTP_REQUEST_ENDPOINT,
  GUEST_CHECKOUT_OTP_VERIFY_ENDPOINT,
  formatGuestCheckoutCooldown,
  normalizeGuestCheckoutEmail,
  normalizeGuestCheckoutOtpCode,
  RESEND_COOLDOWN_SECONDS,
} from '../model/guestCheckoutOtp.js';

export function useGuestCheckoutOtp({
  customerEmail,
  isDgfyCustomerSignedIn,
  requestJson,
  selectedStore,
  toast,
}) {
  const [guestCheckoutIntentId, setGuestCheckoutIntentId] = useState(() => createGuestCheckoutIntentId());
  const [guestCheckoutOtpCode, setGuestCheckoutOtpCode] = useState('');
  const [guestCheckoutProof, setGuestCheckoutProof] = useState(null);
  const [guestCheckoutOtpLoading, setGuestCheckoutOtpLoading] = useState(false);
  const [guestCheckoutOtpError, setGuestCheckoutOtpError] = useState('');
  const [guestCheckoutOtpCooldownSeconds, setGuestCheckoutOtpCooldownSeconds] = useState(0);

  const normalizedEmail = normalizeGuestCheckoutEmail(customerEmail);
  const guestCheckoutOtpCooldownLabel = useMemo(
    () => formatGuestCheckoutCooldown(guestCheckoutOtpCooldownSeconds),
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
      setGuestCheckoutOtpCooldownSeconds(0);
      setGuestCheckoutIntentId(createGuestCheckoutIntentId());
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

  const handleRequestGuestCheckoutOtp = useCallback(async (emailOverride = '') => {
    if (isDgfyCustomerSignedIn) return true;
    // #846: a bare `onClick={onRequestCode}` (no arrow wrapper) passes the click SyntheticEvent
    // as emailOverride -- String(event) coerces to "[object Object]", which then goes straight
    // into the OTP request body. Fixed at both call sites (RetailOrderGuestEmailVerification.jsx,
    // shared GuestEmailVerification.jsx), but guarded here too so a future bare-reference mistake
    // can't silently resurrect this bug.
    const safeOverride = typeof emailOverride === 'string' ? emailOverride : '';
    const requestEmail = normalizeGuestCheckoutEmail(safeOverride || customerEmail);
    if (!requestEmail) {
      setGuestCheckoutOtpError('Enter an email address before requesting a code.');
      return false;
    }
    if (isGuestCheckoutOtpCooldownActive) return false;

    setGuestCheckoutOtpLoading(true);
    setGuestCheckoutOtpError('');
    try {
      const data = await requestJson(GUEST_CHECKOUT_OTP_REQUEST_ENDPOINT, {
        method: 'POST',
        storeSlug: selectedStore?.slug,
        body: {
          email: requestEmail,
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
    customerEmail,
    guestCheckoutIntentId,
    isDgfyCustomerSignedIn,
    isGuestCheckoutOtpCooldownActive,
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
      const data = await requestJson(GUEST_CHECKOUT_OTP_VERIFY_ENDPOINT, {
        method: 'POST',
        storeSlug: selectedStore?.slug,
        body: {
          email: normalizedEmail,
          code: guestCheckoutOtpCode,
          idempotency_key: guestCheckoutIntentId,
        },
      });
      const proof = String(data?.guest_checkout_proof || '').trim();
      if (!proof) {
        throw new Error('Email verification could not be completed. Please try again.');
      }
      setGuestCheckoutProof({
        email: normalizedEmail,
        proof,
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
