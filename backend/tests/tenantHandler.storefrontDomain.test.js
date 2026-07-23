import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findTenantByToken = jest.fn();
const getConnection = jest.fn();
const getTenantModels = jest.fn();
const dbRun = jest.fn((_context, callback) => callback());
const resolveActiveStorefrontDomain = jest.fn();

jest.unstable_mockModule('../src/services/landlordService.js', () => ({
    findTenantByToken,
    findTenantById: jest.fn(),
    resolveInvitationTenantTokenByToken: jest.fn()
}));
jest.unstable_mockModule('../src/services/storefrontTenantResolver.js', () => ({
    resolveTenantByStoreSlug: jest.fn()
}));
jest.unstable_mockModule('../src/modules/storefrontDomains/index.js', () => ({
    readRequestHostname: (req) => String(req.headers?.host || '').replace(/:\d+$/, '').toLowerCase(),
    resolveActiveStorefrontDomain
}));
jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({ default: { getConnection } }));
jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({ getTenantModels }));
jest.unstable_mockModule('../src/utils/dbStore.js', () => ({ default: { run: dbRun } }));
jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { tenantHandler } = await import('../src/middleware/tenantHandler.js');

const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const domainContext = {
    domain: { hostname: 'grandmatador.com', status: 'active' },
    tenant: { id: 'tenant-1', name: 'Grand Matador', company_token: 'tenant-token-1' },
    discovery: { slug: 'grand-matador', storefront_open: true }
};

describe('tenantHandler custom storefront domains', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resolveActiveStorefrontDomain.mockResolvedValue(domainContext);
        findTenantByToken.mockResolvedValue({
            id: 'tenant-1', name: 'Grand Matador', company_token: 'tenant-token-1',
            db_name: 'tenant_grand_matador', status: 'active', plan: 'premium'
        });
        getConnection.mockResolvedValue({ dialect: 'mysql' });
        getTenantModels.mockReturnValue({ Item: { modelName: 'Item' } });
    });

    it('uses the active request host as authoritative storefront tenant context', async () => {
        const req = { originalUrl: '/api/v1/store/catalog', headers: { host: 'grandmatador.com' } };
        const res = response();
        const next = jest.fn();
        await tenantHandler(req, res, next);
        expect(req.headers['x-company-token']).toBe('tenant-token-1');
        expect(req.headers['x-store-slug']).toBe('grand-matador');
        expect(req.storefrontDomainContext).toBe(domainContext);
        expect(dbRun).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }), next);
    });

    it('rejects a slug that attempts to select another store on the custom host', async () => {
        const req = {
            originalUrl: '/api/v1/store/catalog',
            headers: { host: 'grandmatador.com', 'x-store-slug': 'another-store' }
        };
        const res = response();
        await tenantHandler(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'STOREFRONT_DOMAIN_SLUG_MISMATCH' }));
        expect(findTenantByToken).not.toHaveBeenCalled();
    });
});
