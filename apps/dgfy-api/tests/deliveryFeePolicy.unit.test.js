// Unit tests for src/modules/deliveryPricing/domain/deliveryFeePolicy.js -- the pure
// calculated-delivery-fee math for Phase 235 (#1325, epic #1321), governed by ADR 0066 Decision 2
// and ADR 0078 Decision 2.
//
// Fixture-driven, mirroring voucherBenefitPolicy.unit.test.js, plus invariants asserted on EVERY
// solvable case rather than case by case: feeCentavos/incrementsCharged are always non-negative
// integers, and outOfRange:true always pairs with feeCentavos:0.

import {
    DeliveryFeePolicyError,
    computeCalculatedDeliveryFeeCentavos,
    DELIVERY_FEE_CALC_VERSION
} from '../src/modules/deliveryPricing/domain/deliveryFeePolicy.js';
import fixtures from './fixtures/deliveryFeePolicyCases.json' with { type: 'json' };

// Phase 237 (#1329, epic #1321): the only new pure-domain surface this phase adds -- the algorithm
// version constant storeUseCases.js persists on every resolved order (fixed mode included), so
// historical rows stay interpretable without a backfill if a future phase changes the formula.
describe('DELIVERY_FEE_CALC_VERSION', () => {
    test('is the integer 1', () => {
        expect(DELIVERY_FEE_CALC_VERSION).toBe(1);
        expect(Number.isInteger(DELIVERY_FEE_CALC_VERSION)).toBe(true);
    });
});

describe('computeCalculatedDeliveryFeeCentavos — fixture cases', () => {
    for (const testCase of fixtures.cases) {
        test(`${testCase.id}: ${testCase.description}`, () => {
            if (testCase.throws) {
                expect(() => computeCalculatedDeliveryFeeCentavos(testCase.input)).toThrow(DeliveryFeePolicyError);
                try {
                    computeCalculatedDeliveryFeeCentavos(testCase.input);
                } catch (error) {
                    expect(error.code).toBe(testCase.throws.code);
                }
                return;
            }

            const result = computeCalculatedDeliveryFeeCentavos(testCase.input);
            expect(result).toEqual(testCase.expected);
        });
    }
});

describe('computeCalculatedDeliveryFeeCentavos — invariants over every fixture case', () => {
    const solvableCases = fixtures.cases.filter((testCase) => !testCase.throws);

    test.each(solvableCases.map((testCase) => [testCase.id, testCase]))(
        '%s: feeCentavos/incrementsCharged are non-negative integers, outOfRange pairs with a zero fee',
        (_id, testCase) => {
            const result = computeCalculatedDeliveryFeeCentavos(testCase.input);

            expect(Number.isInteger(result.feeCentavos)).toBe(true);
            expect(result.feeCentavos).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(result.incrementsCharged)).toBe(true);
            expect(result.incrementsCharged).toBeGreaterThanOrEqual(0);
            expect(typeof result.billedKm).toBe('number');

            if (result.outOfRange) {
                expect(result.feeCentavos).toBe(0);
                expect(result.billedKm).toBe(0);
                expect(result.incrementsCharged).toBe(0);
            }
        }
    );
});

describe('computeCalculatedDeliveryFeeCentavos — edge behavior not covered by fixtures', () => {
    const REFERENCE_CONFIG = fixtures.REFERENCE_CONFIG;

    test('a negative min_fee is refused', () => {
        expect(() => computeCalculatedDeliveryFeeCentavos({
            distanceMeters: 1000,
            config: { ...REFERENCE_CONFIG, min_fee: -1 }
        })).toThrow(DeliveryFeePolicyError);
    });

    test('a negative increment_km is refused, same as zero', () => {
        expect(() => computeCalculatedDeliveryFeeCentavos({
            distanceMeters: 1000,
            config: { ...REFERENCE_CONFIG, increment_km: -0.5 }
        })).toThrow(DeliveryFeePolicyError);
    });

    test('a negative max_distance_km is refused', () => {
        expect(() => computeCalculatedDeliveryFeeCentavos({
            distanceMeters: 1000,
            config: { ...REFERENCE_CONFIG, max_distance_km: -1 }
        })).toThrow(DeliveryFeePolicyError);
    });

    test('config as an array is refused, not treated as an object', () => {
        expect(() => computeCalculatedDeliveryFeeCentavos({
            distanceMeters: 1000,
            config: [1, 2, 3]
        })).toThrow(DeliveryFeePolicyError);
    });

    test('a fractional distanceMeters is rounded to the nearest whole meter', () => {
        const rounded = computeCalculatedDeliveryFeeCentavos({ distanceMeters: 3000.4, config: REFERENCE_CONFIG });
        const exact = computeCalculatedDeliveryFeeCentavos({ distanceMeters: 3000, config: REFERENCE_CONFIG });
        expect(rounded).toEqual(exact);
    });

    test('error instances carry a code and details', () => {
        try {
            computeCalculatedDeliveryFeeCentavos({ distanceMeters: 1000, config: null });
            throw new Error('expected computeCalculatedDeliveryFeeCentavos to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(DeliveryFeePolicyError);
            expect(error.code).toBe('INVALID_CONFIG');
            expect(error.details).toBeDefined();
        }
    });

    test('Phase 327 rejects increments below one meter before integer math', () => {
        for (const incrementKm of [0, 0.0001, 0.0009]) {
            try {
                computeCalculatedDeliveryFeeCentavos({
                    distanceMeters: 3001,
                    config: { ...REFERENCE_CONFIG, increment_km: incrementKm }
                });
                throw new Error('expected a sub-meter increment to be rejected');
            } catch (error) {
                expect(error).toBeInstanceOf(DeliveryFeePolicyError);
                expect(error.code).toBe('INVALID_CONFIG');
                expect(error.details.minimum_km).toBe(0.001);
            }
        }
    });

    test('Phase 327 accepts the one-meter boundary and keeps every result finite', () => {
        const result = computeCalculatedDeliveryFeeCentavos({
            distanceMeters: 3001,
            config: { ...REFERENCE_CONFIG, increment_km: 0.001 }
        });

        expect(result).toEqual({
            feeCentavos: 5001,
            billedKm: 3,
            incrementsCharged: 1,
            outOfRange: false
        });
        expect(Number.isFinite(result.feeCentavos)).toBe(true);
        expect(Number.isFinite(result.billedKm)).toBe(true);
        expect(Number.isFinite(result.incrementsCharged)).toBe(true);
    });

    test('Phase 327 rejects an overflowed calculated result instead of returning Infinity', () => {
        try {
            computeCalculatedDeliveryFeeCentavos({
                distanceMeters: 3001,
                // The per-km conversion itself is finite, but multiplying that value by the
                // configured increment overflows while computing the per-increment charge.
                config: { ...REFERENCE_CONFIG, per_km_rate: 1e304 }
            });
            throw new Error('expected an overflowed result to be rejected');
        } catch (error) {
            expect(error).toBeInstanceOf(DeliveryFeePolicyError);
            expect(error.code).toBe('NON_FINITE_RESULT');
        }
    });

    test('Phase 327 rejects configuration values that overflow during unit conversion', () => {
        try {
            computeCalculatedDeliveryFeeCentavos({
                distanceMeters: 1000,
                config: { ...REFERENCE_CONFIG, max_distance_km: Number.MAX_VALUE }
            });
            throw new Error('expected a non-finite converted config value to be rejected');
        } catch (error) {
            expect(error).toBeInstanceOf(DeliveryFeePolicyError);
            expect(error.code).toBe('INVALID_CONFIG');
        }
    });
});
