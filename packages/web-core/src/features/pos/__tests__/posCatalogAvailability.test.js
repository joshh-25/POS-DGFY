import { describe, expect, it } from 'vitest';
import {
  getCatalogStockColorClassName,
  isSellAvailableCatalogItem
} from '../utils/posCatalogAvailability.js';

describe('POS catalog availability', () => {
  it('hides zero-stock physical items but keeps services and Always Available items sellable', () => {
    expect(isSellAvailableCatalogItem({ category: 'product', current_stock: 0 })).toBe(false);
    expect(isSellAvailableCatalogItem({ category: 'service', current_stock: 0 })).toBe(true);
    expect(isSellAvailableCatalogItem({ mode_item_preset: 'service', current_stock: 0 })).toBe(true);
    expect(isSellAvailableCatalogItem({ category: 'product', current_stock: 0, pos_always_available: true })).toBe(true);
  });

  it('uses the configured threshold for available physical item stock colors', () => {
    expect(getCatalogStockColorClassName({ category: 'product', current_stock: 3 }, 5)).toBe('text-amber-700');
    expect(getCatalogStockColorClassName({ category: 'product', current_stock: 6 }, 5)).toBe('text-emerald-700');
  });

  it('does not apply a stock color to unavailable, service, or Always Available items', () => {
    expect(getCatalogStockColorClassName({ category: 'product', current_stock: 0 }, 5)).toBe('text-[#64748B]');
    expect(getCatalogStockColorClassName({ category: 'service', current_stock: 0 }, 5)).toBe('text-[#64748B]');
    expect(getCatalogStockColorClassName({ category: 'product', current_stock: 0, pos_always_available: true }, 5)).toBe('text-[#64748B]');
  });
});
