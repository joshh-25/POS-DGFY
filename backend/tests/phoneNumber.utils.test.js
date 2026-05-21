import {
    isValidPhoneNumber,
    normalizePhoneNumber,
    PHONE_NUMBER_VALIDATION_MESSAGE
} from '../src/utils/phoneNumber.js';

describe('phone number utility', () => {
    it('normalizes leading and trailing whitespace', () => {
        expect(normalizePhoneNumber('  +63 912 345 6789  ')).toBe('+63 912 345 6789');
    });

    it('accepts the supported phone number character set and length', () => {
        expect(isValidPhoneNumber('+63 912 345 6789')).toBe(true);
        expect(isValidPhoneNumber('(02) 8123-4567')).toBe(true);
    });

    it('rejects blank, short, and unsupported phone numbers', () => {
        expect(isValidPhoneNumber('')).toBe(false);
        expect(isValidPhoneNumber('123456')).toBe(false);
        expect(isValidPhoneNumber('+63 912 345 ext 1')).toBe(false);
    });

    it('keeps one backend validation message for callers', () => {
        expect(PHONE_NUMBER_VALIDATION_MESSAGE).toContain('7-40 characters');
    });
});
