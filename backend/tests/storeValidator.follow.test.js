import { jest } from '@jest/globals';
import {
    validateStorefrontFollowBody,
    validateStorefrontFollowQuery
} from '../src/validators/storeValidator.js';

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('storeValidator follow payload', () => {
    it('accepts guest follow body when visitor_id is present', () => {
        const req = {
            storeCustomer: null,
            body: {
                storefront_slug: 'alpha-store',
                visitor_id: 'guestvisitorid-1234567890'
            }
        };
        const res = createRes();
        const next = jest.fn();

        validateStorefrontFollowBody(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData).toEqual(expect.objectContaining({
            storefront_slug: 'alpha-store',
            visitor_id: 'guestvisitorid-1234567890'
        }));
    });

    it('rejects guest follow query when visitor_id is missing', () => {
        const req = {
            storeCustomer: null,
            query: {
                storefront_slug: 'alpha-store'
            }
        };
        const res = createRes();
        const next = jest.fn();

        validateStorefrontFollowQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('accepts authenticated follow body without visitor_id', () => {
        const req = {
            storeCustomer: { customer_id: 88 },
            body: {
                storefront_slug: 'alpha-store'
            }
        };
        const res = createRes();
        const next = jest.fn();

        validateStorefrontFollowBody(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData).toEqual(expect.objectContaining({
            storefront_slug: 'alpha-store'
        }));
    });
});
