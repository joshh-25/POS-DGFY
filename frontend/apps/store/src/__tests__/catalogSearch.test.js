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
});
