import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Op } from 'sequelize';

const findAll = jest.fn();
const models = {
    BusinessAdminApprovalRequest: { findAll },
    User: null
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((modelName) => models[modelName] || null),
        getStore: jest.fn(() => ({ sequelize: null }))
    }
}));

const { posRepository } = await import('../src/modules/pos/repositories/posRepository.js');

describe('POS approval repository query', () => {
    beforeEach(() => {
        findAll.mockReset().mockResolvedValue([]);
    });

    it('lists all requested POS approval action types in one newest-first query', async () => {
        await posRepository.listBusinessAdminApprovalRequests({
            actionTypes: ['pos_void', 'pos_parked_sale_cancel'],
            status: 'pending',
            limit: 100
        });

        const [options] = findAll.mock.calls[0];
        expect(options.where).toEqual({
            action_type: {
                [Op.in]: ['pos_void', 'pos_parked_sale_cancel']
            },
            status: 'pending'
        });
        expect(options.order).toEqual([
            ['created_at', 'DESC'],
            ['business_admin_approval_request_id', 'DESC']
        ]);
        expect(options.limit).toBe(100);
    });

    it('preserves the single-action compatibility contract', async () => {
        await posRepository.listBusinessAdminApprovalRequests({
            actionType: 'pos_void',
            status: 'pending',
            limit: 10
        });

        const [options] = findAll.mock.calls[0];
        expect(options.where).toEqual({ action_type: 'pos_void', status: 'pending' });
        expect(options.limit).toBe(10);
    });
});
