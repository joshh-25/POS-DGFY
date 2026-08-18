// Unit tests for src/modules/vouchers/domain/voucherBenefitPolicy.js -- the pure benefit math for
// Phase 103 of the voucher initiative (#455 / #614), governed by ADR 0066.
//
// Fixture-driven, mirroring affiliatePricingPolicy.unit.test.js, plus two properties asserted on
// EVERY calculation case rather than case by case:
//   1. the per-line allocations sum exactly to the authoritative discount (no lost centavo), and
//   2. `0 <= discountCentavos <= eligibleSubtotalCentavos` (never negative, never more than the
//      eligible basket).

import {
    VOUCHER_BENEFIT_CLASSES,
    VoucherBenefitError,
    allocateByLargestRemainder,
    calculateVoucherBenefit
} from '../src/modules/vouchers/domain/voucherBenefitPolicy.js';
import fixtures from './fixtures/voucherBenefitCases.json' with { type: 'json' };

describe('allocateByLargestRemainder — fixture cases', () => {
    for (const testCase of fixtures.allocationCases) {
        test(`${testCase.id}: ${testCase.description}`, () => {
            const result = allocateByLargestRemainder(testCase.input);
            expect(result).toEqual(testCase.expected);
        });
    }
});

describe('allocateByLargestRemainder — invariants', () => {
    test('always sums to the requested total when at least one weight is positive', () => {
        const totals = [0, 1, 7, 99, 100, 1234, 999983];
        const weightSets = [[1], [1, 1], [1, 1, 1], [3, 5, 7, 11], [1000, 1, 1], [0, 0, 5]];
        for (const totalCentavos of totals) {
            for (const weights of weightSets) {
                const result = allocateByLargestRemainder({ totalCentavos, weights });
                expect(result.reduce((sum, value) => sum + value, 0)).toBe(totalCentavos);
                expect(result.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
            }
        }
    });

    test('is deterministic across repeated calls with the same input', () => {
        const input = { totalCentavos: 1001, weights: [7, 7, 7, 1] };
        const first = allocateByLargestRemainder(input);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            expect(allocateByLargestRemainder(input)).toEqual(first);
        }
    });

    test('returns an all-zero array of the same length when every weight is zero', () => {
        expect(allocateByLargestRemainder({ totalCentavos: 500, weights: [0, 0, 0] })).toEqual([0, 0, 0]);
    });

    test('tolerates a missing weights array', () => {
        expect(allocateByLargestRemainder({ totalCentavos: 500 })).toEqual([]);
        expect(allocateByLargestRemainder()).toEqual([]);
    });
});

describe('calculateVoucherBenefit — fixture cases', () => {
    for (const testCase of fixtures.calculationCases) {
        test(`${testCase.id}: ${testCase.description}`, () => {
            if (testCase.expectedError) {
                expect(() => calculateVoucherBenefit(testCase.input)).toThrow(VoucherBenefitError);
                try {
                    calculateVoucherBenefit(testCase.input);
                } catch (error) {
                    expect(error.code).toBe(testCase.expectedError);
                }
                return;
            }

            const result = calculateVoucherBenefit(testCase.input);
            const { lineDiscounts, voucherUnitPrices, ...scalars } = testCase.expected;

            for (const [key, expectedValue] of Object.entries(scalars)) {
                expect(result[key]).toBe(expectedValue);
            }
            expect(result.lineAllocations.map((line) => line.discountCentavos)).toEqual(lineDiscounts);
            expect(result.lineAllocations.map((line) => line.voucherUnitPriceCentavos)).toEqual(voucherUnitPrices);
        });
    }
});

describe('calculateVoucherBenefit — invariants over every fixture case', () => {
    const solvableCases = fixtures.calculationCases.filter((testCase) => !testCase.expectedError);

    test.each(solvableCases.map((testCase) => [testCase.id, testCase]))(
        '%s: allocations sum to the authoritative discount and stay within the eligible subtotal',
        (_id, testCase) => {
            const result = calculateVoucherBenefit(testCase.input);
            const allocated = result.lineAllocations.reduce((sum, line) => sum + line.discountCentavos, 0);

            expect(allocated).toBe(result.discountCentavos);
            expect(result.discountCentavos).toBeGreaterThanOrEqual(0);
            expect(result.discountCentavos).toBeLessThanOrEqual(result.eligibleSubtotalCentavos);
            expect(Number.isInteger(result.discountCentavos)).toBe(true);
            result.lineAllocations.forEach((line) => {
                expect(Number.isInteger(line.discountCentavos)).toBe(true);
                expect(line.discountCentavos).toBeGreaterThanOrEqual(0);
                expect(Number.isInteger(line.voucherUnitPriceCentavos)).toBe(true);
                expect(line.voucherUnitPriceCentavos).toBeGreaterThanOrEqual(0);
            });
        }
    );
});

describe('calculateVoucherBenefit — edge behavior not covered by fixtures', () => {
    test('exposes exactly the three benefit classes ADR 0066 defines', () => {
        expect(VOUCHER_BENEFIT_CLASSES).toEqual(['percent_off', 'amount_off', 'fixed_price']);
    });

    test('an ineligible line never receives an allocation even when the cap forces a re-spread', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'fixed_price',
            fixedUnitPriceCentavos: 0,
            maxDiscountCentavos: 500,
            lines: [
                { item_id: 1, quantity: 1, baseUnitPriceCentavos: 1000, eligible: true },
                { item_id: 2, quantity: 1, baseUnitPriceCentavos: 9000, eligible: false }
            ]
        });
        expect(result.lineAllocations[1].discountCentavos).toBe(0);
        expect(result.lineAllocations[0].discountCentavos).toBe(500);
        expect(result.capApplied).toBe(true);
    });

    test('an empty basket resolves to a zero benefit rather than throwing', () => {
        const result = calculateVoucherBenefit({ benefitClass: 'percent_off', percentOffBps: 1000, lines: [] });
        expect(result.discountCentavos).toBe(0);
        expect(result.eligibleSubtotalCentavos).toBe(0);
        expect(result.lineAllocations).toEqual([]);
    });

    test('a percentage above 100% is refused rather than producing a discount above the subtotal', () => {
        expect(() => calculateVoucherBenefit({
            benefitClass: 'percent_off',
            percentOffBps: 10001,
            lines: [{ item_id: 1, quantity: 1, baseUnitPriceCentavos: 1000, eligible: true }]
        })).toThrow(VoucherBenefitError);
    });

    test('a negative pinned price is refused', () => {
        expect(() => calculateVoucherBenefit({
            benefitClass: 'fixed_price',
            fixedUnitPriceCentavos: -1,
            lines: [{ item_id: 1, quantity: 1, baseUnitPriceCentavos: 1000, eligible: true }]
        })).toThrow(VoucherBenefitError);
    });

    test('a fixed price of zero is allowed (a giveaway), unlike a negative one', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'fixed_price',
            fixedUnitPriceCentavos: 0,
            lines: [{ item_id: 1, quantity: 2, baseUnitPriceCentavos: 1000, eligible: true }]
        });
        expect(result.discountCentavos).toBe(2000);
        expect(result.lineAllocations[0].voucherUnitPriceCentavos).toBe(0);
    });

    test('lines default to eligible when the flag is omitted', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'percent_off',
            percentOffBps: 5000,
            lines: [{ item_id: 1, quantity: 1, baseUnitPriceCentavos: 1000 }]
        });
        expect(result.eligibleSubtotalCentavos).toBe(1000);
        expect(result.discountCentavos).toBe(500);
    });
});
