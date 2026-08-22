// Unit tests for Phase 140 (#821)'s
// apps/dgfy-api/src/modules/shared/utils/downpaymentPolicy.js -- the pure math behind
// server-authoritative downpayment resolution. No I/O, no database, no injected dependency: this
// module takes a settings object and a total and returns a split.

import { resolveDownpaymentForTotal } from '../src/modules/shared/utils/downpaymentPolicy.js';

const fullPaymentSettings = () => ({
    payment_mode: 'full_payment',
    downpayment_type: null,
    downpayment_rate_bps: null,
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true
});

const percentageSettings = (overrides = {}) => ({
    payment_mode: 'downpayment_required',
    downpayment_type: 'percentage',
    downpayment_rate_bps: 2000, // 20%
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true,
    ...overrides
});

const fixedSettings = (overrides = {}) => ({
    payment_mode: 'downpayment_required',
    downpayment_type: 'fixed',
    downpayment_rate_bps: null,
    downpayment_fixed_centavos: 10000, // PHP 100
    min_downpayment_centavos: 0,
    downpayment_refundable: true,
    ...overrides
});

describe('resolveDownpaymentForTotal', () => {
    it('returns the null-shaped full_payment result when settings is null (no ambient tenant)', () => {
        const result = resolveDownpaymentForTotal({ settings: null, totalAmount: 500 });
        expect(result).toEqual({
            payment_mode: 'full_payment',
            downpayment_amount: null,
            balance_due_amount: null,
            downpayment_refundable: null
        });
    });

    it('returns the null-shaped full_payment result when payment_mode is full_payment', () => {
        const result = resolveDownpaymentForTotal({ settings: fullPaymentSettings(), totalAmount: 500 });
        expect(result).toEqual({
            payment_mode: 'full_payment',
            downpayment_amount: null,
            balance_due_amount: null,
            downpayment_refundable: null
        });
    });

    it('computes a percentage downpayment against the (already-discounted) total', () => {
        const result = resolveDownpaymentForTotal({ settings: percentageSettings(), totalAmount: 500 });
        // 20% of PHP 500 = PHP 100, balance PHP 400.
        expect(result).toEqual({
            payment_mode: 'downpayment_required',
            downpayment_amount: 100,
            balance_due_amount: 400,
            downpayment_refundable: true
        });
    });

    it('computes a fixed downpayment regardless of total (below the total)', () => {
        const result = resolveDownpaymentForTotal({ settings: fixedSettings(), totalAmount: 500 });
        // Fixed PHP 100 downpayment on a PHP 500 total, balance PHP 400.
        expect(result).toEqual({
            payment_mode: 'downpayment_required',
            downpayment_amount: 100,
            balance_due_amount: 400,
            downpayment_refundable: true
        });
    });

    it('rounds a percentage split to the nearest centavo, matching the bps rounding convention', () => {
        // 1/3 of PHP 100 -> 33.33... pesos. 33.33% bps = 3333 bps of 10000 centavos = 3333.0 -> 33.33
        // exactly, so use a case that actually forces rounding: 15% of PHP 33.33.
        const result = resolveDownpaymentForTotal({
            settings: percentageSettings({ downpayment_rate_bps: 1500 }),
            totalAmount: 33.33
        });
        // totalCentavos = 3333; raw = round(3333 * 1500 / 10000) = round(499.95) = 500 centavos = 5.00
        expect(result.downpayment_amount).toBe(5);
        expect(result.balance_due_amount).toBe(28.33);
    });

    it('applies the min_downpayment_centavos floor when the computed amount is below it', () => {
        const result = resolveDownpaymentForTotal({
            settings: percentageSettings({ downpayment_rate_bps: 500, min_downpayment_centavos: 20000 }), // 5% floor 200
            totalAmount: 500
        });
        // 5% of 500 = 25, but the floor is 200 -> downpayment is 200, balance 300.
        expect(result).toEqual({
            payment_mode: 'downpayment_required',
            downpayment_amount: 200,
            balance_due_amount: 300,
            downpayment_refundable: true
        });
    });

    it('clamps the downpayment to the total when the floor (or rate) would exceed it -- balance is exactly 0, never negative', () => {
        const result = resolveDownpaymentForTotal({
            settings: percentageSettings({ downpayment_rate_bps: 500, min_downpayment_centavos: 100000 }), // floor PHP 1000
            totalAmount: 500
        });
        expect(result).toEqual({
            payment_mode: 'downpayment_required',
            downpayment_amount: 500,
            balance_due_amount: 0,
            downpayment_refundable: true
        });
    });

    it('clamps a fixed downpayment larger than the total to the total', () => {
        const result = resolveDownpaymentForTotal({
            settings: fixedSettings({ downpayment_fixed_centavos: 100000 }), // PHP 1000
            totalAmount: 250
        });
        expect(result).toEqual({
            payment_mode: 'downpayment_required',
            downpayment_amount: 250,
            balance_due_amount: 0,
            downpayment_refundable: true
        });
    });

    it('treats a zero total as full_payment -- nothing to split', () => {
        const result = resolveDownpaymentForTotal({ settings: percentageSettings(), totalAmount: 0 });
        expect(result.payment_mode).toBe('full_payment');
        expect(result.downpayment_amount).toBeNull();
    });

    it('treats a negative total as full_payment -- fail closed, never a negative downpayment', () => {
        const result = resolveDownpaymentForTotal({ settings: percentageSettings(), totalAmount: -10 });
        expect(result.payment_mode).toBe('full_payment');
    });

    it('fails closed to full_payment when downpayment_type is missing/malformed on a downpayment_required row', () => {
        const result = resolveDownpaymentForTotal({
            settings: { payment_mode: 'downpayment_required', downpayment_type: null },
            totalAmount: 500
        });
        expect(result.payment_mode).toBe('full_payment');
        expect(result.downpayment_amount).toBeNull();
    });

    it('fails closed to full_payment when downpayment_type is percentage but rate_bps is missing', () => {
        const result = resolveDownpaymentForTotal({
            settings: percentageSettings({ downpayment_rate_bps: null }),
            totalAmount: 500
        });
        expect(result.payment_mode).toBe('full_payment');
    });

    it('fails closed to full_payment when downpayment_type is fixed but fixed_centavos is missing', () => {
        const result = resolveDownpaymentForTotal({
            settings: fixedSettings({ downpayment_fixed_centavos: null }),
            totalAmount: 500
        });
        expect(result.payment_mode).toBe('full_payment');
    });

    it('reports downpayment_refundable: false when the merchant configured it non-refundable', () => {
        const result = resolveDownpaymentForTotal({
            settings: percentageSettings({ downpayment_refundable: false }),
            totalAmount: 500
        });
        expect(result.downpayment_refundable).toBe(false);
    });
});
