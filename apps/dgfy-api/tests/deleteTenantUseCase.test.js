import { buildDeleteTenantUseCase } from '../src/modules/tenants/usecases/deleteTenantUseCase.js';
import { jest } from '@jest/globals';

describe('deleteTenantUseCase', () => {
    const makeDeps = () => {
        const tenantAdminRepository = {
            findTenantById: jest.fn(),
            findCompanyRegistrationApplicationForTenant: jest.fn().mockResolvedValue(null),
            countPlatformInvoicesForRegistrationApplication: jest.fn().mockResolvedValue(0),
            removeCompanyRegistrationApplicationAndHistory: jest.fn(),
            removeTenantDependencies: jest.fn(),
            destroyTenant: jest.fn()
        };
        const deleteTenantDatabase = jest.fn();
        const removeStorefrontDiscoveryIndexForTenant = jest.fn();
        const syncStorefrontDiscoveryIndexForTenant = jest.fn();
        const logger = {
            error: jest.fn(),
            warn: jest.fn()
        };

        return {
            tenantAdminRepository,
            deleteTenantDatabase,
            removeStorefrontDiscoveryIndexForTenant,
            syncStorefrontDiscoveryIndexForTenant,
            logger
        };
    };

    it('returns 404 when tenant does not exist', async () => {
        const deps = makeDeps();
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(null);

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: 'missing-tenant' });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('TENANT_NOT_FOUND');
        expect(result.error.statusCode).toBe(404);
        expect(deps.deleteTenantDatabase).not.toHaveBeenCalled();
        expect(deps.removeStorefrontDiscoveryIndexForTenant).not.toHaveBeenCalled();
        expect(deps.tenantAdminRepository.removeTenantDependencies).not.toHaveBeenCalled();
        expect(deps.tenantAdminRepository.destroyTenant).not.toHaveBeenCalled();
    });

    it('deletes database, dependencies, and tenant on success', async () => {
        const deps = makeDeps();
        const tenant = { id: 'tenant-1', db_name: 'sku_tenant_1' };
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(tenant);
        deps.deleteTenantDatabase.mockResolvedValue();
        deps.tenantAdminRepository.removeTenantDependencies.mockResolvedValue();
        deps.tenantAdminRepository.destroyTenant.mockResolvedValue();

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: tenant.id });

        expect(result.success).toBe(true);
        expect(deps.removeStorefrontDiscoveryIndexForTenant).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
        expect(deps.deleteTenantDatabase).toHaveBeenCalledWith('sku_tenant_1');
        expect(deps.removeStorefrontDiscoveryIndexForTenant.mock.invocationCallOrder[0])
            .toBeLessThan(deps.deleteTenantDatabase.mock.invocationCallOrder[0]);
        expect(deps.tenantAdminRepository.removeTenantDependencies).toHaveBeenCalledWith('tenant-1');
        expect(deps.tenantAdminRepository.destroyTenant).toHaveBeenCalledWith(tenant);
    });

    it('blocks deletion when registration history exists without the force flag', async () => {
        const deps = makeDeps();
        const tenant = { id: 'tenant-registration', db_name: 'sku_tenant_registration' };
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(tenant);
        deps.tenantAdminRepository.findCompanyRegistrationApplicationForTenant.mockResolvedValue({
            id: 'application-1',
            review_status: 'pending'
        });

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: tenant.id });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(result.error.message).toContain('application-1');
        expect(result.error.message).toContain('pending');
        expect(deps.tenantAdminRepository.countPlatformInvoicesForRegistrationApplication)
            .toHaveBeenCalledWith('application-1');
        expect(deps.tenantAdminRepository.removeCompanyRegistrationApplicationAndHistory).not.toHaveBeenCalled();
        expect(deps.removeStorefrontDiscoveryIndexForTenant).not.toHaveBeenCalled();
        expect(deps.deleteTenantDatabase).not.toHaveBeenCalled();
        expect(deps.tenantAdminRepository.removeTenantDependencies).not.toHaveBeenCalled();
        expect(deps.tenantAdminRepository.destroyTenant).not.toHaveBeenCalled();
    });

    it('blocks forced deletion when registration history has invoices', async () => {
        const deps = makeDeps();
        const tenant = { id: 'tenant-invoiced', db_name: null };
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(tenant);
        deps.tenantAdminRepository.findCompanyRegistrationApplicationForTenant.mockResolvedValue({
            id: 'application-invoiced',
            review_status: 'approved'
        });
        deps.tenantAdminRepository.countPlatformInvoicesForRegistrationApplication.mockResolvedValue(2);

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: tenant.id, forceDeleteRegistrationHistory: true });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(result.error.message).toContain('2 platform invoice(s)');
        expect(deps.tenantAdminRepository.removeCompanyRegistrationApplicationAndHistory).not.toHaveBeenCalled();
        expect(deps.removeStorefrontDiscoveryIndexForTenant).not.toHaveBeenCalled();
        expect(deps.tenantAdminRepository.destroyTenant).not.toHaveBeenCalled();
    });

    it('deletes registration history before continuing the forced tenant deletion flow', async () => {
        const deps = makeDeps();
        const tenant = { id: 'tenant-forced', db_name: null };
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(tenant);
        deps.tenantAdminRepository.findCompanyRegistrationApplicationForTenant.mockResolvedValue({
            id: 'application-forced',
            review_status: 'rejected'
        });
        deps.tenantAdminRepository.removeTenantDependencies.mockResolvedValue();
        deps.tenantAdminRepository.destroyTenant.mockResolvedValue();

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: tenant.id, forceDeleteRegistrationHistory: true });

        expect(result.success).toBe(true);
        expect(deps.tenantAdminRepository.removeCompanyRegistrationApplicationAndHistory)
            .toHaveBeenCalledWith('application-forced');
        expect(deps.tenantAdminRepository.removeCompanyRegistrationApplicationAndHistory.mock.invocationCallOrder[0])
            .toBeLessThan(deps.tenantAdminRepository.removeTenantDependencies.mock.invocationCallOrder[0]);
        expect(deps.tenantAdminRepository.removeCompanyRegistrationApplicationAndHistory.mock.invocationCallOrder[0])
            .toBeLessThan(deps.tenantAdminRepository.destroyTenant.mock.invocationCallOrder[0]);
    });

    it('does not continue tenant deletion when forced registration history cleanup fails', async () => {
        const deps = makeDeps();
        const tenant = { id: 'tenant-history-fail', db_name: null };
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(tenant);
        deps.tenantAdminRepository.findCompanyRegistrationApplicationForTenant.mockResolvedValue({
            id: 'application-history-fail',
            review_status: 'rejected'
        });
        deps.tenantAdminRepository.removeCompanyRegistrationApplicationAndHistory.mockRejectedValue(new Error('history cleanup error'));

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: tenant.id, forceDeleteRegistrationHistory: true });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(deps.tenantAdminRepository.removeTenantDependencies).not.toHaveBeenCalled();
        expect(deps.tenantAdminRepository.destroyTenant).not.toHaveBeenCalled();
        expect(deps.removeStorefrontDiscoveryIndexForTenant).not.toHaveBeenCalled();
    });

    it('fails tenant deletion if storefront discovery index cleanup fails', async () => {
        const deps = makeDeps();
        const tenant = { id: 'tenant-index-fail', db_name: null };
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(tenant);
        deps.removeStorefrontDiscoveryIndexForTenant.mockRejectedValue(new Error('index cleanup failed'));
        deps.tenantAdminRepository.removeTenantDependencies.mockResolvedValue();
        deps.tenantAdminRepository.destroyTenant.mockResolvedValue();

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: tenant.id });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(String(result.error.message)).toContain('Failed to remove storefront discovery index row');
        expect(deps.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to remove storefront discovery index row'),
            expect.any(Error)
        );
        expect(deps.deleteTenantDatabase).not.toHaveBeenCalled();
        expect(deps.tenantAdminRepository.removeTenantDependencies).not.toHaveBeenCalled();
        expect(deps.tenantAdminRepository.destroyTenant).not.toHaveBeenCalled();
    });

    it('continues delete flow when tenant DB is already missing', async () => {
        const deps = makeDeps();
        const tenant = { id: 'tenant-2', db_name: 'sku_tenant_missing' };
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(tenant);
        deps.deleteTenantDatabase.mockRejectedValue(new Error("Unknown database 'sku_tenant_missing'"));
        deps.tenantAdminRepository.removeTenantDependencies.mockResolvedValue();
        deps.tenantAdminRepository.destroyTenant.mockResolvedValue();

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: tenant.id });

        expect(result.success).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalled();
        expect(deps.removeStorefrontDiscoveryIndexForTenant).toHaveBeenCalledWith({ tenantId: 'tenant-2' });
        expect(deps.tenantAdminRepository.removeTenantDependencies).toHaveBeenCalledWith('tenant-2');
        expect(deps.tenantAdminRepository.destroyTenant).toHaveBeenCalledWith(tenant);
    });

    it('fails when DB deletion returns a non-recoverable error', async () => {
        const deps = makeDeps();
        const tenant = { id: 'tenant-3', db_name: 'sku_tenant_3' };
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(tenant);
        deps.deleteTenantDatabase.mockRejectedValue(new Error('permission denied'));

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: tenant.id });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(String(result.error.message)).toContain('Failed to delete database');
        expect(deps.removeStorefrontDiscoveryIndexForTenant).toHaveBeenCalledWith({ tenantId: 'tenant-3' });
        expect(deps.syncStorefrontDiscoveryIndexForTenant).toHaveBeenCalledWith({ tenantId: 'tenant-3' });
        expect(deps.tenantAdminRepository.removeTenantDependencies).not.toHaveBeenCalled();
        expect(deps.tenantAdminRepository.destroyTenant).not.toHaveBeenCalled();
    });

    it('fails when dependency cleanup throws', async () => {
        const deps = makeDeps();
        const tenant = { id: 'tenant-4', db_name: null };
        deps.tenantAdminRepository.findTenantById.mockResolvedValue(tenant);
        deps.tenantAdminRepository.removeTenantDependencies.mockRejectedValue(new Error('fk cleanup error'));

        const useCase = buildDeleteTenantUseCase(deps);
        const result = await useCase({ id: tenant.id });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(deps.tenantAdminRepository.destroyTenant).not.toHaveBeenCalled();
    });
});
