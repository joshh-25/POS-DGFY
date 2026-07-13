import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// guestCheckoutUseCases.js — the identity half of checkout (STF-03,
// 10-04-PLAN.md): guest email-OTP verification (D-05, reusing
// apps/dgfy-api/src/infra/emailOtp.js's STOREFRONT_GUEST_CHECKOUT purpose),
// a persistent landlord-side guest identity keyed by verified email (D-06),
// and identity resolution that lets a logged-in DGFY Account check out
// without forcing a guest to create one.
//
// `emailOtp` is injected as the module shape ({EMAIL_OTP_PURPOSES,
// requestEmailOtp, verifyEmailOtp}) rather than importing infra/emailOtp.js
// directly (Dependency Inversion) — mirrors cartValidation.js's
// productRepository injection, so this file stays unit-testable against a
// mock without a live dgfy_core connection or SMTP config.

const checkoutIdentityRequiredError = () => new DomainError(
    DomainErrorCode.AUTHENTICATION_FAILED,
    'Verification required: log in to a DGFY Account or verify your email to check out.',
    { statusCode: 401, details: { error_code: 'CHECKOUT_IDENTITY_REQUIRED' } }
);

// CR-03 fix (10-REVIEW.md): resolveCheckoutIdentity previously accepted a
// client-supplied guestIdentityId as authoritative without ever confirming
// it belongs to a real, previously-OTP-verified identity row — undermining
// the D-05/D-06 "guest is email-OTP verified" guarantee. This error is
// returned when the supplied id does not resolve to a real row.
const guestIdentityNotVerifiedError = () => new DomainError(
    DomainErrorCode.AUTHENTICATION_FAILED,
    'The supplied guest identity could not be verified.',
    { statusCode: 401, details: { error_code: 'GUEST_IDENTITY_NOT_VERIFIED' } }
);

/**
 * `emailOtp.requestEmailOtp`/`verifyEmailOtp` already throw a plain Error
 * carrying `.statusCode`/`.code` (see infra/emailOtp.js's createError()) —
 * ApplicationResult.failure() accepts any {code,message,statusCode}-shaped
 * error, so those OTP errors are returned to the caller as-is rather than
 * being re-wrapped, preserving their exact EMAIL_OTP_* codes/status.
 * @param {{guestIdentityRepository, emailOtp: {EMAIL_OTP_PURPOSES, requestEmailOtp: Function, verifyEmailOtp: Function}}} deps
 */
export function buildGuestCheckoutUseCases({ guestIdentityRepository, emailOtp } = {}) {
    if (!guestIdentityRepository) {
        throw new Error('buildGuestCheckoutUseCases requires a guestIdentityRepository.');
    }
    if (!emailOtp || typeof emailOtp.requestEmailOtp !== 'function' || typeof emailOtp.verifyEmailOtp !== 'function') {
        throw new Error('buildGuestCheckoutUseCases requires an emailOtp module (requestEmailOtp/verifyEmailOtp).');
    }

    const purpose = emailOtp.EMAIL_OTP_PURPOSES?.STOREFRONT_GUEST_CHECKOUT || 'storefront_guest_checkout';

    /**
     * Requests a guest checkout email-OTP code. Delegates all email-format
     * validation, purpose validation, and SMTP-unconfigured handling to
     * emailOtp.requestEmailOtp (503 EMAIL_OTP_DELIVERY_UNAVAILABLE when SMTP
     * is unconfigured — existing behavior, unchanged here). Rate limiting is
     * applied at the route layer (express-rate-limit, T-10-04-01).
     * @param {{email: string}} input
     */
    const requestGuestOtp = async ({ email } = {}) => {
        try {
            const otp = await emailOtp.requestEmailOtp({ purpose, email });
            return ApplicationResult.success({
                otp_id: otp.otp_id,
                purpose: otp.purpose,
                email: otp.email,
                expires_at: otp.expires_at,
                delivery_status: otp.delivery_status
            });
        } catch (error) {
            return ApplicationResult.failure(error);
        }
    };

    /**
     * Verifies a guest checkout email-OTP code (consuming it) and upserts
     * the persistent guest identity (D-06) — a repeat guest with the same
     * verified email reuses the SAME identity id. Phone/displayName are
     * stored as unverified contact only (D-05) — never OTP-challenged.
     * @param {{email: string, code: string, phone?: string, displayName?: string}} input
     */
    const verifyGuestOtp = async ({ email, code, phone, displayName } = {}) => {
        try {
            await emailOtp.verifyEmailOtp({ purpose, email, code });
        } catch (error) {
            return ApplicationResult.failure(error);
        }

        const guestIdentityId = await guestIdentityRepository.upsertByVerifiedEmail({ email, phone, displayName });
        return ApplicationResult.success({ guest_identity_id: guestIdentityId, verified: true });
    };

    /**
     * Resolves "who is checking out" (must_haves truth #4): an
     * authenticated DGFY Account always wins when present (never forced to
     * verify as a guest too); otherwise a verified guest identity is used;
     * otherwise verification is required. The returned shape is an
     * application-level cross-DB reference (no FK) consumed by placeOrder
     * (10-06) — never both keys populated at once.
     * CR-03 fix (10-REVIEW.md): a client-supplied guestIdentityId is no
     * longer trusted as authoritative on its own — it is looked up via
     * guestIdentityRepository.findById() and rejected with 401 when it
     * does not resolve to a real row, so an attacker who has merely
     * learned/guessed another guest's opaque identity id can no longer
     * attribute an order to it without that identity having actually gone
     * through verifyGuestOtp at some point.
     * @param {{authenticatedAccountId?: string|null, guestIdentityId?: string|null}} input
     */
    const resolveCheckoutIdentity = async ({ authenticatedAccountId, guestIdentityId } = {}) => {
        if (authenticatedAccountId) {
            return ApplicationResult.success({ customer_account_id: authenticatedAccountId });
        }
        if (guestIdentityId) {
            const identity = await guestIdentityRepository.findById(guestIdentityId);
            if (!identity) {
                return ApplicationResult.failure(guestIdentityNotVerifiedError());
            }
            return ApplicationResult.success({ guest_identity_id: identity.id });
        }
        return ApplicationResult.failure(checkoutIdentityRequiredError());
    };

    return { requestGuestOtp, verifyGuestOtp, resolveCheckoutIdentity };
}

export default buildGuestCheckoutUseCases;
