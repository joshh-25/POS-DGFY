import { jest } from '@jest/globals';

const { resolveSeededAdminUserId } = await import('../src/services/tenantProvisioningService.js');

describe('tenant provisioning admin user id resolution', () => {
    afterAll(async () => {
        const sequelize = (await import('../src/config/database.js')).default;
        await sequelize.close().catch(() => {});
    });

    it('uses insert metadata when the database driver exposes insertId', async () => {
        const tenantSequelize = { query: jest.fn() };

        const id = await resolveSeededAdminUserId({
            tenantSequelize,
            insertResult: undefined,
            insertMetadata: { insertId: 17 },
            email: 'owner@example.test'
        });

        expect(id).toBe(17);
        expect(tenantSequelize.query).not.toHaveBeenCalled();
    });

    it('falls back to querying the seeded tenant user by email when insertId is missing', async () => {
        const tenantSequelize = {
            query: jest.fn().mockResolvedValue([[{ user_id: 23 }]])
        };

        const id = await resolveSeededAdminUserId({
            tenantSequelize,
            insertResult: [],
            insertMetadata: undefined,
            email: 'OWNER@EXAMPLE.TEST'
        });

        expect(id).toBe(23);
        expect(tenantSequelize.query).toHaveBeenCalledWith(
            'SELECT user_id FROM users WHERE LOWER(email) = ? ORDER BY user_id DESC LIMIT 1',
            { replacements: ['owner@example.test'] }
        );
    });
});
