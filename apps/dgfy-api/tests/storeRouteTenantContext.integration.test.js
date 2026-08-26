import { jest } from '@jest/globals';
import { AsyncLocalStorage } from 'async_hooks';
import express from 'express';
import request from 'supertest';

const mockHandlers = {
    listStoreCatalog: jest.fn((req, res) => res.status(200).json({ success: true })),
    resolveStoreQr: jest.fn((req, res) => res.status(200).json({ success: true })),
    listStoreLocations: jest.fn((req, res) => res.status(200).json({ success: true })),
    registerStoreCustomer: jest.fn((req, res) => res.status(201).json({ success: true })),
    loginStoreCustomer: jest.fn((req, res) => res.status(200).json({ success: true })),
    getStoreCustomerMe: jest.fn((req, res) => res.status(200).json({ success: true })),
    listStoreCustomerAddresses: jest.fn((req, res) => res.status(200).json({ success: true })),
    createStoreCustomerAddress: jest.fn((req, res) => res.status(201).json({ success: true })),
    updateStoreCustomerAddress: jest.fn((req, res) => res.status(200).json({ success: true })),
    setDefaultStoreCustomerAddress: jest.fn((req, res) => res.status(200).json({ success: true })),
    deleteStoreCustomerAddress: jest.fn((req, res) => res.status(204).send()),
    cartQuote: jest.fn((req, res) => res.status(200).json({ success: true })),
    createCheckoutPaymentSession: jest.fn((req, res) => res.status(201).json({ success: true })),
    getCheckoutPaymentSession: jest.fn((req, res) => res.status(200).json({ success: true })),
    requestGuestCheckoutOtp: jest.fn((req, res) => res.status(200).json({ success: true })),
    verifyGuestCheckoutOtp: jest.fn((req, res) => res.status(200).json({ success: true })),
    confirmCheckoutSandboxPayment: jest.fn((req, res) => res.status(200).json({ success: true })),
    checkout: jest.fn((req, res) => res.status(200).json({ success: true })),
    trackOrder: jest.fn((req, res) => res.status(200).json({
        success: true,
        data: {
            tracking_pin: req.params.tracking_pin,
            status: 'placed'
        }
    })),
    claimOrder: jest.fn((req, res) => res.status(200).json({ success: true })),
    cancelOrder: jest.fn((req, res) => res.status(200).json({ success: true })),
    listStoreCustomerOrders: jest.fn((req, res) => res.status(200).json({ success: true })),
    getStorefrontFollowStatus: jest.fn((req, res) => res.status(200).json({ success: true })),
    followStorefront: jest.fn((req, res) => res.status(200).json({ success: true })),
    unfollowStorefront: jest.fn((req, res) => res.status(200).json({ success: true }))
};

jest.unstable_mockModule('../src/controllers/storeController.js', () => mockHandlers);

// #1022: this file's dbStore.run/getStore need to stay real (routeTokenBridge below relies on
// AsyncLocalStorage-scoped tenant context propagating through the real requireTenantContext
// middleware), but dbStore.get('SystemSetting') must not fall through to dbStore.js's own
// documented fallback -- the real, unmocked model. The 4th test ("aligned and non-default")
// reaches past requireTenantContext into requireWorkflowCapability
// (workflowCapabilitySettingsCache.js's resolveWorkflowCapabilitySettings), which is fail-closed
// by design: a SystemSetting.findAll() that throws (DB_HOST/DB_PORT pinned unreachable, the fast
// tier's default, #1015) becomes next(error) -> a 500, never a silent grant. Mocking findAll to
// resolve empty gives the documented defaults (DEFAULT_WORKFLOW_MODE, no capability overlays) --
// 'storefront' is held by every mode (workflowModeCapability.js's own comment), so the gate grants
// as the first three tests already implicitly assume it would.
const storage = new AsyncLocalStorage();
const systemSettingFindAll = jest.fn().mockResolvedValue([]);
const mockSystemSetting = { findAll: systemSettingFindAll };

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        run: (store, callback) => storage.run(store, callback),
        getStore: () => storage.getStore(),
        get: (modelName) => (modelName === 'SystemSetting' ? mockSystemSetting : undefined)
    }
}));

const dbStore = (await import('../src/utils/dbStore.js')).default;

let storeRouter;

const routeTokenBridge = (req, res, next) => {
    const token = String(req.headers['x-company-token'] || '').trim();

    if (!token) {
        return dbStore.run({ tenantId: 'default' }, next);
    }

    if (token === 'valid-store-token') {
        req.tenant = { id: 'tenant-ctx-1' };
        return dbStore.run({ tenantId: 'tenant-ctx-1' }, next);
    }

    if (token === 'mismatch-store-token') {
        req.tenant = { id: 'tenant-request-a' };
        return dbStore.run({ tenantId: 'tenant-context-b' }, next);
    }

    req.tenant = { id: 'tenant-invalid' };
    return dbStore.run({ tenantId: 'default' }, next);
};

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use(routeTokenBridge);
    app.use('/api/v1/store', storeRouter);
    return app;
};

beforeAll(async () => {
    const mod = await import('../src/routes/store.js');
    storeRouter = mod.default;
});

describe('store route tenant context integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        systemSettingFindAll.mockResolvedValue([]);
    });

    it('rejects track request when x-company-token is missing', async () => {
        const app = buildApp();
        const response = await request(app).get('/api/v1/store/track/SK-AB12CD');

        expect(response.status).toBe(400);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            error_code: 'TENANT_CONTEXT_MISSING',
            message: 'Company token required'
        }));
        expect(mockHandlers.trackOrder).not.toHaveBeenCalled();
    });

    it('rejects track request when token resolves to default context', async () => {
        const app = buildApp();
        const response = await request(app)
            .get('/api/v1/store/track/SK-AB12CD')
            .set('x-company-token', 'invalid-store-token');

        expect(response.status).toBe(400);
        expect(response.body.error_code).toBe('TENANT_CONTEXT_MISSING');
        expect(mockHandlers.trackOrder).not.toHaveBeenCalled();
    });

    it('rejects track request when request tenant mismatches context tenant', async () => {
        const app = buildApp();
        const response = await request(app)
            .get('/api/v1/store/track/SK-AB12CD')
            .set('x-company-token', 'mismatch-store-token');

        expect(response.status).toBe(400);
        expect(response.body.error_code).toBe('TENANT_CONTEXT_MISSING');
        expect(mockHandlers.trackOrder).not.toHaveBeenCalled();
    });

    it('allows track request when request and context tenant are aligned and non-default', async () => {
        const app = buildApp();
        const response = await request(app)
            .get('/api/v1/store/track/SK-AB12CD')
            .set('x-company-token', 'valid-store-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockHandlers.trackOrder).toHaveBeenCalledTimes(1);
    });
});
