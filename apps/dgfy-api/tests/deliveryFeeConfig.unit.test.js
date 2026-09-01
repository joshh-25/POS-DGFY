// Unit tests for Phase 233 (#1324, epic #1321)'s
// apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFeeConfig.js -- the pure normalizer
// behind the delivery-fee mode config schema. No I/O: this module takes already-unwrapped setting
// values and returns a frozen { mode, calc } config.
//
// The regression gate this phase exists under (issue #1324's own acceptance evidence): absent
// config resolves to 'fixed'; garbage config resolves to 'fixed', never a crash.

import { DELIVERY_FEE_MODES, resolveDeliveryFeeConfig } from '../src/modules/deliveryPricing/domain/deliveryFeeConfig.js';

const validCalc = (overrides = {}) => ({
    min_fee: 50,
    included_km: 3,
    per_km_rate: 10,
    increment_km: 0.5,
    max_distance_km: 15,
    ...overrides
});

describe('DELIVERY_FEE_MODES', () => {
    it('is exactly fixed|calculated|free -- provider_quoted is deliberately not included yet', () => {
        expect(DELIVERY_FEE_MODES).toEqual(['fixed', 'calculated', 'free']);
        expect(Object.isFrozen(DELIVERY_FEE_MODES)).toBe(true);
    });
});

describe('resolveDeliveryFeeConfig', () => {
    it('resolves to fixed with no calc when called with no arguments at all', () => {
        const result = resolveDeliveryFeeConfig();
        expect(result).toEqual({ mode: 'fixed', calc: null });
        expect(Object.isFrozen(result)).toBe(true);
    });

    it('resolves to fixed when tenantSettings is absent (undefined)', () => {
        expect(resolveDeliveryFeeConfig({})).toEqual({ mode: 'fixed', calc: null });
    });

    it('resolves to fixed when tenantSettings is null', () => {
        expect(resolveDeliveryFeeConfig({ tenantSettings: null })).toEqual({ mode: 'fixed', calc: null });
    });

    it('resolves to fixed when store_delivery_fee_mode is absent from tenantSettings', () => {
        const result = resolveDeliveryFeeConfig({ tenantSettings: { store_delivery_fee_calc: validCalc() } });
        expect(result.mode).toBe('fixed');
        // Absent mode short-circuits to fixed regardless of what the calc blob contains --
        // calc is only ever surfaced when mode === 'calculated'.
        expect(result.calc).toBeNull();
    });

    it.each([
        'garbage',
        'FIXED_MODE',
        '',
        '   ',
        'calculatedd',
        123,
        true,
        {},
        [],
        null
    ])('resolves to fixed for garbage store_delivery_fee_mode value: %p', (garbageMode) => {
        const result = resolveDeliveryFeeConfig({ tenantSettings: { store_delivery_fee_mode: garbageMode } });
        expect(result).toEqual({ mode: 'fixed', calc: null });
    });

    it('accepts store_delivery_fee_mode case/whitespace-insensitively', () => {
        expect(resolveDeliveryFeeConfig({ tenantSettings: { store_delivery_fee_mode: '  Calculated  ' } }).mode)
            .toBe('calculated');
        expect(resolveDeliveryFeeConfig({ tenantSettings: { store_delivery_fee_mode: 'FREE' } }).mode)
            .toBe('free');
    });

    it('resolves free mode with no calc (calc is calculated-mode-only)', () => {
        const result = resolveDeliveryFeeConfig({
            tenantSettings: { store_delivery_fee_mode: 'free', store_delivery_fee_calc: validCalc() }
        });
        expect(result).toEqual({ mode: 'free', calc: null });
    });

    it('resolves calculated mode with a well-formed calc blob', () => {
        const result = resolveDeliveryFeeConfig({
            tenantSettings: { store_delivery_fee_mode: 'calculated', store_delivery_fee_calc: validCalc() }
        });
        expect(result.mode).toBe('calculated');
        expect(result.calc).toEqual(validCalc());
        expect(Object.isFrozen(result.calc)).toBe(true);
    });

    it('resolves calculated mode with calc: null when the blob is absent', () => {
        const result = resolveDeliveryFeeConfig({ tenantSettings: { store_delivery_fee_mode: 'calculated' } });
        expect(result).toEqual({ mode: 'calculated', calc: null });
    });

    it.each([
        ['not an object', 'a string'],
        ['an array', []],
        ['a number', 42],
        ['null', null]
    ])('resolves calc: null when the blob is %s', (_label, garbageBlob) => {
        const result = resolveDeliveryFeeConfig({
            tenantSettings: { store_delivery_fee_mode: 'calculated', store_delivery_fee_calc: garbageBlob }
        });
        expect(result).toEqual({ mode: 'calculated', calc: null });
    });

    it.each([
        ['min_fee', -1],
        ['min_fee', 'abc'],
        ['min_fee', undefined],
        ['included_km', -1],
        ['per_km_rate', -1],
        ['increment_km', 0],
        ['increment_km', -0.5],
        ['max_distance_km', 0]
    ])('resolves calc: null when %s is invalid (%p)', (field, badValue) => {
        const result = resolveDeliveryFeeConfig({
            tenantSettings: {
                store_delivery_fee_mode: 'calculated',
                store_delivery_fee_calc: validCalc({ [field]: badValue })
            }
        });
        expect(result).toEqual({ mode: 'calculated', calc: null });
    });

    it('resolves calc: null when max_distance_km is less than included_km (nonsensical formula)', () => {
        const result = resolveDeliveryFeeConfig({
            tenantSettings: {
                store_delivery_fee_mode: 'calculated',
                store_delivery_fee_calc: validCalc({ included_km: 10, max_distance_km: 5 })
            }
        });
        expect(result).toEqual({ mode: 'calculated', calc: null });
    });

    it('allows max_distance_km equal to included_km (the boundary is inclusive)', () => {
        const result = resolveDeliveryFeeConfig({
            tenantSettings: {
                store_delivery_fee_mode: 'calculated',
                store_delivery_fee_calc: validCalc({ included_km: 5, max_distance_km: 5 })
            }
        });
        expect(result.calc).not.toBeNull();
    });

    describe('locationOverride (Wave 0a decision #1: wholesale replacement, not merged)', () => {
        it('is ignored when null -- tenantSettings alone decides the result', () => {
            const result = resolveDeliveryFeeConfig({
                tenantSettings: { store_delivery_fee_mode: 'free' },
                locationOverride: null
            });
            expect(result.mode).toBe('free');
        });

        it('fully replaces tenantSettings when present, never merges field-by-field', () => {
            const result = resolveDeliveryFeeConfig({
                tenantSettings: { store_delivery_fee_mode: 'calculated', store_delivery_fee_calc: validCalc() },
                locationOverride: { store_delivery_fee_mode: 'free' }
            });
            // If this merged instead of replacing wholesale, calc would still be populated from
            // tenantSettings. It must not be -- the override blob has no store_delivery_fee_calc
            // of its own, and wholesale replacement means that's simply absent, not inherited.
            expect(result).toEqual({ mode: 'free', calc: null });
        });
    });
});
