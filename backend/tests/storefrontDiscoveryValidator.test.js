import { jest } from '@jest/globals';
import {
    validateStorefrontDiscoveryQuery,
    validateStorefrontMapPinsQuery
} from '../src/validators/storefrontDiscoveryValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('storefrontDiscoveryValidator query contracts', () => {
    it('accepts extended discovery query params and normalizes booleans', () => {
        const req = {
            query: {
                search: 'milk tea',
                result_mode: 'item_only',
                stock_filter: 'include_out_of_stock',
                pin_scope: 'all_matching_branches',
                include_match_meta: '0'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateStorefrontDiscoveryQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.validatedQuery).toMatchObject({
            search: 'milk tea',
            result_mode: 'item_only',
            stock_filter: 'include_out_of_stock',
            pin_scope: 'all_matching_branches',
            include_match_meta: false
        });
    });

    it('applies defaults for new query params', () => {
        const req = { query: {} };
        const res = mockRes();
        const next = jest.fn();

        validateStorefrontDiscoveryQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery).toMatchObject({
            result_mode: 'union',
            include_match_meta: true
        });
        expect(req.validatedQuery.stock_filter).toBeUndefined();
        expect(req.validatedQuery.pin_scope).toBeUndefined();
    });

    it('defaults the third-party map-pins feed to the maximum public page size', () => {
        const req = { query: {} };
        const res = mockRes();
        const next = jest.fn();

        validateStorefrontMapPinsQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery).toMatchObject({
            limit: 100,
            include_match_meta: false,
            include_items: false,
            item_limit: 5
        });
    });

    it('accepts optional map-pins item exposure params', () => {
        const req = {
            query: {
                include_items: 'true',
                item_limit: '10'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateStorefrontMapPinsQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery).toMatchObject({
            include_items: true,
            item_limit: 10
        });
    });

    it('rejects map-pins item_limit above the public cap', () => {
        const req = {
            query: {
                include_items: 'true',
                item_limit: '11'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateStorefrontMapPinsQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });

    it('rejects unsupported result_mode values', () => {
        const req = {
            query: {
                result_mode: 'invalid_mode'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateStorefrontDiscoveryQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });
});
