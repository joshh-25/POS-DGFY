// Unit tests for backend/src/modules/shared/utils/affiliatePricingPolicy.js, the pure calculation
// service for Phase 1 of the affiliate pricing rule engine (see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md).
//
// Driven by backend/tests/fixtures/affiliatePricingCases.json - the same fixture file the frontend
// live-preview test consumes (Stage G), so "the preview matches the final calculation" (external
// pack Test 16) is an enforced invariant rather than a hope. Covers every acceptance case in the
// external pack's 04-acceptance-tests.md (cases 1-14; 15-16 are QR resolution / mobile preview
// parity, not pure calculation logic).

import {
    calculateAffiliateSale,
    validateAffiliatePriceRule,
    validateVolumeTiers,
    resolveVolumeTierBonusBps,
    AffiliatePricingError
} from '../src/modules/shared/utils/affiliatePricingPolicy.js';
import fixtures from './fixtures/affiliatePricingCases.json' with { type: 'json' };

describe('calculateAffiliateSale — acceptance cases', () => {
    for (const testCase of fixtures.calculationCases) {
        test(`${testCase.id}: ${testCase.description}`, () => {
            if (testCase.expectedError) {
                expect(() => calculateAffiliateSale(testCase.input)).toThrow(AffiliatePricingError);
                try {
                    calculateAffiliateSale(testCase.input);
                } catch (error) {
                    expect(error.code).toBe(testCase.expectedError);
                }
                return;
            }

            const result = calculateAffiliateSale(testCase.input);
            for (const [key, expectedValue] of Object.entries(testCase.expected)) {
                expect(result[key]).toBe(expectedValue);
            }
        });
    }
});

describe('validateAffiliatePriceRule — acceptance cases', () => {
    for (const testCase of fixtures.priceRuleValidationCases) {
        test(`${testCase.id}: ${testCase.description}`, () => {
            const result = validateAffiliatePriceRule(testCase.input);
            expect(result.valid).toBe(testCase.expected.valid);
            expect(result.error_code).toBe(testCase.expected.error_code);
        });
    }

    test('a valid rule with no base price supplied passes without attempting a floor check', () => {
        expect(validateAffiliatePriceRule({ rule: { type: 'PERCENTAGE_MARKUP', rateBps: 1000 } }))
            .toEqual({ valid: true, error_code: null });
    });

    test('rejects an unrecognized rule type', () => {
        expect(validateAffiliatePriceRule({ rule: { type: 'NOT_A_REAL_TYPE' } }))
            .toEqual({ valid: false, error_code: 'UNKNOWN_SELLING_PRICE_RULE_TYPE' });
    });
});

describe('validateVolumeTiers — acceptance cases', () => {
    for (const testCase of fixtures.volumeTierValidationCases) {
        test(`${testCase.id}: ${testCase.description}`, () => {
            const result = validateVolumeTiers(testCase.input.volumeTiers);
            expect(result.valid).toBe(testCase.expected.valid);
            expect(result.error_code).toBe(testCase.expected.error_code);
        });
    }

    test('accepts a set of tiers with distinct thresholds', () => {
        expect(validateVolumeTiers([
            { minimumVolumeCentavos: 5000000, bonusPercentagePoints: 1 },
            { minimumVolumeCentavos: 10000000, bonusPercentagePoints: 2 }
        ])).toEqual({ valid: true, error_code: null });
    });

    test('accepts an empty tier list', () => {
        expect(validateVolumeTiers([])).toEqual({ valid: true, error_code: null });
    });
});

describe('resolveVolumeTierBonusBps — direct unit behavior beyond the acceptance cases', () => {
    test('returns 0 when no tiers are configured', () => {
        expect(resolveVolumeTierBonusBps({ currentQualifiedVolumeCentavos: 10000000, volumeTiers: [] })).toBe(0);
    });

    test('tier order in the input array does not affect which tier wins', () => {
        const volumeTiers = [
            { minimumVolumeCentavos: 10000000, bonusPercentagePoints: 2 },
            { minimumVolumeCentavos: 5000000, bonusPercentagePoints: 1 }
        ];
        expect(resolveVolumeTierBonusBps({ currentQualifiedVolumeCentavos: 10000000, volumeTiers })).toBe(200);
        expect(resolveVolumeTierBonusBps({ currentQualifiedVolumeCentavos: 7000000, volumeTiers })).toBe(100);
        expect(resolveVolumeTierBonusBps({ currentQualifiedVolumeCentavos: 1000000, volumeTiers })).toBe(0);
    });
});

describe('calculateAffiliateSale — behavior beyond the acceptance cases', () => {
    test('defaults to BASE_PRICE / NONE when no rules are supplied at all', () => {
        const result = calculateAffiliateSale({ basePriceCentavos: 10000 });
        expect(result.buyerUnitPriceCentavos).toBe(10000);
        expect(result.priceAdjustmentCentavos).toBe(0);
        expect(result.totalAffiliateEarningsCentavos).toBe(0);
        expect(result.merchantNetCentavos).toBe(10000);
        expect(result.settlementPolicy).toBe('MERCHANT_FUNDED');
    });

    test('scales correctly across a multi-unit quantity', () => {
        const result = calculateAffiliateSale({
            basePriceCentavos: 10000,
            quantity: 3,
            sellingPriceRule: { type: 'PERCENTAGE_DISCOUNT', rateBps: 1000 },
            commissionRule: { type: 'PERCENTAGE_OF_BASE', rateBps: 500 },
            settlementPolicy: 'MERCHANT_FUNDED'
        });
        expect(result.baseSubtotalCentavos).toBe(30000);
        expect(result.buyerTotalCentavos).toBe(27000);
        expect(result.baseCommissionAmountCentavos).toBe(1500);
        expect(result.merchantNetCentavos).toBe(25500);
    });

    test('rejects an unknown selling price rule type', () => {
        expect(() => calculateAffiliateSale({
            basePriceCentavos: 10000,
            sellingPriceRule: { type: 'NOT_A_REAL_TYPE' }
        })).toThrow(AffiliatePricingError);
    });

    test('rejects an unknown commission rule type', () => {
        expect(() => calculateAffiliateSale({
            basePriceCentavos: 10000,
            commissionRule: { type: 'NOT_A_REAL_TYPE' }
        })).toThrow(AffiliatePricingError);
    });

    test('rejects an unknown settlement policy when one is explicitly supplied', () => {
        expect(() => calculateAffiliateSale({
            basePriceCentavos: 10000,
            settlementPolicy: 'CUSTOM_OR_UNRESOLVED'
        })).toThrow(AffiliatePricingError);
    });

    test('RESELLER_MARGIN never requires an explicit settlement policy, even with a price adjustment active', () => {
        const result = calculateAffiliateSale({
            basePriceCentavos: 10000,
            sellingPriceRule: { type: 'EXACT_AFFILIATE_PRICE', amountCentavos: 12000 },
            commissionRule: { type: 'RESELLER_MARGIN' }
        });
        expect(result.settlementPolicy).toBe('RESELLER_MARGIN');
        expect(result.totalAffiliateEarningsCentavos).toBe(2000);
    });

    test('the explanation string is human-readable and mentions the resolved settlement policy', () => {
        const result = calculateAffiliateSale({ basePriceCentavos: 10000 });
        expect(typeof result.explanation).toBe('string');
        expect(result.explanation).toContain('MERCHANT_FUNDED');
    });
});
