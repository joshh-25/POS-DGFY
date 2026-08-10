import { jest } from '@jest/globals';
import { validateSalesTransactionsQuery } from '../src/validators/salesValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('Sales transactions query validator', () => {
    it('accepts valid pos_order_source filters', () => {
        const req = {
            query: {
                source: 'pos',
                pos_order_source: 'online_store',
                sort_order: 'DESC'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateSalesTransactionsQuery(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.source).toBe('POS');
        expect(req.validatedQuery.sort_order).toBe('desc');
        expect(req.validatedQuery.pos_order_source).toBe('online_store');
    });

    it('rejects unsupported pos_order_source values', () => {
        const req = {
            query: {
                pos_order_source: 'online'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateSalesTransactionsQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });
});
