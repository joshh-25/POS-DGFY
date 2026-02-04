/**
 * UOM Conversion Verification Script
 * 
 * Tests the UOM conversion utility to ensure it works correctly.
 * 
 * Usage: node scripts/verify-uom-conversion.js
 */

import {
    normalizeUom,
    getUomGroup,
    areCompatible,
    getBaseUnit,
    convertQuantity,
    convertWithDetails,
    getAllUomOptions,
    getGroupedUomOptions,
    getUomLabel,
    isValidUom,
    UOM_GROUPS
} from '../src/utils/uomConverter.js';

const TESTS = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    TESTS.push({ name, fn });
}

function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected) {
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            }
        },
        toBeCloseTo(expected, decimals = 6) {
            const factor = Math.pow(10, decimals);
            if (Math.round(actual * factor) !== Math.round(expected * factor)) {
                throw new Error(`Expected ~${expected}, got ${actual}`);
            }
        },
        toBeNull() {
            if (actual !== null) {
                throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
            }
        },
        toBeTruthy() {
            if (!actual) {
                throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
            }
        },
        toBeFalsy() {
            if (actual) {
                throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
            }
        }
    };
}

// ============================================
// NORMALIZATION TESTS
// ============================================

test('normalizeUom: handles standard abbreviations', () => {
    expect(normalizeUom('kg')).toBe('kg');
    expect(normalizeUom('g')).toBe('g');
    expect(normalizeUom('mL')).toBe('mL');
    expect(normalizeUom('L')).toBe('L');
    expect(normalizeUom('pcs')).toBe('pcs');
});

test('normalizeUom: handles full names', () => {
    expect(normalizeUom('kilogram')).toBe('kg');
    expect(normalizeUom('Kilogram')).toBe('kg');
    expect(normalizeUom('kilograms')).toBe('kg');
    expect(normalizeUom('Grams')).toBe('g');
    expect(normalizeUom('Liter')).toBe('L');
    expect(normalizeUom('liters')).toBe('L');
});

test('normalizeUom: handles legacy/variant values', () => {
    expect(normalizeUom('lbs')).toBe('lb');
    expect(normalizeUom('ml')).toBe('mL');
    expect(normalizeUom('ML')).toBe('mL');
    expect(normalizeUom('pieces')).toBe('pcs');
    expect(normalizeUom('unit')).toBe('units');
});

test('normalizeUom: trims whitespace', () => {
    expect(normalizeUom('  kg  ')).toBe('kg');
    expect(normalizeUom(' gram ')).toBe('g');
});

test('normalizeUom: returns original for unknown values', () => {
    expect(normalizeUom('foo')).toBe('foo');
    expect(normalizeUom('bar')).toBe('bar');
});

// ============================================
// GROUP DETECTION TESTS
// ============================================

test('getUomGroup: correctly identifies groups', () => {
    expect(getUomGroup('kg')).toBe('weight');
    expect(getUomGroup('g')).toBe('weight');
    expect(getUomGroup('lb')).toBe('weight');
    expect(getUomGroup('mL')).toBe('volume');
    expect(getUomGroup('L')).toBe('volume');
    expect(getUomGroup('gal')).toBe('volume');
    expect(getUomGroup('pcs')).toBe('count');
    expect(getUomGroup('dozen')).toBe('count');
});

test('getUomGroup: handles aliases', () => {
    expect(getUomGroup('kilogram')).toBe('weight');
    expect(getUomGroup('liters')).toBe('volume');
    expect(getUomGroup('pieces')).toBe('count');
});

test('getUomGroup: returns null for unknown', () => {
    expect(getUomGroup('foo')).toBeNull();
    expect(getUomGroup(null)).toBeNull();
    expect(getUomGroup('')).toBeNull();
});

// ============================================
// COMPATIBILITY TESTS
// ============================================

test('areCompatible: returns true for same group', () => {
    expect(areCompatible('kg', 'g')).toBeTruthy();
    expect(areCompatible('mg', 'oz')).toBeTruthy();
    expect(areCompatible('mL', 'L')).toBeTruthy();
    expect(areCompatible('cup', 'gal')).toBeTruthy();
    expect(areCompatible('pcs', 'dozen')).toBeTruthy();
});

test('areCompatible: returns false for different groups', () => {
    expect(areCompatible('kg', 'L')).toBeFalsy();
    expect(areCompatible('g', 'mL')).toBeFalsy();
    expect(areCompatible('pcs', 'kg')).toBeFalsy();
});

test('areCompatible: returns false for unknown UOMs', () => {
    expect(areCompatible('foo', 'bar')).toBeFalsy();
    expect(areCompatible('kg', 'foo')).toBeFalsy();
});

// ============================================
// CONVERSION TESTS
// ============================================

test('convertQuantity: same UOM returns same value', () => {
    expect(convertQuantity(100, 'kg', 'kg')).toBe(100);
    expect(convertQuantity(50.5, 'L', 'L')).toBe(50.5);
});

test('convertQuantity: weight conversions', () => {
    // kg to g
    expect(convertQuantity(1, 'kg', 'g')).toBe(1000);
    expect(convertQuantity(2.5, 'kg', 'g')).toBe(2500);

    // g to kg
    expect(convertQuantity(1000, 'g', 'kg')).toBe(1);
    expect(convertQuantity(150000, 'g', 'kg')).toBe(150);

    // mg to g
    expect(convertQuantity(1000, 'mg', 'g')).toBe(1);

    // lb to kg (approximate)
    expect(convertQuantity(1, 'lb', 'kg')).toBeCloseTo(0.453592);

    // oz to g
    expect(convertQuantity(1, 'oz', 'g')).toBeCloseTo(28.3495);
});

