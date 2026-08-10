import request from 'supertest';
import { jest } from '@jest/globals';

// Define mocks
const mockVerifyToken = jest.fn();
const mockIsTokenBlacklisted = jest.fn().mockResolvedValue(false);

const mockInvalidateUserAuthCache = jest.fn();
const requiredAuthMockExports = [
    'authenticate',
    'checkPermission',
    'requirePremium',
    'requireMasterAdmin',
    'authenticateAdmin',
    'invalidateUserAuthCache',
    'checkAnyPermission',
    'checkStorefrontBrandingEditPermission',
    'requireTenantCapability',
    'authorizeAdminFinancialRoles',
    'requireTenantAdmin',
    'requireAdminPermission',
    'requirePlatformMaster'
];

const buildAuthModuleMock = () => {
    const authMock = {
        authenticate: (req, res, next) => {
            req.user = { user_id: 1, role: 'admin' };
            next();
        },
        checkPermission: () => (req, res, next) => next(),
        checkAnyPermission: () => (req, res, next) => next(),
        requirePremium: (req, res, next) => next(),
        requireMasterAdmin: (req, res, next) => next(),
        authenticateAdmin: (req, res, next) => next(),
        invalidateUserAuthCache: mockInvalidateUserAuthCache,
        checkStorefrontBrandingEditPermission: (req, res, next) => next(),
        requireTenantCapability: () => (req, res, next) => next(),
        authorizeAdminFinancialRoles: () => (req, res, next) => next(),
        requireTenantAdmin: (req, res, next) => next(),
        requireAdminPermission: () => (req, res, next) => next(),
        requirePlatformMaster: (req, res, next) => next()
    };

    for (const exportName of requiredAuthMockExports) {
        if (typeof authMock[exportName] !== 'function') {
            throw new Error(`[reproduce_import_bypass] auth mock missing required export: ${exportName}`);
        }
    }

    return authMock;
};

// Resilient auth module mock:
// enforce required exports in one place so auth-module changes fail fast here, not deep in server import.
jest.unstable_mockModule('../src/middleware/auth.js', () => buildAuthModuleMock());

// Manual mock of authService
jest.unstable_mockModule('../src/services/authService.js', () => ({
    verifyToken: mockVerifyToken,
    isTokenBlacklisted: mockIsTokenBlacklisted,
    hashPassword: jest.fn().mockResolvedValue('hashed'),
    comparePassword: jest.fn().mockResolvedValue(true),
    generateToken: jest.fn().mockReturnValue('token'),
    generateRefreshToken: jest.fn().mockReturnValue('refresh'),
    blacklistToken: jest.fn().mockResolvedValue(true),
    loginUser: jest.fn().mockResolvedValue({
        user: { user_id: 1, role: 'cashier' },
        token: 'token',
        refreshToken: 'refresh'
    })
}));

// Helper placeholders
let app;
let sequelize;
let User;
let Item;

describe('Import Validation Bypass Reproduction', () => {
    let testUser;

    beforeAll(async () => {
        const dbModels = await import('../src/models/index.js');
        sequelize = dbModels.sequelize;
        User = dbModels.User;
        Item = dbModels.Item;

        await sequelize.authenticate();

        const timestamp = Date.now();
        testUser = await User.create({
            username: `import_admin_${timestamp}`,
            password_hash: 'hash_placeholder',
            email: `import_${timestamp}@test.com`,
            role: 'admin',
            is_active: true
        });

        mockVerifyToken.mockReturnValue({
            user_id: testUser.user_id,
            role: 'admin',
            type: 'access'
        });

        const serverModule = await import('../src/server.js');
        app = serverModule.default;
    });

    afterAll(async () => {
        if (testUser) {
            await User.destroy({ where: { user_id: testUser.user_id } }).catch(() => { });
        }
        await sequelize.close();
    });

    it('should NOT bypass validation when client sends tampered payload to confirmImport', async () => {
        const tamperedPayload = {
            rows: [
                {
                    rowNumber: 1,
                    sku_code: 'TAMPERED-01',
                    name: 'Tampered Item',
                    category: 'raw_material',
                    action: 'CREATE',
                    valid: true, // <--- Maliciously set to true
                    data: {
                        sku_code: 'TAMPERED-01',
                        name: 'Tampered Item',
                        category: 'raw_material',
                        cost_per_unit: -100, // <--- Invalid (should be >= 0)
                        unit_of_measure: 'kg',
                        max_capacity: 1000
                    }
                }
            ]
        };

        const res = await request(app)
            .post('/api/v1/items/import/confirm')
            .set('Authorization', 'Bearer valid_mock_token')
            .send(tamperedPayload);

        if (res.status !== 200 || res.body.data?.failedCount !== 1) {
            console.log('DEBUG 1: Status:', res.status);
            console.log('DEBUG 1: Body:', JSON.stringify(res.body, null, 2));
        }

        expect(res.status).toBe(200);
        expect(res.body.data.failedCount).toBe(1);
        expect(res.body.data.results.failed[0].errors).toContainEqual(expect.stringMatching(/Cost per unit must be 0 or greater/i));

        // Ensure nothing was created in the storage surface when the legacy default DB has an items table.
        // Some test topologies import the server without tenant context, where the landlord DB has no items table.
        const createdItem = await Item.findOne({ where: { sku_code: 'TAMPERED-01' } }).catch((error) => {
            const code = error?.original?.code || error?.parent?.code || error?.code;
            if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(code)) return null;
            throw error;
        });
        expect(createdItem).toBeNull();
    });

    it('should NOT allow creating items without required product_type even if valid: true is sent', async () => {
        const tamperedPayload = {
            rows: [
                {
                    rowNumber: 2,
                    sku_code: 'TAMPERED-02',
                    name: 'Tampered Product',
                    category: 'product',
                    action: 'CREATE',
                    valid: true,
                    data: {
                        sku_code: 'TAMPERED-02',
                        name: 'Tampered Product',
                        category: 'product',
                        product_type: null, // <--- Missing required field for 'product'
                        max_capacity: 100,
                        unit_of_measure: 'pcs'
                    }
                }
            ]
        };

        const res = await request(app)
            .post('/api/v1/items/import/confirm')
            .set('Authorization', 'Bearer valid_mock_token')
            .send(tamperedPayload);

        if (res.status !== 200 || res.body.data?.failedCount !== 1) {
            console.log('DEBUG 2: Status:', res.status);
            console.log('DEBUG 2: Body:', JSON.stringify(res.body, null, 2));
        }

        expect(res.status).toBe(200);
        expect(res.body.data.failedCount).toBe(1);
        expect(res.body.data.results.failed[0].errors).toContainEqual(expect.stringMatching(/product_type is required/i));
    });
});
