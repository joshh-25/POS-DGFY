import { describe, expect, it } from 'vitest';
import { buildFnbCatalogPresentation } from './buildFnbCatalogPresentation.js';

const fnbViewModel = {
  menuItems: [
    { item_id: 'a', name: 'Americano', default_sale_price: 120 },
    { item_id: 'b', name: 'Burger', default_sale_price: 180 },
    { item_id: 'c', name: 'Cake', default_sale_price: 90 }
  ],
  menuSections: [
    {
      sectionKey: 'coffee',
      items: [{ item_id: 'a', name: 'Americano', default_sale_price: 120 }]
    },
    {
      sectionKey: 'food',
      items: [{ item_id: 'b', name: 'Burger', default_sale_price: 180 }]
    }
  ]
};

describe('buildFnbCatalogPresentation', () => {
  it('uses a valid selected section and only returns that section items', () => {
    const result = buildFnbCatalogPresentation({
      activeSection: 'food',
      fnbViewModel,
      page: 1,
      pageSize: 8,
      sortOption: 'name_asc'
    });

    expect(result.resolvedSection).toBe('food');
    expect(result.visibleItems.map((item) => item.item_id)).toEqual(['b']);
  });

  it('falls back to all items when the selected section is invalid', () => {
    const result = buildFnbCatalogPresentation({
      activeSection: 'missing',
      fnbViewModel,
      page: 1,
      pageSize: 8,
      sortOption: 'name_asc'
    });

    expect(result.resolvedSection).toBe('');
    expect(result.visibleItems.map((item) => item.item_id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts and clamps the requested page before exposing visible items', () => {
    const result = buildFnbCatalogPresentation({
      activeSection: '',
      fnbViewModel,
      page: 9,
      pageSize: 2,
      sortOption: 'price_desc'
    });

    expect(result.totalPages).toBe(2);
    expect(result.resolvedPage).toBe(2);
    expect(result.visibleItems.map((item) => item.item_id)).toEqual(['c']);
  });
});
