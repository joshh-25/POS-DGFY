// Unit tests for the `benefit_target` axis (#1326 / epic #1321 decision 9) added to
// src/modules/vouchers/domain/voucherBenefitPolicy.js.
//
// Deliberately a SEPARATE file from voucherBenefitPolicy.unit.test.js / voucherBenefitCases.json,
// not additional cases in that fixture file: voucherBenefitPolicy.unit.test.js:88-108 asserts, over
// EVERY entry in fixtures.calculationCases, `result.discountCentavos <= result.eligibleSubtotalCentavos`
// -- an invariant a delivery-targeted case violates by design (a delivery discount clamps to the
// delivery fee, not the item subtotal). Adding a delivery case there would fail that existing,
// unmodifiable test. This file carries its own delivery-shaped invariants instead (see the bottom
// describe block).
//
// Base fixture used throughout unless a case states otherwise: one eligible line, item subtotal
// 10000 centavos (PHP100), delivery fee 15000 centavos (PHP150).

import {
    VOUCHER_BENEFIT_TARGETS,
    VoucherBenefitError,
    calculateVoucherBenefit
} from '../src/modules/vouchers/domain/voucherBenefitPolicy.js';

const baseLines = [
    { item_id: 1, quantity: 2, baseUnitPriceCentavos: 5000, eligible: true }
];

describe('VOUCHER_BENEFIT_TARGETS', () => {
    test('T15: exposes exactly the two benefit targets #1326 defines', () => {
        expect(VOUCHER_BENEFIT_TARGETS).toEqual(['items', 'delivery']);
    });
});

