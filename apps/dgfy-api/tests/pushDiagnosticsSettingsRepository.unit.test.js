import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const rows = new Map();
let transactionSequence = 0;
const settingModel = {
    findAll: jest.fn(async ({ where }) => [...rows.values()].filter((row) => where.app.includes(row.app))),
    findByPk: jest.fn(async (app) => rows.get(app) || null),
    findOrCreate: jest.fn(async ({ where, defaults }) => {
        if (rows.has(where.app)) return [rows.get(where.app), false];
        const row = {
            ...defaults,
            update: jest.fn(async (patch) => { Object.assign(row, patch); return row; })
        };
        rows.set(where.app, row);
        return [row, true];
    }),
    findOne: jest.fn(async ({ where }) => rows.get(where.app) || null)
};
const sequelizeClient = {
    transaction: jest.fn(async (callback) => {
        const snapshot = new Map([...rows].map(([app, row]) => [app, { ...row }]));
        const transaction = { id: ++transactionSequence, LOCK: { UPDATE: 'UPDATE' } };
        try {
            return await callback(transaction);
        } catch (error) {
            rows.clear();
            for (const [app, row] of snapshot) rows.set(app, row);
            throw error;
        }
    })
};
const auditRepository = { write: jest.fn().mockResolvedValue(undefined) };

jest.unstable_mockModule('../src/models/index.js', () => ({
    PushDiagnosticsAppSetting: settingModel,
    sequelize: sequelizeClient
}));
jest.unstable_mockModule('../src/modules/pushDiagnostics/repositories/pushDiagnosticsAuditRepository.js', () => ({
    pushDiagnosticsAuditRepository: auditRepository
}));
const { buildPushDiagnosticsSettingsRepository } = await import('../src/modules/pushDiagnostics/repositories/pushDiagnosticsSettingsRepository.js');

const ADMIN = { id: 'admin-1', username: 'ops' };
const REQUEST = { method: 'PUT', path: '/api/v1/admin/push-diagnostics/visibility/pos' };

beforeEach(() => {
    rows.clear();
    transactionSequence = 0;
    jest.clearAllMocks();
});

describe('push diagnostics settings repository', () => {
    it('reads an absent setting as disabled', async () => {
        const repository = buildPushDiagnosticsSettingsRepository({ settingModel, sequelizeClient, auditRepository });
        await expect(repository.getEnabledByApp('storefront')).resolves.toBe(false);
    });

    it('leaves an absent row untouched when the requested value is already the default off state', async () => {
        const repository = buildPushDiagnosticsSettingsRepository({ settingModel, sequelizeClient, auditRepository });
        await expect(repository.setVisibility({ app: 'storefront', enabled: false, admin: ADMIN, request: REQUEST }))
            .resolves.toEqual({ app: 'storefront', enabled: false, changed: false });
        expect(rows.has('storefront')).toBe(false);
        expect(settingModel.findOrCreate).not.toHaveBeenCalled();
        expect(auditRepository.write).not.toHaveBeenCalled();
    });

    it('locks, changes, and audits a setting in the same transaction', async () => {
        const repository = buildPushDiagnosticsSettingsRepository({ settingModel, sequelizeClient, auditRepository });
        const result = await repository.setVisibility({ app: 'pos', enabled: true, admin: ADMIN, request: REQUEST });

        expect(result).toEqual({ app: 'pos', enabled: true, changed: true });
        expect(settingModel.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
            where: { app: 'pos' }, defaults: { app: 'pos', enabled: false }, transaction: expect.any(Object)
        }));
        const transaction = settingModel.findOne.mock.calls[0][0].transaction;
        expect(settingModel.findOne).toHaveBeenCalledWith({
            where: { app: 'pos' }, transaction, lock: transaction.LOCK.UPDATE
        });
        expect(rows.get('pos')).toMatchObject({ enabled: true, updated_by_admin_id: ADMIN.id });
        expect(auditRepository.write).toHaveBeenCalledWith({
            admin: ADMIN,
            action: 'push_diagnostics.visibility_changed',
            before: { app: 'pos', enabled: false },
            after: { app: 'pos', enabled: true },
            request: REQUEST,
            transaction
        });
    });

    it('does not audit a no-op and allows a later off change', async () => {
        const repository = buildPushDiagnosticsSettingsRepository({ settingModel, sequelizeClient, auditRepository });
        await repository.setVisibility({ app: 'storefront', enabled: true, admin: ADMIN, request: REQUEST });
        auditRepository.write.mockClear();

        await expect(repository.setVisibility({ app: 'storefront', enabled: true, admin: ADMIN, request: REQUEST }))
            .resolves.toEqual({ app: 'storefront', enabled: true, changed: false });
        expect(auditRepository.write).not.toHaveBeenCalled();

        await expect(repository.setVisibility({ app: 'storefront', enabled: false, admin: ADMIN, request: REQUEST }))
            .resolves.toEqual({ app: 'storefront', enabled: false, changed: true });
        expect(auditRepository.write).toHaveBeenCalledWith(expect.objectContaining({
            before: { app: 'storefront', enabled: true }, after: { app: 'storefront', enabled: false }
        }));
    });

    it('rolls back the setting when the audit write fails', async () => {
        rows.set('fiscalpos', {
            app: 'fiscalpos', enabled: false, updated_by_admin_id: null,
            update: jest.fn(async (patch) => { Object.assign(rows.get('fiscalpos'), patch); })
        });
        auditRepository.write.mockRejectedValueOnce(new Error('audit unavailable'));
        const repository = buildPushDiagnosticsSettingsRepository({ settingModel, sequelizeClient, auditRepository });

        await expect(repository.setVisibility({ app: 'fiscalpos', enabled: true, admin: ADMIN, request: REQUEST }))
            .rejects.toThrow('audit unavailable');
        expect(rows.get('fiscalpos')).toMatchObject({ enabled: false, updated_by_admin_id: null });
    });
});
