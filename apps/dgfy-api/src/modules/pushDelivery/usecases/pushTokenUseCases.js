import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { fail, ok } from '../../shared/contracts/applicationResult.js';
import { verifyStorePushProof } from '../../store/utils/storeJwtToken.js';
import { isValidExpoPushToken } from '../utils/pushTokenSecurity.js';

const normalizePin = (value) => String(value || '').trim().toUpperCase();
const normalizePlatform = (value) => String(value || '').trim().toLowerCase();
const finalStatuses = new Set(['completed', 'cancelled', 'rejected']);
const MAX_GUEST_TOKENS_PER_ORDER = 5;
const STAFF_PUSH_APPS = new Set(['pos', 'fiscalpos']);

const validateTokenPayload = (payload = {}) => {
    const token = String(payload.token || '').trim();
    const platform = normalizePlatform(payload.platform);
    const app = String(payload.app || '').trim();
    const brand = String(payload.brand || '').trim();
    if (!isValidExpoPushToken(token)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid Expo push token is required.');
    }
    if (!['ios', 'android'].includes(platform)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Platform must be ios or android.');
    }
    if (!app || app.length > 80 || !brand || brand.length > 80) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'App and brand are required and must be 80 characters or fewer.');
    }
    return { token, platform, app, brand };
};

const validateStaffTokenPayload = (payload = {}) => {
    const tokenPayload = validateTokenPayload(payload);
    if (!STAFF_PUSH_APPS.has(tokenPayload.app)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'App must be pos or fiscalpos.');
    }

    const previousToken = String(payload.previous_token || '').trim();
    if (previousToken && !isValidExpoPushToken(previousToken)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid previous Expo push token is required.');
    }
    return { ...tokenPayload, previous_token: previousToken || null };
};

const normalizeStaffIdentity = ({ tenantId, userId } = {}) => {
    const normalizedTenantId = String(tenantId || '').trim();
    const normalizedUserId = Number(userId);
    if (!normalizedTenantId || !Number.isSafeInteger(normalizedUserId) || normalizedUserId <= 0) {
        throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated tenant staff identity is required.');
    }
    return { tenantId: normalizedTenantId, userId: normalizedUserId };
};

const mapFailure = (error, fallbackMessage) => {
    if (error instanceof DomainError) return fail(error);
    if (error?.code === 'push_guest_token_limit') {
        return fail(new DomainError(DomainErrorCode.CONFLICT, 'This order already has the maximum number of push devices.'));
    }
    if (error?.code === 'push_guest_tenant_missing') {
        return fail(new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Order tenant was not found.'));
    }
    return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, fallbackMessage, { cause: error }));
};

const verifyGuestProof = ({ proofToken, tenantId, order, trackingPin, allowFinal = false } = {}) => {
    const proof = String(proofToken || '').trim();
    if (!proof) {
        throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'push_proof is required for guest push registration.');
    }

    let decoded;
    try {
        decoded = verifyStorePushProof(proof);
    } catch {
        throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Invalid or expired push_proof.');
    }

    const expectedOrderId = Number(order?.pos_transaction_id || 0);
    if (
        decoded?.type !== 'store_push_proof'
        || String(decoded?.tenant_id || '') !== String(tenantId || '')
        || Number(decoded?.order_id || 0) !== expectedOrderId
        || normalizePin(decoded?.tracking_pin) !== trackingPin
    ) {
        throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'push_proof does not match this order.');
    }
    if (order?.store_customer_id || order?.dgfy_account_id || order?.storeCustomer?.dgfy_account_id || order?.store_customer?.dgfy_account_id) {
        throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'This order is not eligible for guest push registration.');
    }
    if (!allowFinal && finalStatuses.has(String(order?.fulfillment_status || '').trim().toLowerCase())) {
        throw new DomainError(DomainErrorCode.CONFLICT, 'Push registration is unavailable for a final order.');
    }
    return decoded;
};

export const buildRegisterAccountPushTokenUseCase = ({ repository }) => async ({ accountId, payload } = {}) => {
    try {
        const ownerId = String(accountId || '').trim();
        if (!ownerId) throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'DGFY account authentication is required.');
        const tokenPayload = validateTokenPayload(payload);
        const saved = await repository.registerToken(tokenPayload, { dgfy_account_id: ownerId });
        return ok({ registered: true, token_id: saved.id });
    } catch (error) {
        return mapFailure(error, 'Push token registration failed.');
    }
};

