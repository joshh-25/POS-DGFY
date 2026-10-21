import { afterEach, describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { generateStoreCancelProof, generateStorePushProof } from '../src/modules/store/utils/storeJwtToken.js';
import {
    buildDeleteGuestPushTokenUseCase,
    buildRegisterAccountPushTokenUseCase,
    buildRegisterGuestPushTokenUseCase,
    buildDeleteStaffPushTokenUseCase,
    buildRegisterStaffPushTokenUseCase
} from '../src/modules/pushDelivery/usecases/pushTokenUseCases.js';

const tenantId = '7d54bdb5-7b8a-4a10-a788-6b8897770001';
const token = 'ExponentPushToken[abcdefghijk]';
const payload = { token, platform: 'ios', app: 'storefront', brand: 'dgfy' };
const makeOrder = (overrides = {}) => ({
    pos_transaction_id: 37,
    tracking_pin: 'SK-ABC123',
    fulfillment_status: 'confirmed',
    store_customer_id: null,
    ...overrides
});
const proofFor = (overrides = {}) => generateStorePushProof({
    trackingPin: 'SK-ABC123',
    tenantId,
    orderId: 37,
    ...overrides
});

describe('push token use cases', () => {
    afterEach(() => jest.restoreAllMocks());

    it('requires checkout proof and rejects mismatched, expired, and wrong-type proofs', async () => {
        const repository = { registerToken: jest.fn() };
        const storeRepository = { getOrderByTrackingPin: jest.fn().mockResolvedValue(makeOrder()) };
        const register = buildRegisterGuestPushTokenUseCase({ repository, storeRepository });

        const missing = await register({ tenantId, trackingPin: 'SK-ABC123', payload });
        expect(missing.error.code).toBe('AUTHENTICATION_FAILED');

        const mismatch = await register({
            tenantId,
            trackingPin: 'SK-ABC123',
            payload: { ...payload, push_proof: proofFor({ orderId: 38 }) }
        });
        expect(mismatch.error.code).toBe('AUTHORIZATION_FAILED');

        const otherTenant = await register({
            tenantId,
            trackingPin: 'SK-ABC123',
            payload: { ...payload, push_proof: proofFor({ tenantId: 'ee600901-8588-4aa7-9aed-0a2032700002' }) }
        });
        expect(otherTenant.error.code).toBe('AUTHORIZATION_FAILED');

        const otherPin = await register({
            tenantId,
            trackingPin: 'SK-ABC123',
            payload: { ...payload, push_proof: proofFor({ trackingPin: 'SK-XYZ999' }) }
        });
        expect(otherPin.error.code).toBe('AUTHORIZATION_FAILED');

        const baseSecret = process.env.JWT_SECRET || 'store-fallback-secret-change-me';
        const pushProofSecret = process.env.STORE_PUSH_PROOF_SECRET || `${baseSecret}:store:push-proof`;
        const expiredProof = jwt.sign({
            type: 'store_push_proof', tenant_id: tenantId, order_id: 37, tracking_pin: 'SK-ABC123'
        }, pushProofSecret, { expiresIn: -1 });
        const expired = await register({
            tenantId,
            trackingPin: 'SK-ABC123',
            payload: { ...payload, push_proof: expiredProof }
        });
        expect(expired.error.code).toBe('AUTHORIZATION_FAILED');

        const cancellationProof = generateStoreCancelProof({ trackingPin: 'SK-ABC123', tenantId, orderId: 37 });
        const wrongType = await register({
            tenantId,
            trackingPin: 'SK-ABC123',
            payload: { ...payload, push_proof: cancellationProof }
        });
        expect(wrongType.error.code).toBe('AUTHORIZATION_FAILED');
        expect(repository.registerToken).not.toHaveBeenCalled();
    });

    it('rejects linked and final orders and maps the guest-device cap to conflict', async () => {
        const repository = { registerToken: jest.fn().mockRejectedValue(Object.assign(new Error('cap'), { code: 'push_guest_token_limit' })) };
        const order = makeOrder();
        const storeRepository = { getOrderByTrackingPin: jest.fn().mockImplementation(async () => order) };
        const register = buildRegisterGuestPushTokenUseCase({ repository, storeRepository });

        order.storeCustomer = { dgfy_account_id: 'a3dc79fd-4919-4eb7-945c-e10a1f3f2f01' };
        const linked = await register({ tenantId, trackingPin: 'SK-ABC123', payload: { ...payload, push_proof: proofFor() } });
        expect(linked.error.code).toBe('AUTHORIZATION_FAILED');

        order.storeCustomer = null;
        order.fulfillment_status = 'completed';
        const finalOrder = await register({ tenantId, trackingPin: 'SK-ABC123', payload: { ...payload, push_proof: proofFor() } });
        expect(finalOrder.error.code).toBe('CONFLICT');

        order.fulfillment_status = 'confirmed';
        const capped = await register({ tenantId, trackingPin: 'SK-ABC123', payload: { ...payload, push_proof: proofFor() } });
        expect(capped.error.code).toBe('CONFLICT');
        expect(repository.registerToken).toHaveBeenCalledWith(
            payload,
            expect.objectContaining({ guest_tenant_id: tenantId, guest_order_reference: 'SK-ABC123', guest_pos_transaction_id: 37 }),
            { maxActiveGuestTokens: 5 }
        );
    });

    it('registers account tokens under the authenticated account and returns no raw token', async () => {
        const repository = { registerToken: jest.fn().mockResolvedValue({ id: 'device-1' }) };
        const register = buildRegisterAccountPushTokenUseCase({ repository });
        const result = await register({ accountId: 'd5cba9b3-c2f8-4768-8e80-101010101010', payload });

        expect(result).toMatchObject({ success: true, data: { registered: true, token_id: 'device-1' } });
        expect(JSON.stringify(result)).not.toContain(token);
        expect(repository.registerToken).toHaveBeenCalledWith(payload, {
            dgfy_account_id: 'd5cba9b3-c2f8-4768-8e80-101010101010'
        });
    });

    it('registers and refreshes staff tokens under the authenticated tenant/user pair', async () => {
        const repository = { registerToken: jest.fn().mockResolvedValue({ id: 'staff-device-1' }) };
        const register = buildRegisterStaffPushTokenUseCase({ repository });
        const staffPayload = {
            token,
            previous_token: 'ExponentPushToken[previousdevice]',
            platform: 'android',
            app: 'fiscalpos',
            brand: 'Fiscal POS'
        };

        const result = await register({ tenantId, userId: 14, payload: staffPayload });

        expect(result).toMatchObject({
            success: true,
            data: { registered: true, token_id: 'staff-device-1' }
        });
        expect(JSON.stringify(result)).not.toContain(token);
        expect(repository.registerToken).toHaveBeenCalledWith({
            token,
            platform: 'android',
            app: 'fiscalpos',
            brand: 'Fiscal POS'
        }, { staff_tenant_id: tenantId, staff_user_id: 14 }, {
            previousToken: 'ExponentPushToken[previousdevice]'
        });

        const invalidApp = await register({ tenantId, userId: 14, payload: { ...staffPayload, app: 'storefront' } });
        expect(invalidApp.error.code).toBe('VALIDATION_FAILED');
        const missingIdentity = await register({ tenantId, userId: 0, payload: staffPayload });
        expect(missingIdentity.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('deletes a staff token only for the authenticated tenant/user owner', async () => {
        const repository = { revokeStaffToken: jest.fn().mockResolvedValue(1) };
        const remove = buildDeleteStaffPushTokenUseCase({ repository });

        const result = await remove({ tenantId, userId: 14, token });

        expect(result).toMatchObject({ success: true, data: { revoked: true } });
        expect(repository.revokeStaffToken).toHaveBeenCalledWith({ token, tenantId, userId: 14 });
    });

    it('deletes a guest token only for the proof-bound order', async () => {
        const repository = { revokeGuestToken: jest.fn().mockResolvedValue(1) };
        const storeRepository = { getOrderByTrackingPin: jest.fn().mockResolvedValue(makeOrder()) };
        const remove = buildDeleteGuestPushTokenUseCase({ repository, storeRepository });
        const result = await remove({
            tenantId,
            trackingPin: 'SK-ABC123',
            payload: { token, push_proof: proofFor() }
        });

        expect(result).toMatchObject({ success: true, data: { revoked: true } });
        expect(repository.revokeGuestToken).toHaveBeenCalledWith({
            token,
            tenantId,
            reference: 'SK-ABC123',
            posTransactionId: 37
        });
    });
});
