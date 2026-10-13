import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  clearGuestCheckoutVerificationGrant,
  createGuestCheckoutIntentId,
  GUEST_CHECKOUT_GRANT_EXCHANGE_ENDPOINT,
  GUEST_CHECKOUT_OTP_REQUEST_ENDPOINT,
  GUEST_CHECKOUT_OTP_VERIFY_ENDPOINT,
  formatGuestCheckoutCooldown,
  isGuestCheckoutVerificationGrantRejectedError,
  isGuestCheckoutOtpExpiredError,
  normalizeGuestCheckoutEmail,
  normalizeGuestCheckoutOtpCode,
  readGuestCheckoutVerificationGrant,
  RESEND_COOLDOWN_SECONDS,
  writeGuestCheckoutVerificationGrant,
} from '../model/guestCheckoutOtp.js';

export function useGuestCheckoutOtp({
  customerEmail,
  isDgfyCustomerSignedIn,
  requestJson,
  selectedStore,
  toast,
  onOtpExpired,
}) {
  const [guestCheckoutIntentId, setGuestCheckoutIntentId] = useState(() => createGuestCheckoutIntentId());
  const [guestCheckoutOtpCode, setGuestCheckoutOtpCode] = useState('');
  const [guestCheckoutProof, setGuestCheckoutProof] = useState(null);
  const [guestCheckoutVerificationGrant, setGuestCheckoutVerificationGrant] = useState(null);
  const [guestCheckoutOtpLoading, setGuestCheckoutOtpLoading] = useState(false);
  const [guestCheckoutOtpError, setGuestCheckoutOtpError] = useState('');
  const [guestCheckoutOtpCooldownSeconds, setGuestCheckoutOtpCooldownSeconds] = useState(0);
  const guestCheckoutGrantExchangeAttemptRef = useRef('');

  const normalizedEmail = normalizeGuestCheckoutEmail(customerEmail);
  const normalizedStoreSlug = String(selectedStore?.slug || '').trim().toLowerCase();
  const guestCheckoutOtpCooldownLabel = useMemo(
    () => formatGuestCheckoutCooldown(guestCheckoutOtpCooldownSeconds),
    [guestCheckoutOtpCooldownSeconds]
  );
  const isGuestCheckoutOtpCooldownActive = guestCheckoutOtpCooldownSeconds > 0;
  const guestCheckoutOtpVerified = isDgfyCustomerSignedIn || Boolean(guestCheckoutProof?.proof);

  const resetGuestCheckoutOtp = useCallback(() => {
    setGuestCheckoutIntentId(createGuestCheckoutIntentId());
    setGuestCheckoutOtpCode('');
    setGuestCheckoutProof(null);
    setGuestCheckoutOtpError('');
    setGuestCheckoutOtpCooldownSeconds(0);
  }, []);

  useEffect(() => {
    if (isDgfyCustomerSignedIn) {
      if (guestCheckoutVerificationGrant) {
        clearGuestCheckoutVerificationGrant({
          storeSlug: guestCheckoutVerificationGrant.storeSlug,
          email: guestCheckoutVerificationGrant.email
        });
      }
      setGuestCheckoutVerificationGrant(null);
      setGuestCheckoutProof(null);
      setGuestCheckoutOtpCode('');
      setGuestCheckoutOtpError('');
      return;
    }

    const verifiedEmail = normalizeGuestCheckoutEmail(guestCheckoutProof?.email);
    const verifiedStoreSlug = String(guestCheckoutProof?.storeSlug || '').trim().toLowerCase();
    if (
      guestCheckoutProof
      && (
        (normalizedEmail && verifiedEmail !== normalizedEmail)
        || (normalizedStoreSlug && verifiedStoreSlug && verifiedStoreSlug !== normalizedStoreSlug)
      )
    ) {
      setGuestCheckoutProof(null);
      setGuestCheckoutOtpCode('');
      setGuestCheckoutOtpError('');
      setGuestCheckoutOtpCooldownSeconds(0);
      setGuestCheckoutIntentId(createGuestCheckoutIntentId());
    }

    if (
      guestCheckoutVerificationGrant
      && (
        (normalizedEmail && guestCheckoutVerificationGrant.email !== normalizedEmail)
        || (normalizedStoreSlug && guestCheckoutVerificationGrant.storeSlug !== normalizedStoreSlug)
      )
    ) {
      clearGuestCheckoutVerificationGrant({
        storeSlug: guestCheckoutVerificationGrant.storeSlug,
        email: guestCheckoutVerificationGrant.email
      });
      setGuestCheckoutVerificationGrant(null);
      setGuestCheckoutOtpError('');
      setGuestCheckoutOtpCooldownSeconds(0);
      setGuestCheckoutIntentId(createGuestCheckoutIntentId());
    }
  }, [guestCheckoutProof, guestCheckoutVerificationGrant, isDgfyCustomerSignedIn, normalizedEmail, normalizedStoreSlug]);

  useEffect(() => {
    if (isDgfyCustomerSignedIn || !normalizedEmail || !normalizedStoreSlug) return;
    const storedGrant = readGuestCheckoutVerificationGrant({
      storeSlug: normalizedStoreSlug,
      email: normalizedEmail
    });
    if (!storedGrant) return;
    setGuestCheckoutVerificationGrant((previous) => (
      previous?.grant === storedGrant.grant && previous?.expiresAt === storedGrant.expiresAt
        ? previous
        : storedGrant
    ));
  }, [isDgfyCustomerSignedIn, normalizedEmail, normalizedStoreSlug]);

  useEffect(() => {
    if (
      isDgfyCustomerSignedIn
      || !normalizedEmail
      || !normalizedStoreSlug
      || !guestCheckoutVerificationGrant
      || guestCheckoutVerificationGrant.email !== normalizedEmail
      || guestCheckoutVerificationGrant.storeSlug !== normalizedStoreSlug
      || guestCheckoutProof?.proof
    ) return undefined;

    const attemptKey = `${guestCheckoutVerificationGrant.grant}:${guestCheckoutIntentId}`;
    if (guestCheckoutGrantExchangeAttemptRef.current === attemptKey) return undefined;
    guestCheckoutGrantExchangeAttemptRef.current = attemptKey;

    let active = true;
    const restoreGuestCheckoutVerification = async () => {
      setGuestCheckoutOtpLoading(true);
      setGuestCheckoutOtpError('');
      try {
        const data = await requestJson(GUEST_CHECKOUT_GRANT_EXCHANGE_ENDPOINT, {
          method: 'POST',
          storeSlug: normalizedStoreSlug,
          body: {
            verification_grant: guestCheckoutVerificationGrant.grant,
            email: normalizedEmail,
            idempotency_key: guestCheckoutIntentId
          }
        });
        const proof = String(data?.guest_checkout_proof || '').trim();
        if (!proof) {
          throw new Error('Email verification could not be restored. Please verify your email again.');
        }
        if (!active) return;
        setGuestCheckoutProof({
          email: normalizedEmail,
          proof,
          storeSlug: normalizedStoreSlug
        });
        setGuestCheckoutOtpCode('');
        toast.success('Email verification restored. You can now place your order.');
      } catch (error) {
        if (!active) return;
        if (isGuestCheckoutVerificationGrantRejectedError(error)) {
          clearGuestCheckoutVerificationGrant({
            storeSlug: guestCheckoutVerificationGrant.storeSlug,
            email: guestCheckoutVerificationGrant.email
          });
          setGuestCheckoutVerificationGrant(null);
          setGuestCheckoutProof(null);
          if (String(error?.errorCode || error?.code || '').trim().toUpperCase() === 'AUTHENTICATION_FAILED') {
            onOtpExpired?.();
          }
        }
        setGuestCheckoutOtpError(error?.message || 'Email verification could not be restored. Please verify your email again.');
      } finally {
        if (active) setGuestCheckoutOtpLoading(false);
      }
    };

    void restoreGuestCheckoutVerification();
    return () => {
      active = false;
    };
  }, [
    guestCheckoutIntentId,
    guestCheckoutProof,
    guestCheckoutVerificationGrant,
    isDgfyCustomerSignedIn,
    normalizedEmail,
    normalizedStoreSlug,
    onOtpExpired,
    requestJson,
    toast
  ]);

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
      const verificationGrant = String(data?.guest_checkout_verification_grant || '').trim();
      const verificationGrantExpiresIn = Number(data?.verification_grant_expires_in);
      if (verificationGrant) {
        const storedGrant = writeGuestCheckoutVerificationGrant({
          storeSlug: normalizedStoreSlug,
          email: normalizedEmail,
          grant: verificationGrant,
          expiresIn: Number.isFinite(verificationGrantExpiresIn) && verificationGrantExpiresIn > 0
            ? verificationGrantExpiresIn
            : 24 * 60 * 60
        });
        setGuestCheckoutVerificationGrant(storedGrant || {
          version: 1,
          storeSlug: normalizedStoreSlug,
          email: normalizedEmail,
          grant: verificationGrant,
          expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        });
      }
      setGuestCheckoutProof({
        email: normalizedEmail,
        proof,
        storeSlug: normalizedStoreSlug
      });
      setGuestCheckoutOtpCode('');
      toast.success('Email verified. You can now place your order.');
      return true;
    } catch (error) {
      if (isGuestCheckoutOtpExpiredError(error)) {
        resetGuestCheckoutOtp();
        onOtpExpired?.();
        return false;
      }
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
    normalizedStoreSlug,
    onOtpExpired,
    requestJson,
    resetGuestCheckoutOtp,
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
    resetGuestCheckoutOtp,
  };
}