describe('calculateVoucherBenefit — benefit_target: delivery', () => {
    test('T1: percent_off clamps against the delivery fee, not the item subtotal', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'percent_off',
            benefitTarget: 'delivery',
            percentOffBps: 5000,
            deliveryFeeCentavos: 15000,
            lines: baseLines
        });
        expect(result.rawDiscountCentavos).toBe(7500);
        expect(result.discountCentavos).toBe(7500);
        expect(result.capApplied).toBe(false);
        expect(result.eligibleSubtotalCentavos).toBe(10000);
        expect(result.eligibleQuantity).toBe(2);
        expect(result.lineAllocations[0].discountCentavos).toBe(0);
        expect(result.lineAllocations[0].voucherUnitPriceCentavos).toBe(5000);
        expect(result.belowCostLines).toEqual([]);
    });

    test('T2: a full percent_off waiver clamps to the whole delivery fee', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'percent_off',
            benefitTarget: 'delivery',
            percentOffBps: 10000,
            deliveryFeeCentavos: 15000,
            lines: baseLines
        });
        expect(result.rawDiscountCentavos).toBe(15000);
        expect(result.discountCentavos).toBe(15000);
        expect(result.capApplied).toBe(false);
        result.lineAllocations.forEach((line) => expect(line.discountCentavos).toBe(0));
    });

    test('T3: amount_off clamps to the delivery fee, discriminating from the (larger) item subtotal', () => {
        // Today's (pre-#1326) code would clamp this to the PHP100 item subtotal (10000), not the fee.
        const result = calculateVoucherBenefit({
            benefitClass: 'amount_off',
            benefitTarget: 'delivery',
            amountOffCentavos: 20000,
            deliveryFeeCentavos: 15000,
            lines: baseLines
        });
        expect(result.rawDiscountCentavos).toBe(15000);
        expect(result.discountCentavos).toBe(15000);
    });

    test('T4: maxDiscountCentavos still caps a delivery-targeted benefit; line allocations stay all zero', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'percent_off',
            benefitTarget: 'delivery',
            percentOffBps: 10000,
            deliveryFeeCentavos: 15000,
            maxDiscountCentavos: 5000,
            lines: baseLines
        });
        expect(result.rawDiscountCentavos).toBe(15000);
        expect(result.discountCentavos).toBe(5000);
        expect(result.capApplied).toBe(true);
        result.lineAllocations.forEach((line) => expect(line.discountCentavos).toBe(0));
    });

    test('T5: deliveryFeeCentavos: 0 (a free-delivery tenant) is a legal, distinct-from-null base', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'percent_off',
            benefitTarget: 'delivery',
            percentOffBps: 5000,
            deliveryFeeCentavos: 0,
            lines: baseLines
        });
        expect(result.rawDiscountCentavos).toBe(0);
        expect(result.discountCentavos).toBe(0);
        expect(result.capApplied).toBe(false);
        result.lineAllocations.forEach((line) => expect(line.discountCentavos).toBe(0));
    });

    test('T6: empty lines still resolve a delivery discount -- strongest proof the item subtotal is not the base', () => {
        // Today's (pre-#1326) clamp against eligibleSubtotalCentavos (0 here) would return 0.
        const result = calculateVoucherBenefit({
            benefitClass: 'percent_off',
            benefitTarget: 'delivery',
            percentOffBps: 5000,
            deliveryFeeCentavos: 15000,
            lines: []
        });
        expect(result.discountCentavos).toBe(7500);
        expect(result.eligibleSubtotalCentavos).toBe(0);
        expect(result.eligibleQuantity).toBe(0);
        expect(result.lineAllocations).toEqual([]);
    });

    test('T7: an ineligible line is carried through untouched, both lines stay at zero discount', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'amount_off',
            benefitTarget: 'delivery',
            amountOffCentavos: 5000,
            deliveryFeeCentavos: 15000,
            lines: [
                ...baseLines,
                { item_id: 2, quantity: 1, baseUnitPriceCentavos: 9000, eligible: false }
            ]
        });
        expect(result.discountCentavos).toBe(5000);
        expect(result.lineAllocations).toHaveLength(2);
        expect(result.lineAllocations[0].discountCentavos).toBe(0);
        expect(result.lineAllocations[1].discountCentavos).toBe(0);
        expect(result.lineAllocations[0].voucherUnitPriceCentavos).toBe(5000);
        expect(result.lineAllocations[1].voucherUnitPriceCentavos).toBe(9000);
    });

    test('T8: a delivery waiver never trips the below-cost guard', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'percent_off',
            benefitTarget: 'delivery',
            percentOffBps: 10000,
            deliveryFeeCentavos: 15000,
            lines: [
                { item_id: 1, quantity: 2, baseUnitPriceCentavos: 5000, costPerUnitCentavos: 4900, eligible: true }
            ]
        });
        expect(result.belowCostLines).toEqual([]);
    });

    test('T11: benefitTarget: delivery + fixed_price throws BENEFIT_TARGET_CLASS_UNSUPPORTED', () => {
        expect(() => calculateVoucherBenefit({
            benefitClass: 'fixed_price',
            benefitTarget: 'delivery',
            fixedUnitPriceCentavos: 800,
            deliveryFeeCentavos: 15000,
            lines: baseLines
        })).toThrow(VoucherBenefitError);

        try {
            calculateVoucherBenefit({
                benefitClass: 'fixed_price',
                benefitTarget: 'delivery',
                fixedUnitPriceCentavos: 800,
                deliveryFeeCentavos: 15000,
                lines: baseLines
            });
        } catch (error) {
            expect(error.code).toBe('BENEFIT_TARGET_CLASS_UNSUPPORTED');
        }
    });

    test('T12: an unknown benefit target throws UNKNOWN_BENEFIT_TARGET', () => {
        expect(() => calculateVoucherBenefit({
            benefitClass: 'percent_off',
            benefitTarget: 'shipping',
            percentOffBps: 5000,
            lines: baseLines
        })).toThrow(VoucherBenefitError);

        try {
            calculateVoucherBenefit({
                benefitClass: 'percent_off',
                benefitTarget: 'shipping',
                percentOffBps: 5000,
                lines: baseLines
            });
        } catch (error) {
            expect(error.code).toBe('UNKNOWN_BENEFIT_TARGET');
        }
    });

    test('T13: a delivery target with no delivery fee base fails closed (ADR 0066 Decision 3)', () => {
        expect(() => calculateVoucherBenefit({
            benefitClass: 'percent_off',
            benefitTarget: 'delivery',
            percentOffBps: 5000,
            lines: baseLines
        })).toThrow(VoucherBenefitError);

        try {
            calculateVoucherBenefit({
                benefitClass: 'percent_off',
                benefitTarget: 'delivery',
                percentOffBps: 5000,
                lines: baseLines
            });
        } catch (error) {
            expect(error.code).toBe('INVALID_DELIVERY_FEE_CENTAVOS');
        }
    });
});