export const buildDeleteAccountPushTokenUseCase = ({ repository }) => async ({ accountId, token } = {}) => {
    try {
        const ownerId = String(accountId || '').trim();
        const normalizedToken = String(token || '').trim();
        if (!ownerId) throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'DGFY account authentication is required.');
        if (!isValidExpoPushToken(normalizedToken)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid Expo push token is required.');
        }
        const revoked = await repository.revokeAccountToken({ token: normalizedToken, accountId: ownerId });
        return ok({ revoked: revoked > 0 });
    } catch (error) {
        return mapFailure(error, 'Push token removal failed.');
    }
};

export const buildRegisterGuestPushTokenUseCase = ({ repository, storeRepository }) => async ({
    tenantId,
    trackingPin,
    payload,
    allowFinal = false
} = {}) => {
    try {
        const normalizedTenantId = String(tenantId || '').trim();
        const normalizedPin = normalizePin(trackingPin);
        const tokenPayload = validateTokenPayload(payload);
        if (!normalizedTenantId || !normalizedPin) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Tenant and tracking PIN are required.');
        }
        const order = await storeRepository.getOrderByTrackingPin(normalizedPin);
        if (!order) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Order was not found.');
        verifyGuestProof({
            proofToken: payload?.push_proof,
            tenantId: normalizedTenantId,
            order,
            trackingPin: normalizedPin,
            allowFinal
        });
        const orderId = Number(order.pos_transaction_id || 0);
        const owner = {
            guest_tenant_id: normalizedTenantId,
            guest_order_reference: normalizedPin,
            guest_pos_transaction_id: orderId
        };
        const saved = await repository.registerToken(tokenPayload, owner, {
            maxActiveGuestTokens: MAX_GUEST_TOKENS_PER_ORDER
        });
        return ok({ registered: true, token_id: saved.id });
    } catch (error) {
        return mapFailure(error, 'Guest push token registration failed.');
    }
};

export const buildDeleteGuestPushTokenUseCase = ({ repository, storeRepository }) => async ({
    tenantId,
    trackingPin,
    payload
} = {}) => {
    try {
        const normalizedTenantId = String(tenantId || '').trim();
        const normalizedPin = normalizePin(trackingPin);
        const token = String(payload?.token || '').trim();
        if (!isValidExpoPushToken(token)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid Expo push token is required.');
        }
        const order = await storeRepository.getOrderByTrackingPin(normalizedPin);
        if (!order) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Order was not found.');
        verifyGuestProof({
            proofToken: payload?.push_proof,
            tenantId: normalizedTenantId,
            order,
            trackingPin: normalizedPin,
            allowFinal: true
        });
        const revoked = await repository.revokeGuestToken({
            token,
            tenantId: normalizedTenantId,
            reference: normalizedPin,
            posTransactionId: Number(order.pos_transaction_id || 0)
        });
        return ok({ revoked: revoked > 0 });
    } catch (error) {
        return mapFailure(error, 'Guest push token removal failed.');
    }
};

export const buildRegisterStaffPushTokenUseCase = ({ repository }) => async ({ tenantId, userId, payload } = {}) => {
    try {
        const identity = normalizeStaffIdentity({ tenantId, userId });
        const tokenPayload = validateStaffTokenPayload(payload);
        const saved = await repository.registerToken({
            token: tokenPayload.token,
            platform: tokenPayload.platform,
            app: tokenPayload.app,
            brand: tokenPayload.brand
        }, {
            staff_tenant_id: identity.tenantId,
            staff_user_id: identity.userId
        }, { previousToken: tokenPayload.previous_token });
        return ok({ registered: true, token_id: saved.id });
    } catch (error) {
        return mapFailure(error, 'Staff push token registration failed.');
    }
};

export const buildDeleteStaffPushTokenUseCase = ({ repository }) => async ({ tenantId, userId, token } = {}) => {
    try {
        const identity = normalizeStaffIdentity({ tenantId, userId });
        const normalizedToken = String(token || '').trim();
        if (!isValidExpoPushToken(normalizedToken)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid Expo push token is required.');
        }
        const revoked = await repository.revokeStaffToken({
            token: normalizedToken,
            tenantId: identity.tenantId,
            userId: identity.userId
        });
        return ok({ revoked: revoked > 0 });
    } catch (error) {
        return mapFailure(error, 'Staff push token removal failed.');
    }
};

export default {
    buildRegisterAccountPushTokenUseCase,
    buildDeleteAccountPushTokenUseCase,
    buildRegisterGuestPushTokenUseCase,
    buildDeleteGuestPushTokenUseCase,
    buildRegisterStaffPushTokenUseCase,
    buildDeleteStaffPushTokenUseCase
};
