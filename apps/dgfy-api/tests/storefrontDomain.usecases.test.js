import { describe, expect, it, jest } from '@jest/globals';
import { buildStorefrontDomainUseCases } from '../src/modules/storefrontDomains/usecases/storefrontDomainUseCases.js';

const model = (values) => ({
    ...values,
    toJSON() { return { ...this }; },
    async update(patch) { Object.assign(this, patch); return this; }
});

describe('storefront custom-domain use cases', () => {
    const actor = { username: 'admin', request_id: 'req-1' };

    it('creates a pending canonical domain without exposing the stored token hash', async () => {
        const audits = [];
        const repository = {
            findTenantById: async () => ({ id: 'tenant-1', status: 'active', plan: 'premium' }),
            findByHostname: async () => null,
            findCanonicalByTenant: async () => null,
            transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }),
            create: async (values) => model({ id: 'domain-1', ...values }),
            createAudit: async (values) => audits.push(values)
        };
        const useCases = buildStorefrontDomainUseCases({
            repository,
            dnsVerifier: jest.fn(),
            tokenFactory: () => ({ token: 'dgfy-plain', hash: 'stored-hash', hint: 'plain' }),
            clearResolverCache: jest.fn()
        });
        const result = await useCases.create({
            tenantId: 'tenant-1',
            hostname: 'GrandMatador.com',
            role: 'canonical',
            actor,
            reason: 'pilot'
        });
        expect(result.success).toBe(true);
        expect(result.data.domain).toMatchObject({
            hostname: 'grandmatador.com',
            role: 'canonical',
            canonical_tenant_id: 'tenant-1',
            status: 'pending_dns'
        });
        expect(result.data.domain.verification_token_hash).toBeUndefined();
        expect(result.data.dns.verification_value).toBe('dgfy-plain');
        expect(audits).toHaveLength(1);
    });

    it('creates an alias against the canonical domain and enforces the alias limit', async () => {
        const canonical = model({
            id: 'canonical-1',
            tenant_id: 'tenant-1',
            role: 'canonical',
            status: 'active'
        });
        const repository = {
            findTenantById: async () => ({ id: 'tenant-1', status: 'active', plan: 'premium' }),
            findByHostname: async () => null,
            findCanonicalByTenant: async () => canonical,
            findByIdForTenant: async () => canonical,
            countAliasesByTenant: async () => 5,
            transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
        };
        const useCases = buildStorefrontDomainUseCases({
            repository,
            dnsVerifier: jest.fn(),
            tokenFactory: () => ({ token: 'token', hash: 'hash', hint: 'hint' }),
            clearResolverCache: jest.fn()
        });
        const result = await useCases.create({
            tenantId: 'tenant-1',
            hostname: 'www.grandmatador.com',
            role: 'alias',
            canonicalDomainId: 'canonical-1',
            actor,
            reason: 'www redirect'
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
    });

    it('moves verified DNS into provisioning and queues one idempotent operation', async () => {
        const domain = model({
            id: 'domain-1',
            tenant_id: 'tenant-1',
            hostname: 'grandmatador.com',
            role: 'canonical',
            status: 'pending_dns',
            verification_token_hash: 'hash',
            version: 1
        });
        const operation = model({ id: 'operation-1', operation_type: 'provision' });
        const createAudit = jest.fn();
        const repository = {
            findByIdForTenant: async () => domain,
            findOperationByIdempotencyKey: async () => null,
            createOperation: async () => operation,
            createAudit,
            transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
        };
        const useCases = buildStorefrontDomainUseCases({
            repository,
            dnsVerifier: async () => ({ verified: true, ownership_verified: true, route_verified: true }),
            tokenFactory: jest.fn(),
            clearResolverCache: jest.fn(),
            now: () => new Date('2026-07-23T00:00:00.000Z')
        });
        const result = await useCases.verify({
            tenantId: 'tenant-1',
            domainId: 'domain-1',
            actor,
            reason: 'DNS published'
        });
        expect(result.success).toBe(true);
        expect(domain.status).toBe('provisioning');
        expect(result.data.operation.id).toBe('operation-1');
        expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'verified' }), expect.any(Object));
    });

    it('promotes an active alias and repoints the previous canonical mapping', async () => {
        const canonical = model({
            id: 'canonical-1',
            tenant_id: 'tenant-1',
            hostname: 'grandmatador.com',
            role: 'canonical',
            status: 'active',
            version: 1
        });
        const alias = model({
            id: 'alias-1',
            tenant_id: 'tenant-1',
            hostname: 'shop.grandmatador.com',
            role: 'alias',
            canonical_domain_id: canonical.id,
            status: 'active',
            version: 1
        });
        const repointAliases = jest.fn();
        const repository = {
            findByIdForTenant: async (id) => id === alias.id ? alias : canonical,
            findCanonicalByTenant: async () => canonical,
            repointAliases,
            findOperationByIdempotencyKey: async () => null,
            createOperation: async (values) => model({ id: `${values.operation_type}-${values.domain_id}`, ...values }),
            createAudit: jest.fn(),
            transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
        };
        const clearResolverCache = jest.fn();
        const useCases = buildStorefrontDomainUseCases({
            repository,
            dnsVerifier: jest.fn(),
            tokenFactory: jest.fn(),
            clearResolverCache
        });
        const result = await useCases.makeCanonical({
            tenantId: 'tenant-1',
            domainId: alias.id,
            actor,
            reason: 'Promote branded hostname'
        });
        expect(result.success).toBe(true);
        expect(alias.role).toBe('canonical');
        expect(canonical.role).toBe('alias');
        expect(repointAliases).toHaveBeenCalledWith('tenant-1', alias.id, canonical.id, expect.any(Object));
        expect(clearResolverCache).toHaveBeenCalledWith();
    });

    it('suspends resolution immediately and queues edge cleanup', async () => {
        const domain = model({
            id: 'domain-1',
            tenant_id: 'tenant-1',
            hostname: 'grandmatador.com',
            role: 'canonical',
            status: 'active',
            version: 1
        });
        const repository = {
            findByIdForTenant: async () => domain,
            findOperationByIdempotencyKey: async () => null,
            createOperation: async (values) => model({ id: 'suspend-1', ...values }),
            createAudit: jest.fn(),
            transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
        };
        const clearResolverCache = jest.fn();
        const useCases = buildStorefrontDomainUseCases({
            repository,
            dnsVerifier: jest.fn(),
            tokenFactory: jest.fn(),
            clearResolverCache
        });
        const result = await useCases.suspend({
            tenantId: 'tenant-1',
            domainId: domain.id,
            actor,
            reason: 'Emergency rollback'
        });
        expect(result.success).toBe(true);
        expect(domain.status).toBe('suspended');
        expect(result.data.operation.operation_type).toBe('suspend');
        expect(clearResolverCache).toHaveBeenCalledWith('grandmatador.com');
    });
});
