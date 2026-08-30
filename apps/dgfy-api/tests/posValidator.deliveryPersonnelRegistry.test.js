import { describe, expect, it, jest } from '@jest/globals';
import {
    validateDeliveryPersonnelCreate,
    validateDeliveryPersonnelParam,
    validateDeliveryPersonnelRegistryQuery,
    validateDeliveryPersonnelUpdate
} from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('POS delivery personnel registry validators', () => {
    it('defaults include_inactive to true on the registry query', () => {
        const req = { query: {} };
        const res = mockRes();
        const next = jest.fn();

        validateDeliveryPersonnelRegistryQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery).toMatchObject({ include_inactive: true });
    });

    it('accepts a minimal create payload and trims display_name', () => {
        const req = { body: { display_name: '  Juan Rider  ' } };
        const res = mockRes();
        const next = jest.fn();

        validateDeliveryPersonnelCreate(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData).toMatchObject({ display_name: 'Juan Rider', is_active: true });
    });

    it('rejects a display_name below the minimum length', () => {
        const req = { body: { display_name: 'J' } };
        const res = mockRes();
        const next = jest.fn();

        validateDeliveryPersonnelCreate(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects a phone longer than 40 characters', () => {
        const req = { body: { display_name: 'Juan Rider', phone: '0'.repeat(41) } };
        const res = mockRes();
        const next = jest.fn();

        validateDeliveryPersonnelCreate(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects an empty update payload (no-op PATCH)', () => {
        const req = { body: {} };
        const res = mockRes();
        const next = jest.fn();

        validateDeliveryPersonnelUpdate(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('accepts an is_active-only update payload', () => {
        const req = { body: { is_active: false } };
        const res = mockRes();
        const next = jest.fn();

        validateDeliveryPersonnelUpdate(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData).toEqual({ is_active: false });
    });

    it('requires a positive integer deliveryPersonnelId param', () => {
        const req = { params: { deliveryPersonnelId: '-1' } };
        const res = mockRes();
        const next = jest.fn();

        validateDeliveryPersonnelParam(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });
});
