import { jest } from '@jest/globals';
import { validatePosCheckout } from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('POS checkout discount policy validator', () => {
    it('allows non-zero manual discount without a discount profile', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_amount: 10,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_amount).toBe(10);
    });

  it('allows non-zero discount when discount profile is provided', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_amount: 10,
                discount_profile_name: 'Employee Discount',
                discount_rate: 20,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_profile_name).toBe('Employee Discount');
    });

    it('rejects manual discount_rate without a computed discount amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_amount: 0,
                discount_rate: 20,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });

    it('allows manual amount discount mode without a percentage rate', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_mode: 'amount',
                discount_amount: 25,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_mode).toBe('amount');
        expect(req.validatedData.discount_amount).toBe(25);
        expect(req.validatedData.discount_rate).toBeUndefined();
    });

    it('allows manual percentage discount mode with a rate and computed amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_mode: 'percentage',
                discount_amount: 10,
                discount_rate: 10,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.discount_mode).toBe('percentage');
        expect(req.validatedData.discount_rate).toBe(10);
    });

    it('rejects amount discount mode when a percentage rate is included', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'dine_in',
                payment_type: 'cash',
                discount_mode: 'amount',
                discount_amount: 25,
                discount_rate: 10,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });

    it('accepts optional non-negative service_fee_amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'delivery',
                payment_type: 'cash',
                service_fee_amount: 50,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.service_fee_amount).toBe(50);
    });

    it('rejects negative service_fee_amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'delivery',
                payment_type: 'cash',
                service_fee_amount: -1,
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });

    it('rejects non-numeric service_fee_amount', () => {
        const req = {
            body: {
                idempotency_key: 'idem-12345678',
                order_method: 'delivery',
                payment_type: 'cash',
                service_fee_amount: 'abc',
                lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });
});
