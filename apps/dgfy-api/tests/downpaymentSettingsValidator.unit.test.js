import { jest } from '@jest/globals';
import { validateUpdateDownpaymentSettings } from '../src/validators/downpaymentSettingsValidator.js';

const createRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('downpaymentSettingsValidator', () => {
    it('accepts a well-formed partial payload', () => {
        const req = { body: { payment_mode: 'downpayment_required', downpayment_type: 'percentage', downpayment_rate_bps: 2000 } };
        const res = createRes();
        const next = jest.fn();

        validateUpdateDownpaymentSettings(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.validatedData.payment_mode).toBe('downpayment_required');
    });

    it('rejects an empty payload', () => {
        const req = { body: {} };
        const res = createRes();
        const next = jest.fn();

        validateUpdateDownpaymentSettings(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects an out-of-range downpayment_rate_bps', () => {
        const req = { body: { downpayment_rate_bps: 10001 } };
        const res = createRes();
        const next = jest.fn();

        validateUpdateDownpaymentSettings(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        const payload = res.json.mock.calls[0][0];
        expect(payload.errors[0].field).toBe('downpayment_rate_bps');
    });

    it('rejects an unrecognized payment_mode literal', () => {
        const req = { body: { payment_mode: 'bogus' } };
        const res = createRes();
        const next = jest.fn();

        validateUpdateDownpaymentSettings(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    // Phase 150 (#866): customer_choice is now a fully supported payment_mode end to end -- this
    // schema-layer acceptance is no longer paired with a use-case-layer rejection.
    it('accepts customer_choice at the schema layer', () => {
        const req = { body: { payment_mode: 'customer_choice' } };
        const res = createRes();
        const next = jest.fn();

        validateUpdateDownpaymentSettings(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('allows allowed_capture_methods to be explicitly null', () => {
        const req = { body: { allowed_capture_methods: null } };
        const res = createRes();
        const next = jest.fn();

        validateUpdateDownpaymentSettings(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.allowed_capture_methods).toBeNull();
    });
});
