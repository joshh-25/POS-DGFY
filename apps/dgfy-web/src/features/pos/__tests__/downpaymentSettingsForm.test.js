import { describe, expect, it } from 'vitest';
import {
    MAX_SAFE_CENTAVOS,
    createDefaultDownpaymentForm,
    formToPayload,
    previewDownpaymentSplit,
    settingsToForm,
    validateDownpaymentForm
} from '../utils/downpaymentSettingsForm.js';

describe('settingsToForm / formToPayload', () => {
    it('defaults to full_payment with an empty percentage form when settings is the synthesized default', () => {
        const form = settingsToForm({
            tenant_id: 't-1',
            payment_mode: 'full_payment',
            downpayment_type: null,
            downpayment_rate_bps: null,
            downpayment_fixed_centavos: null,
            min_downpayment_centavos: 0,
            downpayment_refundable: true
        });

        expect(form).toEqual({
            payment_mode: 'full_payment',
            downpayment_type: 'percentage',
            downpayment_rate_percentage: '',
            downpayment_fixed_pesos: '',
            min_downpayment_pesos: '',
            downpayment_refundable: true
        });
    });

    it('hydrates a stored percentage row (mirrors the seeded Pat Marketing row: 20%, PHP 50 min)', () => {
        const form = settingsToForm({
            payment_mode: 'downpayment_required',
            downpayment_type: 'percentage',
            downpayment_rate_bps: 2000,
            downpayment_fixed_centavos: null,
            min_downpayment_centavos: 5000,
            downpayment_refundable: true
        });

        expect(form).toMatchObject({
            payment_mode: 'downpayment_required',
            downpayment_type: 'percentage',
            downpayment_rate_percentage: '20.00',
            min_downpayment_pesos: '50.00',
            downpayment_refundable: true
        });
    });

    it('round-trips a fixed-amount row through form and back to a payload', () => {
        const form = settingsToForm({
            payment_mode: 'downpayment_required',
            downpayment_type: 'fixed',
            downpayment_rate_bps: null,
            downpayment_fixed_centavos: 10000,
            min_downpayment_centavos: 5000,
            downpayment_refundable: false
        });
        expect(form.downpayment_fixed_pesos).toBe('100.00');

        const payload = formToPayload(form);
        expect(payload).toEqual({
            payment_mode: 'downpayment_required',
            downpayment_type: 'fixed',
            downpayment_rate_bps: null,
            downpayment_fixed_centavos: 10000,
            min_downpayment_centavos: 5000,
            downpayment_refundable: false
        });
    });

    it('always emits the full field set on payload, never a partial diff, even in full_payment mode', () => {
        const payload = formToPayload(createDefaultDownpaymentForm());
        expect(Object.keys(payload).sort()).toEqual([
            'downpayment_fixed_centavos',
            'downpayment_rate_bps',
            'downpayment_refundable',
            'downpayment_type',
            'min_downpayment_centavos',
            'payment_mode'
        ]);
        expect(payload.downpayment_type).toBeNull();
    });

    it('clamps an amount input above the MySQL INTEGER column max down to MAX_SAFE_CENTAVOS', () => {
        const form = { ...createDefaultDownpaymentForm(), payment_mode: 'downpayment_required', downpayment_type: 'fixed', downpayment_fixed_pesos: '99999999999' };
        const payload = formToPayload(form);
        expect(payload.downpayment_fixed_centavos).toBe(MAX_SAFE_CENTAVOS);
    });

    it('clamps a percentage input above 100% down to 10000 bps', () => {
        const form = { ...createDefaultDownpaymentForm(), payment_mode: 'downpayment_required', downpayment_type: 'percentage', downpayment_rate_percentage: '250' };
        const payload = formToPayload(form);
        expect(payload.downpayment_rate_bps).toBe(10000);
    });
});