test('convertQuantity: volume conversions', () => {
    // L to mL
    expect(convertQuantity(1, 'L', 'mL')).toBe(1000);
    expect(convertQuantity(2.5, 'L', 'mL')).toBe(2500);

    // mL to L
    expect(convertQuantity(1000, 'mL', 'L')).toBe(1);

    // gal to L (approximate)
    expect(convertQuantity(1, 'gal', 'L')).toBeCloseTo(3.78541);

    // cup to mL
    expect(convertQuantity(1, 'cup', 'mL')).toBeCloseTo(236.588);

    // tbsp to mL
    expect(convertQuantity(1, 'tbsp', 'mL')).toBeCloseTo(14.787);
});

test('convertQuantity: count conversions', () => {
    // pcs to units (1:1)
    expect(convertQuantity(100, 'pcs', 'units')).toBe(100);
    expect(convertQuantity(50, 'units', 'pcs')).toBe(50);

    // dozen to pcs (12:1)
    expect(convertQuantity(1, 'dozen', 'pcs')).toBe(12);
    expect(convertQuantity(2, 'dozen', 'pcs')).toBe(24);

    // pcs to dozen
    expect(convertQuantity(12, 'pcs', 'dozen')).toBe(1);
    expect(convertQuantity(24, 'pcs', 'dozen')).toBe(2);
});

test('convertQuantity: handles legacy aliases', () => {
    expect(convertQuantity(1000, 'grams', 'kg')).toBe(1);
    expect(convertQuantity(1, 'kilogram', 'grams')).toBe(1000);
    expect(convertQuantity(1, 'lbs', 'kg')).toBeCloseTo(0.453592);
});

test('convertQuantity: returns null for incompatible UOMs', () => {
    expect(convertQuantity(100, 'kg', 'L')).toBeNull();
    expect(convertQuantity(50, 'mL', 'pcs')).toBeNull();
    expect(convertQuantity(10, 'unknown', 'kg')).toBeNull();
});

// ============================================
// REAL-WORLD SCENARIO TESTS
// ============================================

test('Scenario: Recipe in g, Stock in kg', () => {
    // Product recipe: 150000 g of sugar per batch
    // Stock: 225 kg of sugar
    const recipeQty = 150000; // g
    const stockQty = 225; // kg

    // Convert recipe to stock UOM
    const converted = convertQuantity(recipeQty, 'g', 'kg');
    expect(converted).toBe(150); // 150 kg needed

    // 225 kg available, 150 kg needed = sufficient
    const sufficient = stockQty >= converted;
    expect(sufficient).toBeTruthy();
});

test('Scenario: Recipe in mL, Stock in L', () => {
    // Recipe: 500 mL of oil
    // Stock: 10 L
    const recipeQty = 500; // mL
    const stockQty = 10; // L

    const converted = convertQuantity(recipeQty, 'mL', 'L');
    expect(converted).toBe(0.5); // 0.5 L needed

    const sufficient = stockQty >= converted;
    expect(sufficient).toBeTruthy();
});

test('Scenario: Recipe in dozen, Stock in pcs', () => {
    // Recipe: 2 dozen eggs
    // Stock: 30 pcs
    const recipeQty = 2; // dozen
    const stockQty = 30; // pcs

    const converted = convertQuantity(recipeQty, 'dozen', 'pcs');
    expect(converted).toBe(24); // 24 pcs needed

    const sufficient = stockQty >= converted;
    expect(sufficient).toBeTruthy();
});

// ============================================
// UTILITY FUNCTION TESTS
// ============================================

test('getAllUomOptions: returns all 14 options', () => {
    const options = getAllUomOptions();
    expect(options.length).toBe(14);
});

test('getGroupedUomOptions: has 3 groups', () => {
    const grouped = getGroupedUomOptions();
    expect(Object.keys(grouped).length).toBe(3);
    expect('Weight' in grouped).toBeTruthy();
    expect('Volume' in grouped).toBeTruthy();
    expect('Count' in grouped).toBeTruthy();
});

test('getUomLabel: returns display labels', () => {
    expect(getUomLabel('kg')).toBe('Kilogram (kg)');
    expect(getUomLabel('mL')).toBe('Milliliter (mL)');
    expect(getUomLabel('pcs')).toBe('Pieces (pcs)');
});

test('isValidUom: correctly identifies valid UOMs', () => {
    expect(isValidUom('kg')).toBeTruthy();
    expect(isValidUom('kilogram')).toBeTruthy();
    expect(isValidUom('foo')).toBeFalsy();
});

// ============================================
// RUN TESTS
// ============================================

console.log('='.repeat(60));
console.log('UOM Conversion Verification');
console.log('='.repeat(60));
console.log('');

for (const { name, fn } of TESTS) {
    try {
        fn();
        passed++;
        console.log(`✓ ${name}`);
    } catch (error) {
        failed++;
        console.log(`✗ ${name}`);
        console.log(`  Error: ${error.message}`);
    }
}

console.log('');
console.log('='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
} else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
}
