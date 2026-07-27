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
const resolveTenantByStoreSlug = jest.fn();
jest.unstable_mockModule('../src/services/storefrontTenantResolver.js', () => ({
    resolveTenantByStoreSlug
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

const { tenantHandler, invalidateTenantLookupCache } = await import('../src/middleware/tenantHandler.js');

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

// Every /api/v1/store route sits behind requireTenantContext, so degrading to the
// default tenant context on an infrastructure fault can never produce a working
// response -- it only relabels a 503 as 400 "Company token required". That
// mislabelling is what made the 2026-07-27 stage outage hard to read; see
// docs/ops/STAGE_CONNECTION_EXHAUSTION_AND_CSP_INCIDENT_2026-07-27.md.
describe('tenantHandler storefront infrastructure failures', () => {
    const slugRequest = () => ({
        originalUrl: '/api/v1/store/locations',
        headers: { host: 'stage.example.com', 'x-store-slug': 'acme-store' }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // tenantHandler's tenant lookup cache is module-level state, not reset by
        // clearAllMocks -- without this, a rejection mocked in one test can be
        // masked by a real cache hit left behind by an earlier test.
        invalidateTenantLookupCache({ companyToken: 'tenant-token-1' });
        resolveActiveStorefrontDomain.mockResolvedValue(null);
        resolveTenantByStoreSlug.mockResolvedValue({
            id: 'tenant-1', name: 'Acme', company_token: 'tenant-token-1'
        });
        findTenantByToken.mockResolvedValue({
            id: 'tenant-1', name: 'Acme', company_token: 'tenant-token-1',
            db_name: 'tenant_acme', status: 'active'
        });
        getConnection.mockResolvedValue({ dialect: 'mysql' });
        getTenantModels.mockReturnValue({ Item: { modelName: 'Item' } });
    });

    it('returns 503 when slug resolution throws', async () => {
        resolveTenantByStoreSlug.mockRejectedValue(new Error('Too many connections'));
        const res = response();
        await tenantHandler(slugRequest(), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error_code: 'STOREFRONT_LOOKUP_UNAVAILABLE'
        }));
    });

    it('returns 503 when the tenant lookup itself fails', async () => {
        findTenantByToken.mockRejectedValue(new Error('Too many connections'));
        const res = response();
        await tenantHandler(slugRequest(), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error_code: 'TENANT_LOOKUP_UNAVAILABLE'
        }));
    });

    it('returns 503 when the tenant DB is unreachable', async () => {
        getConnection.mockRejectedValue(new Error('Too many connections'));
        const res = response();
        await tenantHandler(slugRequest(), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error_code: 'TENANT_DB_UNAVAILABLE'
        }));
    });

    it('still resolves normally when nothing is broken', async () => {
        const req = slugRequest();
        const next = jest.fn();
        const res = response();
        await tenantHandler(req, res, next);
        expect(res.status).not.toHaveBeenCalled();
        expect(dbRun).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }), next);
    });

    // A slug that simply isn't in the index is a caller-side condition, not an
    // outage -- it must keep its existing behaviour rather than become a 503.
    it('leaves an unknown slug on the existing default-context path', async () => {
        resolveTenantByStoreSlug.mockResolvedValue(null);
        const res = response();
        const next = jest.fn();
        await tenantHandler(slugRequest(), res, next);
        expect(res.status).not.toHaveBeenCalledWith(503);
        expect(dbRun).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 'default' }),
            next
        );
    });
});