describe('calculateVoucherBenefit — benefit_target: items (the default)', () => {
    test('T9: a supplied delivery fee is unreachable from the items path -- clamps to the item subtotal', () => {
        const result = calculateVoucherBenefit({
            benefitClass: 'amount_off',
            benefitTarget: 'items',
            amountOffCentavos: 20000,
            deliveryFeeCentavos: 15000,
            lines: baseLines
        });
        expect(result.discountCentavos).toBe(10000);
        expect(result.lineAllocations[0].discountCentavos).toBe(10000);
    });

    test('T10: omitting benefitTarget entirely is identical to explicit "items" -- proves the JS-level default', () => {
        const explicit = calculateVoucherBenefit({
            benefitClass: 'amount_off',
            benefitTarget: 'items',
            amountOffCentavos: 20000,
            deliveryFeeCentavos: 15000,
            lines: baseLines
        });
        const omitted = calculateVoucherBenefit({
            benefitClass: 'amount_off',
            amountOffCentavos: 20000,
            deliveryFeeCentavos: 15000,
            lines: baseLines
        });
        expect(omitted).toEqual(explicit);
    });
});

describe('calculateVoucherBenefit — delivery-target invariants (T14)', () => {
    const solvableDeliveryCases = [
        () => calculateVoucherBenefit({
            benefitClass: 'percent_off', benefitTarget: 'delivery', percentOffBps: 5000,
            deliveryFeeCentavos: 15000, lines: baseLines
        }),
        () => calculateVoucherBenefit({
            benefitClass: 'percent_off', benefitTarget: 'delivery', percentOffBps: 10000,
            deliveryFeeCentavos: 15000, lines: baseLines
        }),
        () => calculateVoucherBenefit({
            benefitClass: 'amount_off', benefitTarget: 'delivery', amountOffCentavos: 20000,
            deliveryFeeCentavos: 15000, lines: baseLines
        }),
        () => calculateVoucherBenefit({
            benefitClass: 'percent_off', benefitTarget: 'delivery', percentOffBps: 10000,
            deliveryFeeCentavos: 15000, maxDiscountCentavos: 5000, lines: baseLines
        }),
        () => calculateVoucherBenefit({
            benefitClass: 'percent_off', benefitTarget: 'delivery', percentOffBps: 5000,
            deliveryFeeCentavos: 0, lines: baseLines
        }),
        () => calculateVoucherBenefit({
            benefitClass: 'percent_off', benefitTarget: 'delivery', percentOffBps: 5000,
            deliveryFeeCentavos: 15000, lines: []
        }),
        () => calculateVoucherBenefit({
            benefitClass: 'amount_off', benefitTarget: 'delivery', amountOffCentavos: 5000,
            deliveryFeeCentavos: 15000,
            lines: [...baseLines, { item_id: 2, quantity: 1, baseUnitPriceCentavos: 9000, eligible: false }]
        }),
        () => calculateVoucherBenefit({
            benefitClass: 'percent_off', benefitTarget: 'delivery', percentOffBps: 10000,
            deliveryFeeCentavos: 15000,
            lines: [{ item_id: 1, quantity: 2, baseUnitPriceCentavos: 5000, costPerUnitCentavos: 4900, eligible: true }]
        }),
        () => calculateVoucherBenefit({
            benefitClass: 'amount_off', benefitTarget: 'items', amountOffCentavos: 20000,
            deliveryFeeCentavos: 15000, lines: baseLines
        })
    ];

    test.each(solvableDeliveryCases.map((build, index) => [index, build]))(
        'case %s: 0 <= discountCentavos <= base, integer money, delivery target has no per-line component',
        (_index, build) => {
            const result = build();
            expect(result.discountCentavos).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(result.discountCentavos)).toBe(true);
            if (result.benefitTarget === 'delivery') {
                expect(result.discountCentavos).toBeLessThanOrEqual(result.benefitBaseCentavos);
                result.lineAllocations.forEach((line) => {
                    expect(line.discountCentavos).toBe(0);
                    expect(line.voucherUnitPriceCentavos).toBe(line.baseUnitPriceCentavos);
                });
                expect(result.belowCostLines).toEqual([]);
            }
        }
    );
});
