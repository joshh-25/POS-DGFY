import { describe, expect, it } from 'vitest';
import {
  buildSkuSuggestionIndex,
  buildSkuInitials,
  normalizeSkuCategory,
  suggestNextSku
} from '../utils/skuSuggestion.js';

describe('SKU suggestion utility', () => {
  it('normalizes unsupported categories to raw_material', () => {
    expect(normalizeSkuCategory('unknown')).toBe('raw_material');
    expect(normalizeSkuCategory('RAW_MATERIAL')).toBe('raw_material');
  });

  it('builds initials from significant words and caps at 4 chars', () => {
    expect(buildSkuInitials('Banana-Walnut Oatmeal Cookies 60g')).toBe('BWOC');
    expect(buildSkuInitials('The best of milk and honey')).toBe('BMH');
  });

  it('suggests the next raw material sequence with RM-#### format', () => {
    const sku = suggestNextSku({
      name: 'Refined Sugar',
      category: 'raw_material',
      existingItems: [
        { sku_code: 'RM-0001' },
        { sku_code: 'RM-0010' },
        { sku_code: 'INVALID-001' }
      ]
    });

    expect(sku).toBe('RM-0011');
  });

  it('suggests product SKU with initials and ### format', () => {
    const sku = suggestNextSku({
      name: 'Ginger Tea Mix',
      category: 'product',
      existingItems: [
        { sku_code: 'PRD-GTM-001' },
        { sku_code: 'PRD-GTM-003' },
        { sku_code: 'PRD-ABC-999' }
      ]
    });

    expect(sku).toBe('PRD-GTM-004');
  });

  it('suggests packaging and supplies SKUs with configured prefixes', () => {
    const packagingSku = suggestNextSku({
      name: 'BISCOCHITOS BUTTER&MILK LABEL',
      category: 'packaging',
      existingItems: [{ sku_code: 'PKG-BBML-001' }]
    });
    const suppliesSku = suggestNextSku({
      name: 'Latex Gloves',
      category: 'supplies',
      existingItems: [{ sku_code: 'SUP-LG-007' }]
    });

    expect(packagingSku).toBe('PKG-BBML-002');
    expect(suppliesSku).toBe('SUP-LG-008');
  });

  it('falls back to GEN initials when name has no letters', () => {
    const sku = suggestNextSku({
      name: '123 456',
      category: 'product',
      existingItems: []
    });

    expect(sku).toBe('PRD-GEN-001');
  });

  it('ignores the current item when computing the next sequence', () => {
    const sku = suggestNextSku({
      name: 'Milk Label',
      category: 'packaging',
      currentItemId: 7,
      existingItems: [
        { id: 7, sku_code: 'PKG-ML-003' },
        { id: 8, sku_code: 'PKG-ML-009' }
      ]
    });

    expect(sku).toBe('PKG-ML-010');
  });

  it('indexes a large seed once and reuses it without rescanning for each name change', () => {
    const seed = Array.from({ length: 10000 }, (_, index) => ({
      sku_code: `PRD-ITEM-${String(index + 1).padStart(3, '0')}`
    }));
    const skuIndex = buildSkuSuggestionIndex(seed);

    expect(suggestNextSku({ name: 'Item', category: 'product', skuIndex })).toBe('PRD-I-001');
    expect(suggestNextSku({ name: 'Item Test Extra', category: 'product', skuIndex })).toBe('PRD-ITE-001');
    expect(suggestNextSku({ name: 'Item', category: 'product', skuIndex })).toBe('PRD-I-001');
    expect(skuIndex.get('product:ITEM')).toBe(10000);
  });
});
