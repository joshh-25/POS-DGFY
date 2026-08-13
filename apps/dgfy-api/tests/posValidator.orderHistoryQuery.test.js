import { describe, expect, it, jest } from '@jest/globals';
import { validateOnlineOrderHistoryQuery } from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('POS online order history query validator', () => {
    it('accepts history filters and applies pagination defaults', () => {
        const req = {
            query: {
                location_id: '7',
                search: 'INV-000044',
                fulfillment_status: 'rejected',
                payment_status: 'unpaid'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateOnlineOrderHistoryQuery(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery).toMatchObject({
            location_id: 7,
            search: 'INV-000044',
            fulfillment_status: 'rejected',
            payment_status: 'unpaid',
            page: 1,
            limit: 100
        });
    });

    it('accepts completed status for completed but unpaid orders', () => {
        const req = { query: { fulfillment_status: 'completed', payment_status: 'payment_pending' } };
        const res = mockRes();
        const next = jest.fn();

        validateOnlineOrderHistoryQuery(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.fulfillment_status).toBe('completed');
    });

    it('rejects unsupported fulfillment status values', () => {
        const req = { query: { fulfillment_status: 'preparing' } };
        const res = mockRes();
        const next = jest.fn();

        validateOnlineOrderHistoryQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });
});
