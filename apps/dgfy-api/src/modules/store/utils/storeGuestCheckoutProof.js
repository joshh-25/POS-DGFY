import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { buildGuestCheckoutDisabledError } from '../../shared/utils/customerAccessPolicy.js';
import {
    normalizeTenantIdentifier,
    verifyStoreGuestCheckoutProof
} from './storeJwtToken.js';

const isStorefrontGuestOtpRequired = () => (
    String(process.env.STOREFRONT_GUEST_OTP_REQUIRED || 'true').trim().toLowerCase() !== 'false'
);

const isDgfyStoreCustomer = (storeCustomer) => Boolean(String(storeCustomer?.dgfy_account_id || '').trim());

// #622: distinct from assertGuestCheckoutProof below -- this gates whether a guest may check out
// at all (per-store merchant policy), not whether their email is OTP-verified (the existing,
// process-wide STOREFRONT_GUEST_OTP_REQUIRED concern). Different control, different error, called
// first so a store with guest checkout off never gets as far as the OTP guard.
export const assertGuestCheckoutAllowed = ({ guestCheckoutEnabled = true, storeCustomer } = {}) => {
    if (guestCheckoutEnabled !== false || isDgfyStoreCustomer(storeCustomer)) return;
    throw buildGuestCheckoutDisabledError();
};

export const assertGuestCheckoutProof = ({ tenantId, email, idempotencyKey, proof, storeCustomer, allowExpired = false }) => {
    if (!isStorefrontGuestOtpRequired() || isDgfyStoreCustomer(storeCustomer)) return;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'A verified Gmail address is required for guest checkout.',
            { statusCode: 422 }
        );
    }

    try {
        const decoded = verifyStoreGuestCheckoutProof(proof, allowExpired ? { ignoreExpiration: true } : undefined);
        if (
            decoded?.type !== 'store_guest_checkout_proof'
            || normalizeTenantIdentifier(decoded?.tenant_id) !== normalizeTenantIdentifier(tenantId)
            || String(decoded?.email || '').trim().toLowerCase() !== normalizedEmail
            || String(decoded?.idempotency_key || '').trim() !== String(idempotencyKey || '').trim()
        ) {
            throw new Error('Guest checkout proof does not match this order.');
        }
    } catch {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Verify the Gmail code before placing this guest order.',
            { statusCode: 422 }
        );
    }
};
