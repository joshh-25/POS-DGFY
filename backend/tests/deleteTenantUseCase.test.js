import { buildDeleteTenantUseCase } from '../src/modules/tenants/usecases/deleteTenantUseCase.js';
import { jest } from '@jest/globals';

describe('deleteTenantUseCase', () => {
    const makeDeps = () => {
        const tenantAdminRepository = {
            findTenantById: jest.fn(),
            removeTenantDependencies: jest.fn(),
            destroyTenant: jest.fn()
        };
        const deleteTenantDatabase = jest.fn();
        const logger = {
            error: jest.fn(),
            warn: jest.fn()
        };

        return {
            tenantAdminRepository,
            deleteTenantDatabase,
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
        expect(deps.deleteTenantDatabase).toHaveBeenCalledWith('sku_tenant_1');
        expect(deps.tenantAdminRepository.removeTenantDependencies).toHaveBeenCalledWith('tenant-1');
        expect(deps.tenantAdminRepository.destroyTenant).toHaveBeenCalledWith(tenant);
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
