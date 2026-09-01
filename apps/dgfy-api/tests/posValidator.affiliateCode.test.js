import { jest } from '@jest/globals';
import { validatePosCheckout } from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const baseBody = (overrides = {}) => ({
    idempotency_key: 'idem-12345678',
    terminal_id: 'TERM-01',
    order_method: 'dine_in',
    payment_type: 'cash',
    lines: [{ item_id: 1, quantity: 1, sale_price: 100 }],
    ...overrides
});

describe('POS checkout validator - affiliate_code (#1239, Phase 222)', () => {
    it('T1: passes a valid affiliate_code through to req.validatedData (the regression)', () => {
        const req = { body: baseBody({ affiliate_code: 'AF-9K2XQ7', totally_unknown_field: 'x' }) };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.affiliate_code).toBe('AF-9K2XQ7');
        // A sibling undeclared key is still stripped - proving this fix declared one key
        // rather than opening the schema (J4).
        expect(req.validatedData.totally_unknown_field).toBeUndefined();
    });

    it('T2: trims surrounding whitespace', () => {
        const req = { body: baseBody({ affiliate_code: '  AF-9K2XQ7  ' }) };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.affiliate_code).toBe('AF-9K2XQ7');
    });

    it('T3: preserves case, does not uppercase', () => {
        const req = { body: baseBody({ affiliate_code: 'af-9k2xq7' }) };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.affiliate_code).toBe('af-9k2xq7');
        expect(req.validatedData.affiliate_code).not.toBe('AF-9K2XQ7');
    });

    it('T4: blank forms (omitted, empty string, null) do not 422', () => {
        const cases = [
            baseBody(),
            baseBody({ affiliate_code: '' }),
            baseBody({ affiliate_code: null })
        ];

        cases.forEach((body) => {
            const req = { body };
            const res = mockRes();
            const next = jest.fn();

            validatePosCheckout(req, res, next);

            expect(res.status).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledTimes(1);
        });
    });

    it('T5: rejects an absurdly long code at the schema (generic 422, not AFFILIATE_CODE_INVALID - see PHASE_221_PLAN.md §4.2)', () => {
        const req = { body: baseBody({ affiliate_code: 'X'.repeat(41) }) };
        const res = mockRes();
        const next = jest.fn();

        validatePosCheckout(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        const jsonPayload = res.json.mock.calls[0][0];
        expect(jsonPayload.errors.some((e) => e.field === 'affiliate_code')).toBe(true);
    });
});
