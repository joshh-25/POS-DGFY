import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    normalizeTenantIdentifier,
    verifyStoreGuestCheckoutProof
} from './storeJwtToken.js';

const isStorefrontGuestOtpRequired = () => (
    String(process.env.STOREFRONT_GUEST_OTP_REQUIRED || 'true').trim().toLowerCase() !== 'false'
);

const isDgfyStoreCustomer = (storeCustomer) => Boolean(String(storeCustomer?.dgfy_account_id || '').trim());

export const assertGuestCheckoutProof = ({ tenantId, email, idempotencyKey, proof, storeCustomer }) => {
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
        const decoded = verifyStoreGuestCheckoutProof(proof);
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
