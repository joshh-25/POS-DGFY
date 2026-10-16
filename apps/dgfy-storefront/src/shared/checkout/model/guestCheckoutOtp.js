export const GUEST_CHECKOUT_OTP_REQUEST_ENDPOINT = '/api/v1/store/checkout/guest-otp/request';
export const GUEST_CHECKOUT_OTP_VERIFY_ENDPOINT = '/api/v1/store/checkout/guest-otp/verify';
export const GUEST_CHECKOUT_GRANT_EXCHANGE_ENDPOINT = '/api/v1/store/checkout/guest-otp/exchange';
export const RESEND_COOLDOWN_SECONDS = 60;
export const GUEST_CHECKOUT_OTP_EXPIRED_REASON = 'GUEST_CHECKOUT_OTP_EXPIRED';
export const GUEST_CHECKOUT_VERIFICATION_GRANT_STORAGE_KEY = 'dgfy_store_guest_checkout_verification_grant_v1';
export const GUEST_CHECKOUT_VERIFICATION_GRANT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE = 'Guest checkout needs a separate 6-digit email code. If your DGFY email is already verified, sign in or verify this guest email in Step 1.';
// #622: distinct from the OTP message above -- this store has disabled guest checkout entirely,
// not just gated it behind email verification.
export const GUEST_CHECKOUT_DISABLED_MESSAGE = 'This store requires a DGFY account to check out. Sign in or create an account to continue.';

export const createGuestCheckoutIntentId = (prefix = 'guest-checkout') => {
  const normalizedPrefix = String(prefix || 'guest-checkout').trim() || 'guest-checkout';
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `${normalizedPrefix}-${randomId}` : `${normalizedPrefix}-${Date.now()}`;
};

export const normalizeGuestCheckoutEmail = (email) => (
  String(email || '').trim().toLowerCase()
);

const normalizeGuestCheckoutStoreSlug = (storeSlug) => (
  String(storeSlug || '').trim().toLowerCase()
);

export const buildGuestCheckoutVerificationGrantStorageKey = ({ storeSlug, email } = {}) => {
  const normalizedStoreSlug = normalizeGuestCheckoutStoreSlug(storeSlug);
  const normalizedEmail = normalizeGuestCheckoutEmail(email);
  if (!normalizedStoreSlug || !normalizedEmail) return '';
  return `${GUEST_CHECKOUT_VERIFICATION_GRANT_STORAGE_KEY}:${encodeURIComponent(normalizedStoreSlug)}:${encodeURIComponent(normalizedEmail)}`;
};

export const normalizeGuestCheckoutVerificationGrant = (value) => {
  if (!value || typeof value !== 'object') return null;
  const storeSlug = normalizeGuestCheckoutStoreSlug(value.storeSlug || value.store_slug);
  const email = normalizeGuestCheckoutEmail(value.email);
  const grant = String(value.grant || value.verification_grant || '').trim();
  const expiresAt = Number(value.expiresAt || value.expires_at);
  if (!storeSlug || !email || !grant || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {
    version: 1,
    storeSlug,
    email,
    grant,
    expiresAt
  };
};

// The grant is a signed, tenant/email-bound verification capability, not an auth/session token.
// It is intentionally retained for the server-declared 24-hour window so a checkout remount can
// exchange it for a fresh idempotency-bound proof without asking the customer for another OTP.
export const readGuestCheckoutVerificationGrant = ({ storeSlug, email } = {}) => {
  if (typeof window === 'undefined') return null;
  const storageKey = buildGuestCheckoutVerificationGrantStorageKey({ storeSlug, email });
  if (!storageKey) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
    const normalized = normalizeGuestCheckoutVerificationGrant(parsed);
    if (!normalized) window.localStorage.removeItem(storageKey);
    return normalized;
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Storage may be unavailable in privacy-restricted browsers; the in-memory flow still works.
    }
    return null;
  }
};

export const writeGuestCheckoutVerificationGrant = ({ storeSlug, email, grant, expiresIn } = {}) => {
  if (typeof window === 'undefined') return null;
  const storageKey = buildGuestCheckoutVerificationGrantStorageKey({ storeSlug, email });
  const normalizedExpiresIn = Number(expiresIn);
  if (!storageKey || !Number.isFinite(normalizedExpiresIn) || normalizedExpiresIn <= 0) return null;
  const normalized = normalizeGuestCheckoutVerificationGrant({
    storeSlug,
    email,
    grant,
    expiresAt: Date.now() + Math.min(normalizedExpiresIn * 1000, GUEST_CHECKOUT_VERIFICATION_GRANT_MAX_AGE_MS)
  });
  if (!normalized) return null;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  } catch {
    return null;
  }
};

export const clearGuestCheckoutVerificationGrant = ({ storeSlug, email } = {}) => {
  if (typeof window === 'undefined') return;
  const storageKey = buildGuestCheckoutVerificationGrantStorageKey({ storeSlug, email });
  if (!storageKey) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Storage may be unavailable; nothing else is required for the in-memory flow.
  }
};

export const normalizeGuestCheckoutOtpCode = (code) => (
  String(code || '').replace(/\D/g, '').slice(0, 6)
);

export const isGuestCheckoutOtpExpiredError = (error) => (
  String(
    error?.details?.reason_code
      || error?.details?.reasonCode
      || error?.errorCode
      || error?.code
      || ''
  ).trim().toUpperCase() === GUEST_CHECKOUT_OTP_EXPIRED_REASON
    || String(error?.errorCode || error?.code || '').trim().toUpperCase() === 'EMAIL_OTP_EXPIRED'
);

export const isGuestCheckoutVerificationGrantRejectedError = (error) => {
  const errorCode = String(error?.errorCode || error?.code || '').trim().toUpperCase();
  return errorCode === 'AUTHENTICATION_FAILED' || errorCode === 'DGFY_ACCOUNT_SIGN_IN_REQUIRED';
};

export const formatGuestCheckoutCooldown = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return minutes > 0
    ? `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
    : `${remainingSeconds}s`;
};
