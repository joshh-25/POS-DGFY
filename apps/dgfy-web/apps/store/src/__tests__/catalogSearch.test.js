import { describe, expect, it } from 'vitest';
import { filterCatalogItems } from '../shared/model/catalogSearch.js';

describe('catalog search filter', () => {
  const catalog = [
    { item_id: 1, name: 'Chicken Inasal', sku: 'CHK-001', description: 'Grilled chicken meal' },
    { item_id: 2, name: 'Pork Sisig', item_code: 'PRK-202', description: 'Sizzling pork plate' },
    { item_id: 3, name: 'Halo-Halo', code: 'DES-303', description: 'Cold dessert' }
  ];

  it('returns full catalog when query is empty', () => {
    expect(filterCatalogItems(catalog, '')).toEqual(catalog);
    expect(filterCatalogItems(catalog, '   ')).toEqual(catalog);
  });

  it('matches case-insensitively', () => {
    const result = filterCatalogItems(catalog, 'HALO');
    expect(result.map((item) => item.item_id)).toEqual([3]);
  });

  it('trims query before matching', () => {
    const result = filterCatalogItems(catalog, '  sisig  ');
    expect(result.map((item) => item.item_id)).toEqual([2]);
  });

  it('matches across name, sku/code, and description fields', () => {
    expect(filterCatalogItems(catalog, 'chk-001').map((item) => item.item_id)).toEqual([1]);
    expect(filterCatalogItems(catalog, 'PRK-202').map((item) => item.item_id)).toEqual([2]);
    expect(filterCatalogItems(catalog, 'cold dessert').map((item) => item.item_id)).toEqual([3]);
  });

  it('returns no results when nothing matches', () => {
    const result = filterCatalogItems(catalog, 'unmatched-value');
    expect(result).toEqual([]);
  });

  describe('category/folder matching and cuisine synonym approximation', () => {
    const menu = [
      { item_id: 10, name: 'Grilled Shrimp Skewers', description: 'Charcoal-grilled shrimp', folder_name: 'Seafood' },
      { item_id: 11, name: 'Buttered Crab', description: 'Whole crab in garlic butter', category_name: 'Seafood' },
      { item_id: 12, name: 'Beef Steak', description: 'Pan-seared beef tenderloin', folder_name: 'Mains' },
      { item_id: 13, name: 'Iced Tea', description: 'House-blend iced tea', folder_name: 'Beverages' }
    ];

    it('matches items by their category/folder label directly', () => {
      const result = filterCatalogItems(menu, 'seafood');
      expect(result.map((item) => item.item_id).sort()).toEqual([10, 11]);
    });

    it('matches items via a cuisine synonym even when the folder/name does not contain the literal query', () => {
      const result = filterCatalogItems(menu, 'seafood');
      expect(result.map((item) => item.item_id)).toEqual(expect.arrayContaining([10, 11]));
      const unrelated = filterCatalogItems(menu, 'seafood').map((item) => item.item_id);
      expect(unrelated).not.toEqual(expect.arrayContaining([12, 13]));
    });

    it('finds a "Seafood"-foldered item when searching a related term like "shrimp"', () => {
      const result = filterCatalogItems(menu, 'shrimp');
      expect(result.map((item) => item.item_id)).toEqual(expect.arrayContaining([10, 11]));
    });
  });
});
