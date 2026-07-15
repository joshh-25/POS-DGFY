import { describe, it, expect, afterEach } from '@jest/globals';
import { getHashSecret } from '../../../src/infra/emailOtp.js';

/**
 * WR-02 fix (10-REVIEW.md): `getHashSecret()` previously fell back to a
 * static, source-visible constant ('email_otp_local_fallback_change_me')
 * whenever EMAIL_OTP_SECRET/JWT_SECRET/REFRESH_TOKEN_SECRET were all unset
 * — a defense-in-depth gap now gating real money-moving storefront
 * checkout (STOREFRONT_GUEST_CHECKOUT). This suite proves the fixed
 * behavior: the fallback constant is only ever used in development/test,
 * and every other environment fails closed with a 500 rather than hashing
 * OTP codes with a well-known secret.
 */

const ORIGINAL_ENV = { ...process.env };

describe('getHashSecret (WR-02)', () => {
    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('uses EMAIL_OTP_SECRET when configured, regardless of environment', () => {
        process.env.NODE_ENV = 'production';
        process.env.EMAIL_OTP_SECRET = 'a-real-configured-secret';
        delete process.env.JWT_SECRET;
        delete process.env.REFRESH_TOKEN_SECRET;

        expect(getHashSecret()).toBe('a-real-configured-secret');
    });

    it('falls back to JWT_SECRET, then REFRESH_TOKEN_SECRET, in precedence order', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.EMAIL_OTP_SECRET;
        process.env.JWT_SECRET = 'jwt-secret-value';
        process.env.REFRESH_TOKEN_SECRET = 'refresh-secret-value';

        expect(getHashSecret()).toBe('jwt-secret-value');

        delete process.env.JWT_SECRET;
        expect(getHashSecret()).toBe('refresh-secret-value');
    });

    it('still uses the static fallback in development when nothing is configured (local-dev convenience preserved)', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.EMAIL_OTP_SECRET;
        delete process.env.JWT_SECRET;
        delete process.env.REFRESH_TOKEN_SECRET;

        expect(getHashSecret()).toBe('email_otp_local_fallback_change_me');
    });

    it('still uses the static fallback in test when nothing is configured', () => {
        process.env.NODE_ENV = 'test';
        delete process.env.EMAIL_OTP_SECRET;
        delete process.env.JWT_SECRET;
        delete process.env.REFRESH_TOKEN_SECRET;

        expect(getHashSecret()).toBe('email_otp_local_fallback_change_me');
    });

    it('fails closed with a 500 EMAIL_OTP_SECRET_NOT_CONFIGURED error in production when nothing is configured (WR-02 core fix)', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.EMAIL_OTP_SECRET;
        delete process.env.JWT_SECRET;
        delete process.env.REFRESH_TOKEN_SECRET;

        expect(() => getHashSecret()).toThrow(/Email OTP hashing secret is not configured/);
        try {
            getHashSecret();
            throw new Error('expected getHashSecret to throw');
        } catch (error) {
            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('EMAIL_OTP_SECRET_NOT_CONFIGURED');
        }
    });

    it('fails closed in staging (any non-development/test NODE_ENV) when nothing is configured', () => {
        process.env.NODE_ENV = 'staging';
        delete process.env.EMAIL_OTP_SECRET;
        delete process.env.JWT_SECRET;
        delete process.env.REFRESH_TOKEN_SECRET;

        expect(() => getHashSecret()).toThrow(/Email OTP hashing secret is not configured/);
    });
});
