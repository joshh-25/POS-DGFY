import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Op } from 'sequelize';

const findAndCountAll = jest.fn();
const auditLogModel = { findAndCountAll };

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((modelName) => modelName === 'AuditLog' ? auditLogModel : {})
    }
}));

const { auditRepository } = await import('../src/modules/audit/repositories/auditRepository.js');

describe('tenant audit repository', () => {
    beforeEach(() => {
        findAndCountAll.mockReset().mockResolvedValue({ rows: [], count: 0 });
    });

    it('omits noisy routine POS device status checks from the human audit feed', async () => {
        await auditRepository.list();

        const [options] = findAndCountAll.mock.calls[0];
        const deviceStatusFilter = options.where[Op.and].find((clause) => clause[Op.or]);
        expect(deviceStatusFilter[Op.or]).toEqual(expect.arrayContaining([
            { entity_type: { [Op.ne]: 'pos_device_bridge' } },
            { entity_type: 'pos_device_bridge', action: { [Op.ne]: 'VIEW' } }
        ]));
    });

    it('searches all audit fields, including JSON change details', async () => {
        await auditRepository.list({ search: 'Order' });

        const [options] = findAndCountAll.mock.calls[0];
        const searchFilters = options.where[Op.and].filter((clause) => clause[Op.or]);
        expect(searchFilters).toHaveLength(2);
        expect(searchFilters[0][Op.or]).toEqual(expect.arrayContaining([
            { event_type: { [Op.like]: '%Order%' } },
            { entity_type: { [Op.like]: '%Order%' } },
            { changes: { [Op.like]: '%Order%' } },
            { terminal_id: { [Op.like]: '%Order%' } },
            { entity_type: { [Op.like]: '%transaction%' } },
            { entity_type: { [Op.like]: '%parked_sale%' } }
        ]));
    });

    it('parses stored JSON change details for the audit response', async () => {
        findAndCountAll.mockResolvedValue({
            rows: [{
                get: () => ({
                    log_id: 11,
                    entity_type: 'delivery_job',
                    action: 'UPDATE',
                    event_type: 'delivery_job_status_changed',
                    changes: '{"event":"delivery_job_status_changed","previous_status":"assigned","status":"picked_up"}'
                })
            }],
            count: 1
        });

        const result = await auditRepository.list();

        expect(result.logs[0].changes).toEqual({
            event: 'delivery_job_status_changed',
            previous_status: 'assigned',
            status: 'picked_up'
        });
    });
});
