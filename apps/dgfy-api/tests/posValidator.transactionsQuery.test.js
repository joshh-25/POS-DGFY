import { jest } from '@jest/globals';
import { validatePosTransactionsQuery } from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('POS transactions query validator', () => {
    it('accepts explicit order_source filter values', () => {
        const req = {
            query: {
                order_source: 'online_store',
                order_method: 'pickup'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosTransactionsQuery(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.order_source).toBe('online_store');
    });

    it('rejects unsupported order_source values', () => {
        const req = {
            query: {
                order_source: 'online'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosTransactionsQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });
});
