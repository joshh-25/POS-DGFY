import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PERMISSIONS } from '../src/config/permissions.js';
import { buildListBusinessAdminOrdersUseCase } from '../src/modules/businessAdmin/usecases/businessAdminOrderCenterUseCase.js';

const USER = {
    user_id: 7,
    role: 'manager',
    permissions: [
        PERMISSIONS.BUSINESS_ADMIN.actions.ACCESS,
        PERMISSIONS.BUSINESS_ADMIN.actions.VIEW_ALL_BRANCHES
    ]
};

const orderList = jest.fn();
const overviewRepository = {
    listUserLocationGrantIds: jest.fn()
};

const listOrders = buildListBusinessAdminOrdersUseCase({
    businessAdminOrderCenterRepository: { listOrders: orderList },
    businessAdminOverviewRepository: overviewRepository
});

beforeEach(() => {
    orderList.mockReset();
    orderList.mockResolvedValue({
        orders: [],
        pagination: { page: 1, limit: 25, total: 0, total_pages: 0 }
    });
});

describe('Business Admin Order Center receipt-type filter', () => {
    it('normalizes and forwards the supported receipt type to the canonical repository', async () => {
        const result = await listOrders({
            user: USER,
            query: { receipt_type: 'Refund' }
        });

        expect(result.success).toBe(true);
        expect(orderList).toHaveBeenCalledWith(expect.objectContaining({
            filters: expect.objectContaining({ receiptType: 'refund' })
        }));
    });

    it('rejects unsupported receipt types before querying transaction data', async () => {
        const result = await listOrders({
            user: USER,
            query: { receipt_type: 'chargeback' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.message).toBe('receipt_type is invalid.');
        expect(orderList).not.toHaveBeenCalled();
    });
});
