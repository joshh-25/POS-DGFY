import { describe, expect, it } from 'vitest';
import { buildFnbCatalogPresentation } from './buildFnbCatalogPresentation.js';

// RF-4 (PR #1583 review): `sectionIdentity` (the stable, folder_id-based identity) is what
// `activeSection`/`resolvedSection` resolve/match against, never `sectionKey` (the normalized
// display text) -- every fixture below carries a realistic `sectionIdentity` for that reason.
const fnbViewModel = {
  menuItems: [
    { item_id: 'a', name: 'Americano', default_sale_price: 120 },
    { item_id: 'b', name: 'Burger', default_sale_price: 180 },
    { item_id: 'c', name: 'Cake', default_sale_price: 90 }
  ],
  menuSections: [
    {
      sectionKey: 'coffee',
      sectionIdentity: 'folder:10',
      items: [{ item_id: 'a', name: 'Americano', default_sale_price: 120 }]
    },
    {
      sectionKey: 'food',
      sectionIdentity: 'folder:20',
      items: [{ item_id: 'b', name: 'Burger', default_sale_price: 180 }]
    }
  ]
};

describe('buildFnbCatalogPresentation', () => {
  it('uses a valid selected section (by sectionIdentity) and only returns that section items', () => {
    const result = buildFnbCatalogPresentation({
      activeSection: 'folder:20',
      fnbViewModel,
      page: 1,
      pageSize: 8,
      sortOption: 'name_asc'
    });

    expect(result.resolvedSection).toBe('folder:20');
    expect(result.activeSectionModel.sectionKey).toBe('food');
    expect(result.visibleItems.map((item) => item.item_id)).toEqual(['b']);
  });

  it('does not resolve a section by its sectionKey display text alone', () => {
    // The reviewer's exact concern: matching by the normalized `sectionKey` text instead of the
    // stable `sectionIdentity` would let this resolve -- it must not.
    const result = buildFnbCatalogPresentation({
      activeSection: 'food',
      fnbViewModel,
      page: 1,
      pageSize: 8,
      sortOption: 'name_asc'
    });

    expect(result.resolvedSection).toBe('');
    expect(result.visibleItems.map((item) => item.item_id)).toEqual(['a', 'b', 'c']);
  });

  it('resolves two colliding-sectionKey, distinct-sectionIdentity sections independently (RF-4)', () => {
    const collidingViewModel = {
      menuItems: [
        { item_id: 'a', name: 'Americano', default_sale_price: 120 },
        { item_id: 'b', name: 'Iced Americano', default_sale_price: 130 }
      ],
      menuSections: [
        {
          sectionKey: 'a_b',
          sectionIdentity: 'folder:10',
          items: [{ item_id: 'a', name: 'Americano', default_sale_price: 120 }]
        },
        {
          sectionKey: 'a_b',
          sectionIdentity: 'folder:11',
          items: [{ item_id: 'b', name: 'Iced Americano', default_sale_price: 130 }]
        }
      ]
    };

    const firstResult = buildFnbCatalogPresentation({
      activeSection: 'folder:10',
      fnbViewModel: collidingViewModel,
      page: 1,
      pageSize: 8,
      sortOption: 'name_asc'
    });
    expect(firstResult.resolvedSection).toBe('folder:10');
    expect(firstResult.visibleItems.map((item) => item.item_id)).toEqual(['a']);

    const secondResult = buildFnbCatalogPresentation({
      activeSection: 'folder:11',
      fnbViewModel: collidingViewModel,
      page: 1,
      pageSize: 8,
      sortOption: 'name_asc'
    });
    expect(secondResult.resolvedSection).toBe('folder:11');
    expect(secondResult.visibleItems.map((item) => item.item_id)).toEqual(['b']);
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

  it('orders the unfiltered catalog by primary category order before item name', () => {
    const result = buildFnbCatalogPresentation({
      activeSection: '',
      fnbViewModel: {
        menuItems: [
          { item_id: 3, name: 'Meal item', folder_id: 30, categorySortOrder: 2 },
          { item_id: 1, name: 'Main item', folder_id: 10, categorySortOrder: 0 },
          { item_id: 4, name: 'Unassigned item', categorySortOrder: null },
          { item_id: 2, name: 'Shake item', folder_id: 20, categorySortOrder: 1 }
        ],
        menuSections: [
          { sectionIdentity: 'folder:10', items: [] },
          { sectionIdentity: 'folder:20', items: [] },
          { sectionIdentity: 'folder:30', items: [] }
        ]
      },
      page: 1,
      pageSize: 8,
      sortOption: 'name_asc'
    });

    expect(result.visibleItems.map((item) => item.item_id)).toEqual([1, 2, 3, 4]);
  });

  it('orders All items by their highest-priority category membership, then alphabetically', () => {
    const result = buildFnbCatalogPresentation({
      activeSection: '',
      fnbViewModel: {
        menuItems: [
          { item_id: 'burger', name: 'Burger', folder_id: 20, folder_sort_order: 0 },
          { item_id: 'shrimp', name: 'Buttered Shrimp', folder_id: 30, folder_sort_order: 0 },
          { item_id: 'adobo', name: 'Adobo', folder_id: 10, folder_sort_order: 2 },
          {
            item_id: 'grilled-onion',
            name: 'Grilled Onion',
            folder_id: 30,
            folder_sort_order: 2,
            secondary_categories: [{ folder_id: 10, folder_name: 'Viands', sort_order: 999 }]
          },
          { item_id: 'caldereta', name: 'Caldereta', folder_id: 10, folder_sort_order: 2 },
          { item_id: 'uncategorized', name: 'Uncategorized item', folder_sort_order: null }
        ],
        menuSections: [
          { sectionIdentity: 'folder:10', sortOrder: 2, items: [] },
          { sectionIdentity: 'folder:20', sortOrder: 0, items: [] },
          { sectionIdentity: 'folder:30', sortOrder: 0, items: [] }
        ]
      },
      page: 1,
      pageSize: 8,
      sortOption: 'name_asc'
    });

    expect(result.visibleItems.map((item) => item.item_id)).toEqual([
      'adobo',
      'caldereta',
      'grilled-onion',
      'burger',
      'shrimp',
      'uncategorized'
    ]);
    expect(new Set(result.visibleItems.map((item) => item.item_id)).size).toBe(result.visibleItems.length);
  });

  it('keeps a selected category alphabetical even when its items have different category priorities', () => {
    const result = buildFnbCatalogPresentation({
      activeSection: 'folder:10',
      fnbViewModel: {
        menuItems: [],
        menuSections: [
          {
            sectionIdentity: 'folder:10',
            items: [
              { item_id: 'z', name: 'Zucchini', folder_sort_order: 0 },
              { item_id: 'a', name: 'Adobo', folder_sort_order: 3 }
            ]
          },
          { sectionIdentity: 'folder:20', items: [] }
        ]
      },
      page: 1,
      pageSize: 8,
      sortOption: 'name_asc'
    });

    expect(result.visibleItems.map((item) => item.item_id)).toEqual(['a', 'z']);
  });

  it('preserves an explicit price sort over category priority', () => {
    const result = buildFnbCatalogPresentation({
      activeSection: '',
      fnbViewModel: {
        menuItems: [
          { item_id: 'viands', name: 'Adobo', folder_sort_order: 0, default_sale_price: 180 },
          { item_id: 'burgers', name: 'Burger', folder_sort_order: 1, default_sale_price: 50 }
        ],
        menuSections: []
      },
      page: 1,
      pageSize: 8,
      sortOption: 'price_asc'
    });

    expect(result.visibleItems.map((item) => item.item_id)).toEqual(['burgers', 'viands']);
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
