// Tests for the frontend live-preview mirror of the backend's affiliate pricing calculation
// service (see frontend/src/features/pos/utils/affiliatePricingPreview.js and
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md).
//
// Two things are verified here:
// 1. A byte-identical fixture check against the backend's original fixture file. This is what
//    actually proves "the mobile preview matches the final calculation" (external spec pack
//    Test 16) - if someone edits one copy and forgets the other, this test fails immediately
//    rather than the two silently drifting apart.
// 2. The same acceptance cases the backend suite runs (minus the three volume-tier cases - this
//    preview intentionally has no tier support, since Phase 1 doesn't expose tier configuration in
//    AffiliatesWorkspacePanel.jsx).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import {
    calculateAffiliateSale,
    validateAffiliatePriceRule,
    AffiliatePricingError
} from '../utils/affiliatePricingPreview.js';
import fixtures from './fixtures/affiliatePricingCases.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Volume-tier cases (test-9/10/11) are skipped: this preview intentionally does not model tiers.
const NO_TIER_CALCULATION_CASES = fixtures.calculationCases.filter((testCase) => (
    !testCase.id.startsWith('test-9') && !testCase.id.startsWith('test-10') && !testCase.id.startsWith('test-11')
));

describe('fixture parity — the frontend copy must never drift from the backend original', () => {
    test('affiliatePricingCases.json is byte-identical to apps/dgfy-api/tests/fixtures/affiliatePricingCases.json', () => {
        const backendFixturePath = path.resolve(
            __dirname,
            '../../../../../../apps/dgfy-api/tests/fixtures/affiliatePricingCases.json'
        );
        const backendFixtureRaw = readFileSync(backendFixturePath, 'utf8');
        const frontendFixtureRaw = readFileSync(path.join(__dirname, 'fixtures/affiliatePricingCases.json'), 'utf8');
        expect(frontendFixtureRaw).toBe(backendFixtureRaw);
    });
});

describe('calculateAffiliateSale — acceptance cases (no volume tiers)', () => {
    for (const testCase of NO_TIER_CALCULATION_CASES) {
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
                if (key === 'tierBonusRateBps' || key === 'tierBonusAmountCentavos' || key === 'totalCommissionRateBps') {
                    continue; // not modeled in the preview
                }
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
});
