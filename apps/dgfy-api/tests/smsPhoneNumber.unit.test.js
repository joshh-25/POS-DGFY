import { describe, expect, it } from '@jest/globals';
import { coarsePrefix, hashPhone, toE164 } from '../src/modules/smsDelivery/utils/phoneNumber.js';

describe('SMS phone number utilities', () => {
  it('normalizes local and international Philippine mobile numbers to the same E.164 value', () => {
    expect(toE164('09171234567')).toEqual({ ok: true, e164: '+639171234567' });
    expect(toE164('+639171234567')).toEqual({ ok: true, e164: '+639171234567' });
  });

  it('rejects garbage and returns only a coarse prefix for a valid number', () => {
    expect(toE164('not a phone')).toEqual({ ok: false, reason: 'invalid_phone' });
    expect(coarsePrefix('+639171234567')).toBe('+63917');
  });

  it('uses a keyed hash rather than exposing phone digits', () => {
    process.env.SMS_PHONE_HASH_SECRET = 'test-secret';
    expect(hashPhone('+639171234567')).toHaveLength(64);
    expect(hashPhone('+639171234567')).not.toContain('63917');
  });
});
