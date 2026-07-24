import { describe, expect, it, jest } from '@jest/globals';
import { buildStorefrontDomainOperationUseCases } from '../src/modules/storefrontDomains/usecases/storefrontDomainOperationUseCases.js';

const model = (values) => ({
    ...values,
    toJSON() { return { ...this }; },
    async update(patch) { Object.assign(this, patch); return this; }
});

describe('storefront domain controller operations', () => {
    it('leases an alias operation with its canonical hostname', async () => {
        const operation = model({
            id: 'operation-1',
            domain_id: 'alias-1',
            tenant_id: 'tenant-1',
            operation_type: 'provision',
            status: 'leased'
        });
        const alias = model({
            id: 'alias-1',
            tenant_id: 'tenant-1',
            hostname: 'www.grandmatador.com',
            role: 'alias',
            canonical_domain_id: 'canonical-1',
            status: 'provisioning'
        });
        const canonical = model({
            id: 'canonical-1',
            tenant_id: 'tenant-1',
            hostname: 'grandmatador.com',
            role: 'canonical',
            status: 'active'
        });
        const useCases = buildStorefrontDomainOperationUseCases({
            repository: {
                leaseNextOperation: async () => operation,
                findByIdForTenant: async (id) => id === alias.id ? alias : canonical
            },
            clearResolverCache: jest.fn()
        });
        const result = await useCases.lease({ leaseOwner: 'controller-1' });
        expect(result.success).toBe(true);
        expect(result.data.domain).toMatchObject({
            hostname: 'www.grandmatador.com',
            canonical_hostname: 'grandmatador.com'
        });
    });

    it('activates a provisioned domain only from a valid controller lease and health proof', async () => {
        const operation = model({
            id: 'operation-1',
            domain_id: 'domain-1',
            tenant_id: 'tenant-1',
            operation_type: 'provision',
            status: 'leased',
            lease_owner: 'controller-1',
            lease_expires_at: new Date('2026-07-23T00:05:00.000Z')
        });
        const domain = model({
            id: 'domain-1',
            tenant_id: 'tenant-1',
            hostname: 'grandmatador.com',
            status: 'provisioning'
        });
        const clearResolverCache = jest.fn();
        const useCases = buildStorefrontDomainOperationUseCases({
            repository: {
                transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }),
                findOperationById: async () => operation,
                findByIdForTenant: async () => domain
            },
            clearResolverCache,
            now: () => new Date('2026-07-23T00:00:00.000Z')
        });
        const result = await useCases.report({
            operationId: operation.id,
            leaseOwner: 'controller-1',
            success: true,
            healthCheckPassed: true,
            provisioningReference: 'controller:controller-1:operation-1',
            tlsExpiresAt: '2026-10-21T00:00:00.000Z'
        });
        expect(result.success).toBe(true);
        expect(domain.status).toBe('active');
        expect(operation.status).toBe('completed');
        expect(clearResolverCache).toHaveBeenCalledWith('grandmatador.com');
    });

    it('rejects a stale or foreign controller result', async () => {
        const operation = model({
            id: 'operation-1',
            domain_id: 'domain-1',
            tenant_id: 'tenant-1',
            operation_type: 'provision',
            status: 'leased',
            lease_owner: 'controller-1',
            lease_expires_at: new Date('2026-07-23T00:05:00.000Z')
        });
        const useCases = buildStorefrontDomainOperationUseCases({
            repository: {
                transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }),
                findOperationById: async () => operation
            },
            clearResolverCache: jest.fn(),
            now: () => new Date('2026-07-23T00:00:00.000Z')
        });
        const result = await useCases.report({
            operationId: operation.id,
            leaseOwner: 'controller-2',
            success: true,
            healthCheckPassed: true,
            provisioningReference: 'invalid'
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
    });
});
