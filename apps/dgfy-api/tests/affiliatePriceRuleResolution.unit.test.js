// Unit tests for the pure rule-resolution ordering in
// backend/src/modules/dgfy/utils/affiliatePriceRuleResolution.js. No database - fixture rows only,
// per the Phase 1 plan's Stage D verification requirement.

import {
    resolvePriceRuleFromCandidates,
    hasDuplicatePriceRuleScope
} from '../src/modules/dgfy/utils/affiliatePriceRuleResolution.js';

const templateRule = { price_rule_id: 1, enrollment_id: 0, item_id: 0, rule_type: 'BASE_PRICE' };
const enrollmentRule = { price_rule_id: 2, enrollment_id: 42, item_id: 0, rule_type: 'PERCENTAGE_DISCOUNT' };
const productTemplateRule = { price_rule_id: 3, enrollment_id: 0, item_id: 99, rule_type: 'FIXED_MARKUP' };
const productEnrollmentRule = { price_rule_id: 4, enrollment_id: 42, item_id: 99, rule_type: 'EXACT_AFFILIATE_PRICE' };

describe('resolvePriceRuleFromCandidates — Phase 1 levels (enrollment vs tenant template)', () => {
    test('returns null when there are no candidate rows at all', () => {
        expect(resolvePriceRuleFromCandidates({ candidateRows: [], enrollmentId: 42 })).toBeNull();
    });

    test('falls back to the tenant template when only a template row exists', () => {
        const result = resolvePriceRuleFromCandidates({ candidateRows: [templateRule], enrollmentId: 42 });
        expect(result).toEqual(templateRule);
    });

    test('an enrollment-specific rule outranks the tenant template for that enrollment', () => {
        const result = resolvePriceRuleFromCandidates({
            candidateRows: [templateRule, enrollmentRule],
            enrollmentId: 42
        });
        expect(result).toEqual(enrollmentRule);
    });

    test('a different enrollment never matches another affiliate\'s enrollment-specific rule, falls back to template', () => {
        const result = resolvePriceRuleFromCandidates({
            candidateRows: [templateRule, enrollmentRule],
            enrollmentId: 999
        });
        expect(result).toEqual(templateRule);
    });

    test('order of candidate rows in the input array does not affect which one wins', () => {
        const result = resolvePriceRuleFromCandidates({
            candidateRows: [enrollmentRule, templateRule],
            enrollmentId: 42
        });
        expect(result).toEqual(enrollmentRule);
    });
});

describe('resolvePriceRuleFromCandidates — Phase 2 levels (per-product), schema-ready but dormant in Phase 1', () => {
    test('a per-product tenant template outranks a per-enrollment, all-products rule for the same item', () => {
        // This is the priority list's subtle rule: item specificity beats enrollment specificity.
        const result = resolvePriceRuleFromCandidates({
            candidateRows: [enrollmentRule, productTemplateRule],
            enrollmentId: 42,
            itemId: 99
        });
        expect(result).toEqual(productTemplateRule);
    });

    test('a per-product, per-enrollment rule outranks everything else when both match', () => {
        const result = resolvePriceRuleFromCandidates({
            candidateRows: [templateRule, enrollmentRule, productTemplateRule, productEnrollmentRule],
            enrollmentId: 42,
            itemId: 99
        });
        expect(result).toEqual(productEnrollmentRule);
    });

    test('a per-product rule for a different item never matches, falls back correctly', () => {
        const result = resolvePriceRuleFromCandidates({
            candidateRows: [templateRule, productTemplateRule],
            enrollmentId: 42,
            itemId: 123
        });
        expect(result).toEqual(templateRule);
    });

    test('omitting itemId behaves as item_id = 0 (Phase 1 default), never matches a product-scoped rule', () => {
        const result = resolvePriceRuleFromCandidates({
            candidateRows: [templateRule, productTemplateRule],
            enrollmentId: 42
        });
        expect(result).toEqual(templateRule);
    });
});

describe('hasDuplicatePriceRuleScope', () => {
    const existing = [templateRule, enrollmentRule];

    test('detects a conflicting write at the same (enrollment_id, item_id) scope', () => {
        expect(hasDuplicatePriceRuleScope(existing, { enrollmentId: 42, itemId: 0 })).toBe(true);
        expect(hasDuplicatePriceRuleScope(existing, { enrollmentId: 0, itemId: 0 })).toBe(true);
    });

    test('a new scope that does not collide with any existing row is not a duplicate', () => {
        expect(hasDuplicatePriceRuleScope(existing, { enrollmentId: 7, itemId: 0 })).toBe(false);
    });

    test('excludePriceRuleId lets an update check against itself without false-flagging', () => {
        expect(hasDuplicatePriceRuleScope(existing, { enrollmentId: 42, itemId: 0, excludePriceRuleId: 2 })).toBe(false);
        expect(hasDuplicatePriceRuleScope(existing, { enrollmentId: 42, itemId: 0, excludePriceRuleId: 999 })).toBe(true);
    });
});
