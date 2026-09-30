import { jest } from '@jest/globals';
import { Op } from 'sequelize';

const findAndCountAll = jest.fn();
const auditLogModel = { findAndCountAll };
const userModel = { modelName: 'User' };

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((name) => {
            if (name === 'AuditLog') return auditLogModel;
            if (name === 'User') return userModel;
            return null;
        })
    }
}));

let businessAdminOverviewRepository;

beforeAll(async () => {
    ({ businessAdminOverviewRepository } = await import('../src/modules/businessAdmin/repositories/businessAdminOverviewRepository.js'));
});

beforeEach(() => {
    findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
});

describe('Business Admin audit repository date boundaries', () => {
    it('treats date-only filters as inclusive Asia/Manila calendar days', async () => {
        await businessAdminOverviewRepository.listAuditLogPage({
            dateFrom: '2026-09-16',
            dateTo: '2026-09-16'
        });

        const { where } = findAndCountAll.mock.calls[0][0];
        expect(where.timestamp[Op.gte].toISOString()).toBe('2026-09-15T16:00:00.000Z');
        expect(where.timestamp[Op.lte].toISOString()).toBe('2026-09-16T15:59:59.999Z');
    });
});
