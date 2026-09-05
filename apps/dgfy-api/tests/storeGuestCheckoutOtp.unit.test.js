import { describe, expect, it } from '@jest/globals';
import jwt from 'jsonwebtoken';
import {
  buildRequestStoreGuestCheckoutOtpUseCase,
  buildVerifyStoreGuestCheckoutOtpUseCase
} from '../src/modules/store/usecases/storeUseCases.js';
import { assertGuestCheckoutProof } from '../src/modules/store/utils/storeGuestCheckoutProof.js';
import {
  generateStoreGuestCheckoutProof,
  verifyStoreGuestCheckoutProof
} from '../src/modules/store/utils/storeJwtToken.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const tenantId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const email = 'guest@example.com';
const idempotencyKey = 'guest-checkout-12345678';

describe('Storefront guest checkout OTP', () => {
  it('binds a verified guest proof to one tenant, email, and checkout key', () => {
    const proof = generateStoreGuestCheckoutProof({ tenantId, email, idempotencyKey });
    expect(verifyStoreGuestCheckoutProof(proof)).toMatchObject({
      type: 'store_guest_checkout_proof',
      tenant_id: tenantId,
      email,
      idempotency_key: idempotencyKey
    });
    expect(() => assertGuestCheckoutProof({ tenantId, email, idempotencyKey, proof })).not.toThrow();
    expect(() => assertGuestCheckoutProof({ tenantId, email: 'other@example.com', idempotencyKey, proof })).toThrow('Verify the Gmail code');
    expect(() => assertGuestCheckoutProof({ tenantId, email, idempotencyKey: 'different-checkout-key', proof })).toThrow('Verify the Gmail code');
  });

  it('uses the tenant-scoped guest checkout OTP purpose and consumes it before issuing a proof', async () => {
    const requests = [];
    const verifications = [];
    const emailOtpService = {
      EMAIL_OTP_PURPOSES: { STOREFRONT_GUEST_CHECKOUT: 'storefront_guest_checkout' },
      requestEmailOtp: async (input) => {
        requests.push(input);
        return { delivery_status: 'sent' };
      },
      verifyEmailOtp: async (input) => verifications.push(input)
    };
    const request = buildRequestStoreGuestCheckoutOtpUseCase({ emailOtpService });
    const verify = buildVerifyStoreGuestCheckoutOtpUseCase({ emailOtpService });

    const requested = await request({ tenantId, payload: { email, idempotency_key: idempotencyKey } });
    expect(requested.success).toBe(true);
    expect(requested.data).toMatchObject({ delivery_status: 'sent' });
    const verified = await verify({ tenantId, payload: { email, code: '123456', idempotency_key: idempotencyKey } });

    expect(requests[0]).toMatchObject({ purpose: 'storefront_guest_checkout', tenantId, email });
    expect(verifications[0]).toMatchObject({ purpose: 'storefront_guest_checkout', tenantId, email, code: '123456' });
    expect(verifyStoreGuestCheckoutProof(verified.data.guest_checkout_proof)).toMatchObject({ tenant_id: tenantId, email, idempotency_key: idempotencyKey });
  });

  it('fails closed when the OTP service records a local or failed delivery', async () => {
    const emailOtpService = {
      EMAIL_OTP_PURPOSES: { STOREFRONT_GUEST_CHECKOUT: 'storefront_guest_checkout' },
      requestEmailOtp: async () => ({ delivery_status: 'recorded' })
    };
    const request = buildRequestStoreGuestCheckoutOtpUseCase({ emailOtpService });

    const result = await request({ tenantId, payload: { email, idempotency_key: idempotencyKey } });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.SERVICE_UNAVAILABLE);
    expect(result.error.statusCode).toBe(503);
  });

  it('#1614: reports an SMTP delivery failure as SERVICE_UNAVAILABLE, not a generic INTERNAL_ERROR', async () => {
    // emailOtpService.requestEmailOtp throws a plain Error carrying
    // .statusCode/.code (EMAIL_OTP_DELIVERY_FAILED / EMAIL_OTP_DELIVERY_UNAVAILABLE)
    // rather than a DomainError -- regression coverage for the #1614 incident,
    // where this was silently flattened to INTERNAL_ERROR by
    // mapStoreUseCaseError, hiding a well-classified SMTP outage behind a
    // generic error and forcing production log access just to triage it.
    for (const code of ['EMAIL_OTP_DELIVERY_FAILED', 'EMAIL_OTP_DELIVERY_UNAVAILABLE']) {
      const emailOtpService = {
        EMAIL_OTP_PURPOSES: { STOREFRONT_GUEST_CHECKOUT: 'storefront_guest_checkout' },
        requestEmailOtp: async () => {
          const error = new Error('Email verification code could not be sent');
          error.statusCode = 503;
          error.code = code;
          throw error;
        }
      };
      const request = buildRequestStoreGuestCheckoutOtpUseCase({ emailOtpService });

      const result = await request({ tenantId, payload: { email, idempotency_key: idempotencyKey } });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(DomainErrorCode.SERVICE_UNAVAILABLE);
      expect(result.error.statusCode).toBe(503);
      expect(result.error.code).not.toBe('INTERNAL_ERROR');
      // The internal EMAIL_OTP_DELIVERY_* code must never leak into `details`,
      // since useCaseResponder.js serializes `details` straight into the public
      // response body (`errors`) -- it belongs on observabilityReasonCode
      // instead, which no response path reads. Regression coverage for a
      // review finding on this same PR (RF-2).
      expect(result.error.details).toBeNull();
      expect(result.error.observabilityReasonCode).toBe(code);
    }
  });

  it('does not require a guest proof for a DGFY-linked customer', () => {
    expect(() => assertGuestCheckoutProof({
      tenantId,
      email,
      idempotencyKey,
      proof: '',
      storeCustomer: { dgfy_account_id: 'dgfy-account-1' }
    })).not.toThrow();
  });

  it('allows a signed guest proof to be reused after expiry only for paid finalization recovery', () => {
    const guestProofSecret = process.env.STORE_GUEST_CHECKOUT_PROOF_SECRET
      || `${process.env.JWT_SECRET || 'store-fallback-secret-change-me'}:store:guest-checkout-proof`;
    const expiredProof = jwt.sign({
      type: 'store_guest_checkout_proof',
      tenant_id: tenantId,
      email,
      idempotency_key: idempotencyKey
    }, guestProofSecret, { expiresIn: '-1s' });

    expect(() => assertGuestCheckoutProof({
      tenantId,
      email,
      idempotencyKey,
      proof: expiredProof
    })).toThrow('Verify the Gmail code');
    expect(() => assertGuestCheckoutProof({
      tenantId,
      email,
      idempotencyKey,
      proof: expiredProof,
      allowExpired: true
    })).not.toThrow();
  });
});