describe('validateDownpaymentForm -- mirrors downpaymentSettingsUseCases.js effective-row rules', () => {
    it('is always valid in full_payment mode regardless of the amount fields', () => {
        expect(validateDownpaymentForm(createDefaultDownpaymentForm())).toEqual([]);
    });

    it('requires downpayment_type when mode is downpayment_required (unreachable via the UI\'s own default, kept as a direct-state guard)', () => {
        const errors = validateDownpaymentForm({
            payment_mode: 'downpayment_required',
            downpayment_type: null,
            downpayment_rate_percentage: '',
            downpayment_fixed_pesos: '',
            min_downpayment_pesos: '50.00',
            downpayment_refundable: true
        });
        expect(errors).toEqual([{ field: 'downpayment_type', message: expect.stringContaining('downpayment_type is required') }]);
    });

    it('requires downpayment_rate_bps when type is percentage', () => {
        const errors = validateDownpaymentForm({
            payment_mode: 'downpayment_required',
            downpayment_type: 'percentage',
            downpayment_rate_percentage: '',
            downpayment_fixed_pesos: '',
            min_downpayment_pesos: '50.00',
            downpayment_refundable: true
        });
        expect(errors).toEqual([{ field: 'downpayment_rate_bps', message: expect.stringContaining('downpayment_rate_bps is required') }]);
    });

    it('requires downpayment_fixed_centavos when type is fixed', () => {
        const errors = validateDownpaymentForm({
            payment_mode: 'downpayment_required',
            downpayment_type: 'fixed',
            downpayment_rate_percentage: '',
            downpayment_fixed_pesos: '',
            min_downpayment_pesos: '50.00',
            downpayment_refundable: true
        });
        expect(errors).toEqual([{ field: 'downpayment_fixed_centavos', message: expect.stringContaining('downpayment_fixed_centavos is required') }]);
    });

    it('requires min_downpayment_centavos > 0', () => {
        const errors = validateDownpaymentForm({
            payment_mode: 'downpayment_required',
            downpayment_type: 'percentage',
            downpayment_rate_percentage: '20',
            downpayment_fixed_pesos: '',
            min_downpayment_pesos: '',
            downpayment_refundable: true
        });
        expect(errors).toEqual([{ field: 'min_downpayment_centavos', message: expect.stringContaining('min_downpayment_centavos must be greater than 0') }]);
    });

    it('is valid for a fully-configured downpayment_required row', () => {
        const errors = validateDownpaymentForm({
            payment_mode: 'downpayment_required',
            downpayment_type: 'percentage',
            downpayment_rate_percentage: '20',
            downpayment_fixed_pesos: '',
            min_downpayment_pesos: '50.00',
            downpayment_refundable: true
        });
        expect(errors).toEqual([]);
    });
});

describe('previewDownpaymentSplit -- mirrors downpaymentPolicy.js:resolveDownpaymentForTotal', () => {
    const percentForm = (overrides = {}) => ({
        payment_mode: 'downpayment_required',
        downpayment_type: 'percentage',
        downpayment_rate_percentage: '20',
        downpayment_fixed_pesos: '',
        min_downpayment_pesos: '0',
        downpayment_refundable: true,
        ...overrides
    });

    it('returns nulls for full_payment mode', () => {
        expect(previewDownpaymentSplit({ form: createDefaultDownpaymentForm(), sampleTotalPesos: '500' }))
            .toEqual({ downpaymentAmountPesos: null, balanceDueAmountPesos: null });
    });

    it('computes a 20% split on PHP 500 -- PHP 100 down, PHP 400 balance (matches the backend unit test case)', () => {
        expect(previewDownpaymentSplit({ form: percentForm(), sampleTotalPesos: '500' }))
            .toEqual({ downpaymentAmountPesos: '100.00', balanceDueAmountPesos: '400.00' });
    });

    it('rounds to the nearest centavo the same way the server does (15% of PHP 33.33 -> PHP 5.00)', () => {
        const result = previewDownpaymentSplit({
            form: percentForm({ downpayment_rate_percentage: '15' }),
            sampleTotalPesos: '33.33'
        });
        expect(result).toEqual({ downpaymentAmountPesos: '5.00', balanceDueAmountPesos: '28.33' });
    });

    it('applies the min_downpayment_pesos floor', () => {
        const result = previewDownpaymentSplit({
            form: percentForm({ downpayment_rate_percentage: '5', min_downpayment_pesos: '200' }),
            sampleTotalPesos: '500'
        });
        expect(result).toEqual({ downpaymentAmountPesos: '200.00', balanceDueAmountPesos: '300.00' });
    });

    it('clamps the downpayment to the total -- balance is exactly 0, never negative', () => {
        const result = previewDownpaymentSplit({
            form: percentForm({ downpayment_rate_percentage: '5', min_downpayment_pesos: '1000' }),
            sampleTotalPesos: '500'
        });
        expect(result).toEqual({ downpaymentAmountPesos: '500.00', balanceDueAmountPesos: '0.00' });
    });

    it('returns nulls for a zero sample total', () => {
        expect(previewDownpaymentSplit({ form: percentForm(), sampleTotalPesos: '0' }))
            .toEqual({ downpaymentAmountPesos: null, balanceDueAmountPesos: null });
    });
});
