import jwt from 'jsonwebtoken';

const baseSecret = process.env.JWT_SECRET || 'store-fallback-secret-change-me';
const STORE_JWT_SECRET = process.env.STORE_JWT_SECRET || `${baseSecret}:store`;
const STORE_JWT_EXPIRY = process.env.STORE_JWT_EXPIRY || '24h';
const STORE_CANCEL_PROOF_SECRET = process.env.STORE_CANCEL_PROOF_SECRET || `${baseSecret}:store:cancel-proof`;
const STORE_CANCEL_PROOF_EXPIRY = process.env.STORE_CANCEL_PROOF_EXPIRY || '30m';
const STORE_CLAIM_TOKEN_SECRET = process.env.STORE_CLAIM_TOKEN_SECRET || `${baseSecret}:store:claim`;
const STORE_CLAIM_TOKEN_EXPIRY = process.env.STORE_CLAIM_TOKEN_EXPIRY || '30m';
const STORE_GUEST_CHECKOUT_PROOF_SECRET = process.env.STORE_GUEST_CHECKOUT_PROOF_SECRET || `${baseSecret}:store:guest-checkout-proof`;
const STORE_GUEST_CHECKOUT_PROOF_EXPIRY = process.env.STORE_GUEST_CHECKOUT_PROOF_EXPIRY || '15m';
const TENANT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const normalizeTenantIdentifier = (value) => {
    if (value == null) return null;

    const raw = String(value).trim();
    if (!raw) return null;

    if (TENANT_UUID_PATTERN.test(raw)) {
        return raw.toLowerCase();
    }

    if (/^\d+$/.test(raw)) {
        const asInt = parsePositiveInt(raw);
        if (asInt) return String(asInt);
    }

    return null;
};

export const generateStoreToken = ({ customer, tenantId }) => {
    const normalizedTenantId = normalizeTenantIdentifier(tenantId);
    if (!normalizedTenantId) {
        throw new Error('generateStoreToken requires a valid tenant identifier');
    }

    const payload = {
        type: 'store_customer',
        customer_id: customer.customer_id,
        tenant_id: normalizedTenantId,
        email: customer.email,
        name: customer.name
    };
    return jwt.sign(payload, STORE_JWT_SECRET, { expiresIn: STORE_JWT_EXPIRY });
};

export const verifyStoreToken = (token) => jwt.verify(token, STORE_JWT_SECRET);

export const generateStoreCancelProof = ({ trackingPin, tenantId, orderId, storeCustomerId = null }) => {
    const normalizedTenantId = normalizeTenantIdentifier(tenantId);
    if (!normalizedTenantId) {
        throw new Error('generateStoreCancelProof requires a valid tenant identifier');
    }

    const normalizedTrackingPin = String(trackingPin || '').trim().toUpperCase();
    if (!normalizedTrackingPin) {
        throw new Error('generateStoreCancelProof requires trackingPin');
    }

    const normalizedOrderId = parsePositiveInt(orderId);
    if (!normalizedOrderId) {
        throw new Error('generateStoreCancelProof requires orderId');
    }

    const normalizedStoreCustomerId = parsePositiveInt(storeCustomerId);

    const payload = {
        type: 'store_cancel_proof',
        tracking_pin: normalizedTrackingPin,
        tenant_id: normalizedTenantId,
        order_id: normalizedOrderId,
        store_customer_id: normalizedStoreCustomerId || null
    };

    return jwt.sign(payload, STORE_CANCEL_PROOF_SECRET, { expiresIn: STORE_CANCEL_PROOF_EXPIRY });
};

export const verifyStoreCancelProof = (token) => jwt.verify(token, STORE_CANCEL_PROOF_SECRET);

export const generateStoreClaimToken = ({ trackingPin, tenantId, orderId, email }) => {
    const normalizedTenantId = normalizeTenantIdentifier(tenantId);
    if (!normalizedTenantId) {
        throw new Error('generateStoreClaimToken requires a valid tenant identifier');
    }

    const normalizedTrackingPin = String(trackingPin || '').trim().toUpperCase();
    const normalizedOrderId = parsePositiveInt(orderId);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedTrackingPin || !normalizedOrderId || !normalizedEmail) {
        throw new Error('generateStoreClaimToken requires trackingPin, orderId, and email');
    }

    return jwt.sign({
        type: 'store_order_claim',
        tracking_pin: normalizedTrackingPin,
        tenant_id: normalizedTenantId,
        order_id: normalizedOrderId,
        email: normalizedEmail
    }, STORE_CLAIM_TOKEN_SECRET, { expiresIn: STORE_CLAIM_TOKEN_EXPIRY });
};

export const verifyStoreClaimToken = (token) => jwt.verify(token, STORE_CLAIM_TOKEN_SECRET);

export const generateStoreGuestCheckoutProof = ({ tenantId, email, idempotencyKey }) => {
    const normalizedTenantId = normalizeTenantIdentifier(tenantId);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedIdempotencyKey = String(idempotencyKey || '').trim();
    if (!normalizedTenantId || !normalizedEmail || !normalizedIdempotencyKey) {
        throw new Error('generateStoreGuestCheckoutProof requires tenantId, email, and idempotencyKey');
    }

    return jwt.sign({
        type: 'store_guest_checkout_proof',
        tenant_id: normalizedTenantId,
        email: normalizedEmail,
        idempotency_key: normalizedIdempotencyKey
    }, STORE_GUEST_CHECKOUT_PROOF_SECRET, { expiresIn: STORE_GUEST_CHECKOUT_PROOF_EXPIRY });
};

export const verifyStoreGuestCheckoutProof = (token, options) => jwt.verify(token, STORE_GUEST_CHECKOUT_PROOF_SECRET, options);

export const getStoreTokenConfig = () => ({
    expiresIn: STORE_JWT_EXPIRY,
    cancelProofExpiresIn: STORE_CANCEL_PROOF_EXPIRY,
    claimTokenExpiresIn: STORE_CLAIM_TOKEN_EXPIRY,
    guestCheckoutProofExpiresIn: STORE_GUEST_CHECKOUT_PROOF_EXPIRY
});
