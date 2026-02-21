import request from 'supertest';
import { jest } from '@jest/globals';

// Define mocks
const mockVerifyToken = jest.fn();
const mockIsTokenBlacklisted = jest.fn().mockResolvedValue(false);

// Manual mock of auth middleware to bypass real token verification
jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticate: (req, res, next) => {
        req.user = { user_id: 1, role: 'admin' };
        next();
    },
    checkPermission: () => (req, res, next) => next(),
    requirePremium: (req, res, next) => next(),
    requireMasterAdmin: (req, res, next) => next(),
    authenticateAdmin: (req, res, next) => next()
}));

// Manual mock of authService
jest.unstable_mockModule('../src/services/authService.js', () => ({
    verifyToken: mockVerifyToken,
    isTokenBlacklisted: mockIsTokenBlacklisted,
    hashPassword: jest.fn().mockResolvedValue('hashed'),
    comparePassword: jest.fn().mockResolvedValue(true),
    generateToken: jest.fn().mockReturnValue('token'),
    generateRefreshToken: jest.fn().mockReturnValue('refresh'),
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

        // Ensure nothing was created in DB
        const createdItem = await Item.findOne({ where: { sku_code: 'TAMPERED-01' } });
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
