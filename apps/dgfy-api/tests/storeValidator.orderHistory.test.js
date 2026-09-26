import { jest } from '@jest/globals';
import { validateStoreOrderHistoryQuery } from '../src/validators/storeValidator.js';

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('store order history query validator', () => {
    it('accepts a positive location_id filter', () => {
        const req = { query: { location_id: '12', limit: '25' } };
        const res = createRes();
        const next = jest.fn();

        validateStoreOrderHistoryQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery).toEqual(expect.objectContaining({ location_id: 12, limit: 25 }));
    });

    it('rejects a non-positive location_id filter', () => {
        const req = { query: { location_id: '-1' } };
        const res = createRes();
        const next = jest.fn();

        validateStoreOrderHistoryQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });
});
