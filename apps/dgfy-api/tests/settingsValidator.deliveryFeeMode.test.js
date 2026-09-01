import { describe, expect, it, jest } from '@jest/globals';
import { validateUpdateSettings, validateUpdateSingleSetting } from '../src/validators/settingsValidator.js';

// Phase 233 (#1324, epic #1321): store_delivery_fee_mode / store_delivery_fee_calc, the fee-mode
// config schema. Wave 0a decision #1: store_delivery_fee_calc is ONE JSON blob, replaced wholesale
// -- not discrete keys, and all five formula fields are required together when the blob is present
// at all (a partial blob is rejected, not silently accepted).

const buildResponse = () => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    };
    return res;
};

const validCalc = () => ({
    min_fee: 50,
    included_km: 3,
    per_km_rate: 10,
    increment_km: 0.5,
    max_distance_km: 15
});

describe('settings validator store_delivery_fee_mode / store_delivery_fee_calc contract', () => {
    it('accepts each of the three defined modes on the bulk PUT route', () => {
        for (const mode of ['fixed', 'calculated', 'free']) {
            const req = { body: { store_delivery_fee_mode: mode } };
            const res = buildResponse();
            const next = jest.fn();

            validateUpdateSettings(req, res, next);

            expect(res.status).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledTimes(1);
            expect(req.validatedData.store_delivery_fee_mode).toBe(mode);
        }
    });

    it('normalizes case/whitespace on the bulk PUT route', () => {
        const req = { body: { store_delivery_fee_mode: '  Calculated  ' } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSettings(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.store_delivery_fee_mode).toBe('calculated');
    });

    it('rejects an unrecognized mode, including the reserved-not-built provider_quoted', () => {
        for (const badMode of ['provider_quoted', 'nonsense', '']) {
            const req = { body: { store_delivery_fee_mode: badMode } };
            const res = buildResponse();
            const next = jest.fn();

            validateUpdateSettings(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(422);
        }
    });

    it('accepts a well-formed store_delivery_fee_calc blob on the bulk PUT route', () => {
        const req = { body: { store_delivery_fee_mode: 'calculated', store_delivery_fee_calc: validCalc() } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSettings(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.store_delivery_fee_calc).toEqual(validCalc());
    });

    it('does not require store_delivery_fee_calc when only setting a fixed-mode-only body', () => {
        const req = { body: { store_delivery_fee: 25 } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSettings(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['missing max_distance_km', { min_fee: 50, included_km: 3, per_km_rate: 10, increment_km: 0.5 }],
        ['negative min_fee', { ...validCalc(), min_fee: -1 }],
        ['zero increment_km', { ...validCalc(), increment_km: 0 }],
        ['zero max_distance_km', { ...validCalc(), max_distance_km: 0 }],
        ['max_distance_km below included_km', { ...validCalc(), included_km: 10, max_distance_km: 5 }]
    ])('rejects a store_delivery_fee_calc blob with %s', (_label, badCalc) => {
        const req = { body: { store_delivery_fee_calc: badCalc } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSettings(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('accepts store_delivery_fee_mode through the single-setting update route', () => {
        const req = { params: { key: 'store_delivery_fee_mode' }, body: { value: 'free' } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSingleSetting(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('accepts store_delivery_fee_calc through the single-setting update route', () => {
        const req = { params: { key: 'store_delivery_fee_calc' }, body: { value: validCalc() } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSingleSetting(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects a partial store_delivery_fee_calc through the single-setting update route', () => {
        const req = { params: { key: 'store_delivery_fee_calc' }, body: { value: { min_fee: 50 } } };
        const res = buildResponse();
        const next = jest.fn();

        validateUpdateSingleSetting(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });
});
