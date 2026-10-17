import { afterEach, describe, expect, it, jest } from '@jest/globals';

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const tokenModel = {
    sequelize: { transaction: jest.fn(async (callback) => callback(transaction)) },
    findAll: jest.fn(), findByPk: jest.fn(), count: jest.fn(), create: jest.fn(), findOne: jest.fn(), update: jest.fn()
};
const deliveryModel = {
    sequelize: { transaction: jest.fn(async (callback) => callback(transaction)) },
    findOne: jest.fn(), create: jest.fn(), count: jest.fn(), findAll: jest.fn(), findByPk: jest.fn()
};
const tenantModel = { findByPk: jest.fn() };
const discoveryModel = { findOne: jest.fn() };
tenantModel.findByPk.mockResolvedValue({ id: '7d54bdb5-7b8a-4a10-a788-6b8897770001' });
jest.unstable_mockModule('../src/models/index.js', () => ({
    PushDeviceToken: tokenModel,
    PushDeliveryLog: deliveryModel,
    StorefrontDiscoveryIndex: discoveryModel,
    Tenant: tenantModel,
    default: { PushDeviceToken: tokenModel, PushDeliveryLog: deliveryModel, StorefrontDiscoveryIndex: discoveryModel, Tenant: tenantModel }
}));
const { pushDeviceTokenRepository, pushDeliveryLogRepository } = await import('../src/modules/pushDelivery/repositories/pushDeviceTokenRepository.js');

const accountOwner = { dgfy_account_id: 'd5cba9b3-c2f8-4768-8e80-101010101010' };
const guestOwner = {
    guest_tenant_id: '7d54bdb5-7b8a-4a10-a788-6b8897770001',
    guest_order_reference: 'SK-ABC123',
    guest_pos_transaction_id: 37
};
const payload = { token: 'ExponentPushToken[abcdefghijk]', platform: 'ios', app: 'storefront', brand: 'dgfy' };

afterEach(() => {
    jest.clearAllMocks();
    tokenModel.sequelize.transaction.mockImplementation(async (callback) => callback(transaction));
    deliveryModel.sequelize.transaction.mockImplementation(async (callback) => callback(transaction));
    tenantModel.findByPk.mockResolvedValue({ id: guestOwner.guest_tenant_id });
});

describe('pushDeviceTokenRepository', () => {
    it('rejects owners that do not bind exactly one account or guest order', async () => {
        await expect(pushDeviceTokenRepository.registerToken(payload, {})).rejects.toThrow('exactly one complete owner binding');
        await expect(pushDeviceTokenRepository.registerToken(payload, { ...accountOwner, ...guestOwner })).rejects.toThrow('exactly one complete owner binding');
        expect(tokenModel.sequelize.transaction).not.toHaveBeenCalled();
    });

    it('refreshes an existing token for the same owner without consuming another guest slot', async () => {
        const row = { ...payload, ...guestOwner, revoked_at: null, update: jest.fn().mockResolvedValue(undefined) };
        tokenModel.findAll.mockResolvedValue([row]);
        await expect(pushDeviceTokenRepository.registerToken(payload, guestOwner, { maxActiveGuestTokens: 5 }))
            .resolves.toMatchObject({ token: payload.token, guest_pos_transaction_id: 37 });
        expect(tenantModel.findByPk).toHaveBeenCalledWith(guestOwner.guest_tenant_id, {
            transaction,
            lock: 'UPDATE'
        });
        expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ last_seen_at: expect.any(Date) }), { transaction });
        expect(tokenModel.count).not.toHaveBeenCalled();
    });

    it('serializes guest registration and rejects a sixth active device', async () => {
        tokenModel.findAll.mockResolvedValue([]);
        tokenModel.count.mockResolvedValue(5);
        await expect(pushDeviceTokenRepository.registerToken(payload, guestOwner, { maxActiveGuestTokens: 5 }))
            .rejects.toMatchObject({ code: 'push_guest_token_limit' });
        expect(tokenModel.count).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ guest_pos_transaction_id: 37, revoked_at: null }),
            transaction
        }));
        expect(tokenModel.create).not.toHaveBeenCalled();
    });

    it('revokes the old owner when a token is reassigned', async () => {
        const oldRow = { id: 'old', revoked_at: null, update: jest.fn().mockResolvedValue(undefined) };
        tokenModel.findAll.mockResolvedValue([oldRow]);
        tokenModel.create.mockResolvedValue({ id: 'new', ...payload, ...accountOwner });
        await expect(pushDeviceTokenRepository.registerToken(payload, accountOwner)).resolves.toMatchObject({ id: 'new' });
        expect(oldRow.update).toHaveBeenCalledWith(expect.objectContaining({ revoke_reason: 'reassigned', revoked_at: expect.any(Date) }), { transaction });
        expect(tokenModel.create).toHaveBeenCalledWith(expect.objectContaining(accountOwner), { transaction });
    });

    it('reserves a pending delivery under owner, token, and order locks before network send', async () => {
        tokenModel.findByPk.mockResolvedValue({ id: 'device-1', ...guestOwner, revoked_at: null });
        deliveryModel.findOne.mockResolvedValue(null);
        deliveryModel.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
        deliveryModel.create.mockResolvedValue({ id: 'log-1' });
        const result = await pushDeliveryLogRepository.reservePending({
            id: 'log-1', dedupe_key: 'event:device-1', token_id: 'device-1', token_hash: 'a'.repeat(64),
            purpose: 'order_status', status: 'pending', tenant_id: guestOwner.guest_tenant_id,
            reference: guestOwner.guest_order_reference, sent_at: new Date('2026-10-17T00:00:00Z')
        }, { tokenSince: new Date('2026-10-16T23:00:00Z'), owner: guestOwner });

        expect(result).toEqual({ status: 'created', log: { id: 'log-1' } });
        expect(tenantModel.findByPk).toHaveBeenCalledWith(guestOwner.guest_tenant_id, { transaction, lock: 'UPDATE' });
        expect(tokenModel.findByPk).toHaveBeenCalledWith('device-1', { transaction, lock: 'UPDATE' });
        expect(deliveryModel.findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { dedupe_key: 'event:device-1' }, transaction, lock: 'UPDATE'
        }));
        expect(deliveryModel.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }), { transaction });
    });

    it('does not reserve a second pending delivery for a recorded event', async () => {
        tokenModel.findByPk.mockResolvedValue({ id: 'device-1', ...guestOwner, revoked_at: null });
        deliveryModel.findOne.mockResolvedValue({ id: 'already-recorded' });
        const result = await pushDeliveryLogRepository.reservePending({
            dedupe_key: 'event:device-1', token_id: 'device-1', tenant_id: guestOwner.guest_tenant_id,
            reference: guestOwner.guest_order_reference
        }, { owner: guestOwner });

        expect(result).toMatchObject({ status: 'duplicate', log: { id: 'already-recorded' } });
        expect(deliveryModel.count).not.toHaveBeenCalled();
        expect(deliveryModel.create).not.toHaveBeenCalled();
    });
});
