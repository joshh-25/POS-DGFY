import { jest } from '@jest/globals';
import request from 'supertest';
import { PERMISSIONS } from '../src/config/permissions.js';

const mockCacheMap = new Map();

const mockCacheService = {
    getCritical: jest.fn(async (key) => mockCacheMap.get(key) || null),
    get: jest.fn(async (key) => mockCacheMap.get(key) || null),
    set: jest.fn(async (key, val) => {
        mockCacheMap.set(key, val);
        return true;
    }),
    del: jest.fn(async (key) => {
        mockCacheMap.delete(key);
        return true;
    }),
    isRedisConnected: jest.fn(() => true),
    initializeRedis: jest.fn(() => Promise.resolve(true)),
    getRedisClient: jest.fn(),
    isAvailable: jest.fn(() => true),
    clear: jest.fn(async () => {
        mockCacheMap.clear();
        return 0;
    }),
    getMultiple: jest.fn(),
    setMultiple: jest.fn()
};

jest.unstable_mockModule('../src/services/cacheService.js', () => ({
    default: mockCacheService,
    ...mockCacheService
}));

jest.unstable_mockModule('../src/middleware/tenantHandler.js', () => ({
    tenantHandler: (req, res, next) => {
        req.tenant = {
            id: 'ai-export-tenant',
            name: 'AI Export Tenant',
            plan: 'premium'
        };
        next();
    }
}));

const { default: app } = await import('../src/server.js');
const { default: sequelize } = await import('../src/config/database.js');
const { User } = await import('../src/models/index.js');
const { generateToken } = await import('../src/services/authService.js');
const tempFileService = await import('../src/services/tempFileService.js');

describe('AI Export E2E Test (System Audit 8.2)', () => {
    let authorizedUser;
    let unauthorizedUser;
    let authorizedToken;
    let unauthorizedToken;
    let fileId;

    beforeAll(async () => {
        await sequelize.sync({ force: true });

        authorizedUser = await User.create({
            username: 'ai_export_admin',
            email: 'ai-export-admin@example.com',
            password_hash: 'hash',
            role: 'admin',
            is_active: true,
            permissions: [
                PERMISSIONS.AI.actions.AI_CHAT_VIEW,
                PERMISSIONS.AI.actions.AI_CHAT_ACTION
            ]
        });

        unauthorizedUser = await User.create({
            username: 'ai_export_staff',
            email: 'ai-export-staff@example.com',
            password_hash: 'hash',
            role: 'staff',
            is_active: true,
            permissions: []
        });

        authorizedToken = generateToken(authorizedUser);
        unauthorizedToken = generateToken(unauthorizedUser);
    });

    afterAll(async () => {
        await sequelize.close();
    });

    beforeEach(() => {
        mockCacheMap.clear();
    });

    it('should store CSV and retrieve it via HTTP for an authorized user', async () => {
        const csvContent = 'sku,quantity,price\nSKU-001,100,50.00\nSKU-002,50,25.00';
        const filename = 'inventory_export.csv';

        const storeResult = await tempFileService.storeTemporaryFile(csvContent, filename, authorizedUser.user_id);
        fileId = storeResult.fileId;

        const response = await request(app)
            .get(`/api/v1/ai/exports/${fileId}`)
            .set('Authorization', `Bearer ${authorizedToken}`)
            .set('x-company-token', 'ai-export-tenant')
            .expect(200);

        expect(response.headers['content-type']).toContain('text/csv');
        expect(response.headers['content-disposition']).toContain(`attachment; filename="${filename}"`);
        expect(response.text).toBe(csvContent);
    });

    it('should return 404 for a deleted/expired export for an authorized user', async () => {
        const storeResult = await tempFileService.storeTemporaryFile('sku,qty\nA,1', 'deleted.csv', authorizedUser.user_id);
        fileId = storeResult.fileId;

        await tempFileService.deleteTemporaryFile(fileId);

        const response = await request(app)
            .get(`/api/v1/ai/exports/${fileId}`)
            .set('Authorization', `Bearer ${authorizedToken}`)
            .set('x-company-token', 'ai-export-tenant')
            .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Export file not found or expired');
    });

    it('should return 403 for a user without ai:chat permission', async () => {
        const storeResult = await tempFileService.storeTemporaryFile('sku,qty\nB,2', 'forbidden.csv', authorizedUser.user_id);
        fileId = storeResult.fileId;

        const response = await request(app)
            .get(`/api/v1/ai/exports/${fileId}`)
            .set('Authorization', `Bearer ${unauthorizedToken}`)
            .set('x-company-token', 'ai-export-tenant')
            .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/Access denied/i);
    });
});
