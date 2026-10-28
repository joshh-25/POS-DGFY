import { afterEach, describe, expect, it, jest } from '@jest/globals';

const acquireLock = jest.fn();
const releaseLock = jest.fn();
const getConnection = jest.fn();
const getTenantModels = jest.fn();
const findAll = jest.fn();
const tenant = { id: 'tenant-1', name: 'Tenant One', db_name: 'sku_tenant_one' };
const sequelize = { id: 'tenant-sequelize' };
const models = { Alert: {} };
const dbStore = {
    get: jest.fn(() => ({ findAll })),
    run: jest.fn(async (_context, callback) => callback())
};
const reconcileBusinessAdminAlertSnapshots = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({ default: dbStore }));
jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({ default: { getConnection } }));
jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({ getTenantModels }));
jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
jest.unstable_mockModule('../src/services/cacheService.js', () => ({ acquireLock, releaseLock }));
jest.unstable_mockModule('../src/modules/businessAdmin/services/businessAdminAlertSnapshotService.js', () => ({
    reconcileBusinessAdminAlertSnapshots
}));
jest.unstable_mockModule('../src/modules/businessAdmin/repositories/businessAdminAlertSnapshotRepository.js', () => ({
    businessAdminAlertSnapshotRepository: {}
}));

const { runBusinessAdminAlertSnapshotCycle } = await import('../src/schedulers/businessAdminAlertScheduler.js');

describe('business admin alert snapshot scheduler', () => {
    afterEach(() => {
        acquireLock.mockReset().mockResolvedValue(true);
        releaseLock.mockReset().mockResolvedValue(undefined);
        getConnection.mockReset().mockResolvedValue(sequelize);
        getTenantModels.mockReset().mockReturnValue(models);
        findAll.mockReset().mockResolvedValue([tenant]);
        dbStore.get.mockClear();
        dbStore.run.mockClear();
        reconcileBusinessAdminAlertSnapshots.mockReset().mockResolvedValue(undefined);
    });

    it('passes a fixed scheduler label to the shared tenant connection cache', async () => {
        acquireLock.mockResolvedValue(true);
        releaseLock.mockResolvedValue(undefined);
        getConnection.mockResolvedValue(sequelize);
        getTenantModels.mockReturnValue(models);
        findAll.mockResolvedValue([tenant]);

        await expect(runBusinessAdminAlertSnapshotCycle()).resolves.toEqual({
            status: 'completed', tenants: 1, failures: 0
        });

        expect(getConnection).toHaveBeenCalledWith(tenant, 'scheduler.business-admin-alert');
        expect(reconcileBusinessAdminAlertSnapshots).toHaveBeenCalledWith({
            repository: {},
            tenant
        });
        expect(releaseLock).toHaveBeenCalledTimes(1);
    });
});
