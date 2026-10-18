import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const NOW = new Date('2026-10-19T00:00:00.000Z');
const codeRows = new Map();
const deviceRows = [];
let createdDevices = 0;

const makeRow = (data) => {
    const row = { ...data };
    row.update = jest.fn(async (patch) => { Object.assign(row, patch); return row; });
    row.get = () => ({ ...row });
    return row;
};

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const PushDiagnosticEnrollmentCode = {
    sequelize: { transaction: (fn) => fn(transaction) },
    findOne: jest.fn(async ({ where }) => codeRows.get(where.code_hash) || null)
};
const PushDiagnosticDevice = {
    findOne: jest.fn(async ({ where }) => deviceRows.find((row) => row.token === where.token && !row.revoked_at) || null),
    create: jest.fn(async (data) => {
        createdDevices += 1;
        const row = makeRow({ id: `device-${createdDevices}`, ...data });
        deviceRows.push(row);
        return row;
    })
};

jest.unstable_mockModule('../src/models/index.js', () => ({
    PushDeliveryLog: {}, PushDiagnosticDevice, PushDiagnosticEnrollmentCode
}));
const { pushDiagnosticEnrollmentCodeRepository } = await import('../src/modules/pushDelivery/repositories/pushDiagnosticDeviceRepository.js');

const device = { token: 'ExponentPushToken[abcdefghijk]', platform: 'ios', app: 'storefront', brand: 'dgfy' };

beforeEach(() => {
    codeRows.clear();
    deviceRows.length = 0;
    createdDevices = 0;
    jest.clearAllMocks();
});

describe('push diagnostic enrollment code consumption', () => {
    const seedCode = (overrides = {}) => {
        const row = makeRow({
            id: 'code-1', code_hash: 'hash-1', created_by_admin_id: 'admin-1',
            expires_at: new Date(NOW.getTime() + 60_000), consumed_at: null, consumed_device_id: null, ...overrides
        });
        codeRows.set('hash-1', row);
        return row;
    };

    it('enrolls a device once and marks the code consumed by that device', async () => {
        const code = seedCode();
        const result = await pushDiagnosticEnrollmentCodeRepository.consumeAndEnroll({ codeHash: 'hash-1', device, now: NOW });
        expect(result).toMatchObject({ status: 'enrolled', adminId: 'admin-1', device: { id: 'device-1' } });
        expect(PushDiagnosticDevice.create).toHaveBeenCalledWith(expect.objectContaining({ enrolled_by_admin_id: 'admin-1', token: device.token }), { transaction });
        expect(code.consumed_at).toEqual(NOW);
        expect(code.consumed_device_id).toBe('device-1');
    });

    it('rejects a replayed code without enrolling a second time', async () => {
        seedCode();
        await pushDiagnosticEnrollmentCodeRepository.consumeAndEnroll({ codeHash: 'hash-1', device, now: NOW });
        const replay = await pushDiagnosticEnrollmentCodeRepository.consumeAndEnroll({ codeHash: 'hash-1', device: { ...device, token: 'ExponentPushToken[another-device-token]' }, now: NOW });
        expect(replay).toEqual({ status: 'invalid_code' });
        expect(PushDiagnosticDevice.create).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['unknown', () => undefined, 'missing-hash'],
        ['expired', () => seedCode({ expires_at: new Date(NOW.getTime() - 1) }), 'hash-1'],
        ['expiring exactly now', () => seedCode({ expires_at: NOW }), 'hash-1']
    ])('returns the same invalid_code for an %s code', async (_label, seed, hash) => {
        seed();
        await expect(pushDiagnosticEnrollmentCodeRepository.consumeAndEnroll({ codeHash: hash, device, now: NOW }))
            .resolves.toEqual({ status: 'invalid_code' });
        expect(PushDiagnosticDevice.create).not.toHaveBeenCalled();
    });

    it('refreshes an already-enrolled token instead of creating a duplicate active device', async () => {
        seedCode();
        deviceRows.push(makeRow({ id: 'device-existing', ...device, enrolled_by_admin_id: 'admin-old', revoked_at: null }));
        const result = await pushDiagnosticEnrollmentCodeRepository.consumeAndEnroll({ codeHash: 'hash-1', device: { ...device, app: 'pos' }, now: NOW });
        expect(result.device.id).toBe('device-existing');
        expect(PushDiagnosticDevice.create).not.toHaveBeenCalled();
        expect(deviceRows[0]).toMatchObject({ app: 'pos', enrolled_by_admin_id: 'admin-1' });
    });
});
