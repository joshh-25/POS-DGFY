import { jest } from '@jest/globals';
import request from 'supertest';
import { PERMISSIONS } from '../src/config/permissions.js';
import dbStore from '../src/utils/dbStore.js';

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
        const tenant = {
            id: 'ai-export-tenant',
            name: 'AI Export Tenant',
            status: 'active',
            plan: 'premium',
            subscription_status: 'active'
        };
        req.tenant = tenant;
        dbStore.run({
            tenantId: tenant.id,
            tenantName: tenant.name,
            tenantToken: req.headers['x-company-token'] || 'ai-export-tenant',
            User
        }, next);
    },
    invalidateTenantLookupCache: jest.fn()
}));

const { default: app } = await import('../src/server.js');
const { default: sequelize } = await import('../src/config/database.js');
const { User } = await import('../src/models/index.js');
const { generateToken } = await import('../src/services/authService.js');
const tempFileService = await import('../src/services/tempFileService.js');

describe('AI Export E2E Test (System Audit 8.2)', () => {
    let authorizedUser;
    let secondAuthorizedUser;
    let unauthorizedUser;
    let authorizedToken;
    let secondAuthorizedToken;
    let unauthorizedToken;
    let fileId;

    beforeAll(async () => {
        await sequelize.sync();
        await User.destroy({
            where: {
                email: ['ai-export-admin@example.com', 'ai-export-second@example.com', 'ai-export-staff@example.com']
            }
        }).catch(() => null);

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
            role: 'cashier',
            is_active: true,
            permissions: []
        });

        secondAuthorizedUser = await User.create({
            username: 'ai_export_second',
            email: 'ai-export-second@example.com',
            password_hash: 'hash',
            role: 'admin',
            is_active: true,
            permissions: [
                PERMISSIONS.AI.actions.AI_CHAT_VIEW,
                PERMISSIONS.AI.actions.AI_CHAT_ACTION
            ]
        });

        authorizedToken = generateToken(authorizedUser, { tenantId: 'ai-export-tenant' });
        secondAuthorizedToken = generateToken(secondAuthorizedUser, { tenantId: 'ai-export-tenant' });
        unauthorizedToken = generateToken(unauthorizedUser, { tenantId: 'ai-export-tenant' });
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

    it('should not expose local temp export data through public uploads', async () => {
        const originalEnv = { ...process.env };
        process.env.HOSTING_PROFILE = 'shared';
        process.env.TEMP_FILE_STORAGE = 'local';
        process.env.REDIS_URL = '';

        try {
            const storeResult = await tempFileService.storeTemporaryFile('sku,qty\nLOCAL,1', 'local.csv', authorizedUser.user_id);
            fileId = storeResult.fileId;

            await request(app)
                .get(`/uploads/temp/ai-export-${fileId}.json`)
                .expect(404);
        } finally {
            process.env = originalEnv;
            if (fileId) {
                await tempFileService.deleteTemporaryFile(fileId);
                fileId = null;
            }
        }
    });

    it('should return 404 when another authorized user tries to download someone else export', async () => {
        const storeResult = await tempFileService.storeTemporaryFile('sku,qty\nPRIVATE,1', 'private.csv', authorizedUser.user_id);
        fileId = storeResult.fileId;

        const response = await request(app)
            .get(`/api/v1/ai/exports/${fileId}`)
            .set('Authorization', `Bearer ${secondAuthorizedToken}`)
            .set('x-company-token', 'ai-export-tenant')
            .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toBe('Export file not found or expired');
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
