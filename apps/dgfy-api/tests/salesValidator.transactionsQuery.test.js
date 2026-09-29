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
                item_id: '14',
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
        expect(req.validatedQuery.item_id).toBe(14);
        expect(req.validatedQuery.sort_order).toBe('desc');
        expect(req.validatedQuery.pos_order_source).toBe('online_store');
    });

    it('preserves validated sales date filters as ISO strings for repository boundaries', () => {
        const req = {
            query: {
                date_from: '2026-09-20',
                date_to: '2026-09-23'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateSalesTransactionsQuery(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.date_from).toBe('2026-09-20');
        expect(req.validatedQuery.date_to).toBe('2026-09-23');
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
