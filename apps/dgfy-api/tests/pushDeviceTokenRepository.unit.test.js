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
const staffOwner = {
    staff_tenant_id: '7d54bdb5-7b8a-4a10-a788-6b8897770001',
    staff_user_id: 14
};
const payload = { token: 'ExponentPushToken[abcdefghijk]', platform: 'ios', app: 'storefront', brand: 'dgfy' };

afterEach(() => {
    jest.clearAllMocks();
    tokenModel.sequelize.transaction.mockImplementation(async (callback) => callback(transaction));
    deliveryModel.sequelize.transaction.mockImplementation(async (callback) => callback(transaction));
    tenantModel.findByPk.mockResolvedValue({ id: guestOwner.guest_tenant_id });
});

describe('pushDeviceTokenRepository', () => {
    it('rejects owners that do not bind exactly one account, guest order, or staff user', async () => {
        await expect(pushDeviceTokenRepository.registerToken(payload, {})).rejects.toThrow('exactly one complete owner binding');
        await expect(pushDeviceTokenRepository.registerToken(payload, { ...accountOwner, ...guestOwner })).rejects.toThrow('exactly one complete owner binding');
        await expect(pushDeviceTokenRepository.registerToken(payload, { ...accountOwner, ...staffOwner })).rejects.toThrow('exactly one complete owner binding');
        await expect(pushDeviceTokenRepository.registerToken(payload, { staff_tenant_id: staffOwner.staff_tenant_id })).rejects.toThrow('exactly one complete owner binding');
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

    it('moves one active token between staff owners without leaving a duplicate active row', async () => {
        const oldRow = {
            id: 'old', token: payload.token, staff_tenant_id: staffOwner.staff_tenant_id,
            staff_user_id: 9, revoked_at: null, update: jest.fn().mockResolvedValue(undefined)
        };
        tokenModel.findAll.mockResolvedValue([oldRow]);
        tokenModel.create.mockResolvedValue({ id: 'new', ...payload, ...staffOwner });

        await expect(pushDeviceTokenRepository.registerToken(payload, staffOwner)).resolves.toMatchObject({ id: 'new' });

        expect(oldRow.update).toHaveBeenCalledWith(expect.objectContaining({ revoke_reason: 'reassigned' }), { transaction });
        expect(tokenModel.create).toHaveBeenCalledWith(expect.objectContaining(staffOwner), { transaction });
    });

    it('refreshes a staff token owned by the same tenant/user without inserting another row', async () => {
        const row = { id: 'staff-device', token: payload.token, ...staffOwner, revoked_at: null, update: jest.fn() };
        tokenModel.findAll.mockResolvedValue([row]);

        await expect(pushDeviceTokenRepository.registerToken(payload, staffOwner)).resolves.toMatchObject({ id: 'staff-device' });

        expect(row.update).toHaveBeenCalledWith(expect.objectContaining({
            platform: payload.platform,
            last_seen_at: expect.any(Date)
        }), { transaction });
        expect(tokenModel.create).not.toHaveBeenCalled();
    });

    it('revokes a previous Expo token in the same owner transaction only for that staff owner', async () => {
        const previousToken = 'ExponentPushToken[previousdevice]';
        const previousRow = {
            id: 'previous', token: previousToken, ...staffOwner, revoked_at: null,
            update: jest.fn().mockResolvedValue(undefined)
        };
        tokenModel.findAll.mockResolvedValue([previousRow]);
        tokenModel.create.mockResolvedValue({ id: 'replacement', ...payload, ...staffOwner });

        await expect(pushDeviceTokenRepository.registerToken(payload, staffOwner, { previousToken }))
            .resolves.toMatchObject({ id: 'replacement' });

        expect(previousRow.update).toHaveBeenCalledWith(expect.objectContaining({
            revoke_reason: 'refreshed', revoked_at: expect.any(Date)
        }), { transaction });
        expect(tokenModel.create).toHaveBeenCalledWith(expect.objectContaining(staffOwner), { transaction });
    });

    it('does not revoke a previous Expo token owned by another staff user', async () => {
        const previousToken = 'ExponentPushToken[previousdevice]';
        const previousRow = {
            id: 'previous', token: previousToken, ...staffOwner, staff_user_id: 99, revoked_at: null,
            update: jest.fn().mockResolvedValue(undefined)
        };
        tokenModel.findAll.mockResolvedValue([previousRow]);
        tokenModel.create.mockResolvedValue({ id: 'replacement', ...payload, ...staffOwner });

        await pushDeviceTokenRepository.registerToken(payload, staffOwner, { previousToken });

        expect(previousRow.update).not.toHaveBeenCalled();
        expect(tokenModel.create).toHaveBeenCalled();
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
        expect(deliveryModel.count.mock.calls[1][0].where).toEqual(expect.objectContaining({ purpose: 'order_status' }));
    });

    it('scopes order reservation counts to the event purpose', async () => {
        tokenModel.findByPk.mockResolvedValue({ id: 'staff-device', ...staffOwner, revoked_at: null });
        deliveryModel.findOne.mockResolvedValue(null);
        deliveryModel.count.mockResolvedValueOnce(0).mockResolvedValueOnce(49);
        const result = await pushDeliveryLogRepository.reservePending({
            dedupe_key: 'staff:order:tenant:37:new_online_order:staff-device', token_id: 'staff-device',
            token_hash: 'b'.repeat(64), purpose: 'staff_new_online_order', status: 'pending',
            tenant_id: staffOwner.staff_tenant_id, reference: '37', sent_at: new Date()
        }, { orderLimit: 50, owner: staffOwner });

        expect(result.status).toBe('created');
        expect(deliveryModel.count.mock.calls[1][0].where).toEqual(expect.objectContaining({
            tenant_id: staffOwner.staff_tenant_id,
            reference: '37',
            purpose: 'staff_new_online_order'
        }));
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

    it('revokes staff tokens by tenant/user and applies the inactivity retention cutoff', async () => {
        tokenModel.update.mockResolvedValue([2]);
        await expect(pushDeviceTokenRepository.revokeStaffToken({
            token: payload.token,
            tenantId: staffOwner.staff_tenant_id,
            userId: staffOwner.staff_user_id
        })).resolves.toBe(2);
        expect(tokenModel.update).toHaveBeenCalledWith(expect.objectContaining({ revoke_reason: 'deleted' }), expect.objectContaining({
            where: expect.objectContaining({
                token: payload.token,
                staff_tenant_id: staffOwner.staff_tenant_id,
                staff_user_id: staffOwner.staff_user_id,
                revoked_at: null
            })
        }));

        tokenModel.findAll.mockResolvedValue([{ id: 'stale-staff-device' }]);
        await expect(pushDeviceTokenRepository.revokeInactiveStaffTokens(new Date('2026-07-20T00:00:00Z'))).resolves.toBe(2);
        expect(tokenModel.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                staff_tenant_id: expect.any(Object),
                staff_user_id: expect.any(Object),
                revoked_at: null,
                last_seen_at: expect.any(Object)
            }),
            attributes: ['id']
        }));
        expect(tokenModel.update).toHaveBeenLastCalledWith(expect.objectContaining({ revoke_reason: 'staff_inactive' }), expect.any(Object));
    });
});
