export const GUEST_CHECKOUT_OTP_REQUEST_ENDPOINT = '/api/v1/store/checkout/guest-otp/request';
export const GUEST_CHECKOUT_OTP_VERIFY_ENDPOINT = '/api/v1/store/checkout/guest-otp/verify';
export const RESEND_COOLDOWN_SECONDS = 60;

export const createGuestCheckoutIntentId = (prefix = 'guest-checkout') => {
  const normalizedPrefix = String(prefix || 'guest-checkout').trim() || 'guest-checkout';
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `${normalizedPrefix}-${randomId}` : `${normalizedPrefix}-${Date.now()}`;
};

export const normalizeGuestCheckoutEmail = (email) => (
  String(email || '').trim().toLowerCase()
);

export const normalizeGuestCheckoutOtpCode = (code) => (
  String(code || '').replace(/\D/g, '').slice(0, 6)
);

export const formatGuestCheckoutCooldown = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return minutes > 0
    ? `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
    : `${remainingSeconds}s`;
};
