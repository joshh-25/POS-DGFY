import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Op } from 'sequelize';

const mockFindAndCountAll = jest.fn();
const PosTransactionModel = {
    modelName: 'PosTransaction',
    findAndCountAll: mockFindAndCountAll
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((name) => (name === 'PosTransaction' ? PosTransactionModel : { modelName: name })),
        getStore: jest.fn(() => null)
    }
}));

let posRepository;

beforeAll(async () => {
    ({ posRepository } = await import('../src/modules/pos/repositories/posRepository.js'));
});

describe('posRepository online order history', () => {
    beforeEach(() => {
        mockFindAndCountAll.mockReset();
        mockFindAndCountAll.mockResolvedValue({
            rows: [{
                pos_transaction_id: 44,
                toJSON: () => ({ pos_transaction_id: 44, fulfillment_status: 'rejected' })
            }],
            count: 51
        });
    });

    it('keeps paid completed sales out while retaining rejected and cancelled orders', async () => {
        const result = await posRepository.listOnlineOrderHistory({
            locationId: 7,
            search: 'INV-000044',
            page: 2,
            limit: 25
        });

        const query = mockFindAndCountAll.mock.calls[0][0];
        const exceptionClause = query.where[Op.and][0];

        expect(query.where).toMatchObject({
            order_source: 'online_store',
            location_id: 7,
            invoice_number: { [Op.like]: '%INV-000044%' }
        });
        expect(exceptionClause[Op.or]).toEqual(expect.arrayContaining([
            { fulfillment_status: { [Op.in]: ['cancelled', 'rejected'] } },
            { fulfillment_status: 'completed', payment_status: { [Op.ne]: 'paid' } }
        ]));
        expect(query.limit).toBe(25);
        expect(query.offset).toBe(25);
        expect(query.distinct).toBe(true);
        expect(result.pagination).toEqual({ page: 2, limit: 25, total: 51, totalPages: 3 });
        expect(result.orders).toEqual([{ pos_transaction_id: 44, fulfillment_status: 'rejected' }]);
    });

    it('intersects fulfillment and payment filters with the exception query', async () => {
        await posRepository.listOnlineOrderHistory({
            fulfillmentStatus: 'rejected',
            paymentStatus: 'unpaid'
        });

        const query = mockFindAndCountAll.mock.calls[0][0];
        expect(query.where.fulfillment_status).toBe('rejected');
        expect(query.where.payment_status).toBe('unpaid');
    });
});
