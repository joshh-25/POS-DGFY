import { jest, describe, expect, it, beforeAll, beforeEach } from '@jest/globals';

const locationModel = { findAll: jest.fn() };
const settingModel = { findOne: jest.fn() };
const emptyModel = { findAll: jest.fn() };
const models = {
    TenantLocation: locationModel,
    SystemSetting: settingModel,
    PosTerminalHeartbeat: emptyModel,
    PosTerminalShift: emptyModel,
    PosTransaction: emptyModel,
    PosTransactionAdjustment: emptyModel,
    BusinessAdminApprovalRequest: emptyModel,
    Item: emptyModel
};
const repository = { reconcile: jest.fn() };

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((name) => models[name]),
        getStore: jest.fn(() => ({ tenantId: 'tenant-1' }))
    }
}));
jest.unstable_mockModule('../src/services/alertService.js', () => ({
    generateAlerts: jest.fn().mockResolvedValue([])
}));

let reconcileBusinessAdminAlertSnapshots;

beforeAll(async () => {
    ({ reconcileBusinessAdminAlertSnapshots } = await import('../src/modules/businessAdmin/services/businessAdminAlertSnapshotService.js'));
});

beforeEach(() => {
    locationModel.findAll.mockResolvedValue([]);
    settingModel.findOne.mockImplementation(({ where }) => Promise.resolve(
        where?.setting_key === 'tenant_onboarding_state'
            ? { setting_value: 'in_progress', data_type: 'string' }
            : { setting_value: '[]', data_type: 'json' }
    ));
    Object.values(models).filter((model) => model !== locationModel && model !== settingModel).forEach((model) => model.findAll.mockResolvedValue([]));
    repository.reconcile.mockResolvedValue(undefined);
});

describe('Business Admin alert snapshot ownership contract', () => {
    it('moves readiness conditions into the canonical notification snapshot source', async () => {
        const result = await reconcileBusinessAdminAlertSnapshots({
            repository,
            tenant: { id: 'tenant-1', tenant_onboarding_state: 'in_progress' },
            now: new Date('2026-09-21T08:00:00.000Z')
        });

        expect(result.evaluated).toBe(3);
        const snapshots = repository.reconcile.mock.calls[0][0];
        expect(snapshots.map((snapshot) => snapshot.alert_type)).toEqual(expect.arrayContaining([
            'no_active_branches',
            'no_active_registers',
            'onboarding_incomplete'
        ]));
        expect(snapshots.every((snapshot) => snapshot.alert_key)).toBe(true);
    });
});
