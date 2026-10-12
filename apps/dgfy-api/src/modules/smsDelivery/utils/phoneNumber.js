import crypto from 'node:crypto';
import parsePhoneNumber from 'libphonenumber-js';

export const toE164 = (raw, { defaultRegion = process.env.SMS_DEFAULT_REGION || 'PH' } = {}) => {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'empty_phone' };

  try {
    const parsed = parsePhoneNumber(raw.trim(), { defaultCountry: defaultRegion, extract: false });
    if (!parsed || !parsed.isValid()) return { ok: false, reason: 'invalid_phone' };
    return { ok: true, e164: parsed.number };
  } catch {
    return { ok: false, reason: 'invalid_phone' };
  }
};

export const hashPhone = (e164) => {
  const secret = process.env.SMS_PHONE_HASH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-sms-phone-hash-secret');
  if (!secret) throw new Error('SMS_PHONE_HASH_SECRET is required in production');
  return crypto.createHmac('sha256', secret).update(String(e164)).digest('hex');
};

export const coarsePrefix = (e164) => {
  if (typeof e164 !== 'string' || !/^\+[1-9]\d+$/.test(e164)) return null;
  try {
    const parsed = parsePhoneNumber(e164, { extract: false });
    if (!parsed) return null;
    // Keep the calling code and three following digits for coarse grouping.
    return e164.slice(0, Math.min(e164.length, 1 + parsed.countryCallingCode.length + 3));
  } catch {
    return null;
  }
};
