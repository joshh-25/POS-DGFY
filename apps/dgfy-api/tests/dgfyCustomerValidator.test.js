import { jest } from '@jest/globals';
import { validateDgfyCustomerActivityQuery } from '../src/validators/dgfyCustomerValidator.js';

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('dgfy customer activity query validator', () => {
    it('accepts a positive branch filter and keeps pagination bounded', () => {
        const req = { query: { store_slug: 'cafe-main', location_id: '7', limit: '50' } };
        const res = createRes();
        const next = jest.fn();

        validateDgfyCustomerActivityQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery).toEqual(expect.objectContaining({
            store_slug: 'cafe-main',
            location_id: 7,
            limit: 50,
            page: 1
        }));
    });

    it('rejects invalid branch ids before the use case runs', () => {
        const req = { query: { location_id: '0' } };
        const res = createRes();
        const next = jest.fn();

        validateDgfyCustomerActivityQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('keeps the legacy pos_order activity type valid', () => {
        const req = { query: { type: 'pos_order' } };
        const res = createRes();
        const next = jest.fn();

        validateDgfyCustomerActivityQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.type).toBe('pos_order');
    });
});
