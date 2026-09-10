import { describe, expect, it } from 'vitest';
import { getFoodBeverageStorefrontViewModel } from './fnbStorefrontViewModel.js';

// ADR 0080 Decision 4/5 opt-in (Phase 289, #1318): the F&B storefront menu's section grouping
// now renders an item once per section it belongs to (primary + each secondary category),
// keyed by a composite `{sectionIdentity}:{itemId}`. These tests cover that fan-out plus the
// guarantees Decision 5 requires alongside it: the flat, unsectioned item list/stats stay
// primary-only (no double counting), grouping/dedup identity is folder_id-based rather than
// normalized-name-based (RF-1, PR #1583 review -- two distinct folders whose names happen to
// normalize identically must never collapse into one group, and a real secondary membership
// must never be dropped just because its name collides with the primary's), and no composite
// key collides.
const baseItem = (overrides = {}) => ({
  item_id: 1,
  name: 'Item',
  category: 'menu',
  folder_id: 100,
  folder_name: 'Coffee & Tea',
  default_sale_price: 120,
  is_available: true,
  secondary_categories: [],
  ...overrides
});

describe('getFoodBeverageStorefrontViewModel — secondary-category grouping fan-out', () => {
  it('orders category sections by the shared catalog sort order', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({ item_id: 1, folder_id: 100, folder_name: 'Mains', folder_sort_order: 8 }),
      baseItem({ item_id: 2, folder_id: 200, folder_name: 'Drinks', folder_sort_order: 2 }),
      baseItem({ item_id: 3, folder_id: 300, folder_name: 'Desserts', folder_sort_order: 5 })
    ]);
    expect(result.menuSections.map((section) => section.sectionLabel)).toEqual(['Drinks', 'Desserts', 'Mains']);
  });

  it('keeps a secondary-only item available in All while using only its valid secondary category', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 10,
        folder_id: null,
        folder_name: 'Legacy Category',
        secondary_categories: [
          { folder_id: 200, folder_name: 'Mains', sort_order: 4 },
          { folder_id: 0, folder_name: 'Invalid ID', sort_order: 1 },
          { folder_id: 'not-a-number', folder_name: 'Invalid ID', sort_order: 2 },
          { folder_id: 201, folder_name: '   ', sort_order: 3 }
        ]
      })
    ]);

    expect(result.menuItems.map((item) => item.item_id)).toEqual([10]);
    expect(result.totalItems).toBe(1);
    expect(result.menuSections).toHaveLength(1);
    expect(result.menuSections[0]).toMatchObject({
      sectionIdentity: 'folder:200',
      sectionLabel: 'Mains',
      sortOrder: 4
    });
    expect(result.menuSections[0].items.map((item) => item.item_id)).toEqual([10]);
  });

  it('keeps every item exactly once in All when primary and secondary memberships coexist', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({ item_id: 11, folder_id: 100, folder_name: 'Mains', secondary_categories: [{ folder_id: 200, folder_name: 'Drinks' }] }),
      baseItem({ item_id: 12, folder_id: null, folder_name: '', secondary_categories: [{ folder_id: 201, folder_name: 'Desserts' }] }),
      baseItem({ item_id: 13, folder_id: 101, folder_name: 'Mains' })
    ]);

    expect(result.menuItems.map((item) => item.item_id)).toEqual([11, 12, 13]);
    expect(new Set(result.menuItems.map((item) => item.item_id)).size).toBe(3);
  });

  it('renders a primary-only item exactly once, in its primary section', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({ item_id: 1, folder_id: 100, folder_name: 'Coffee & Tea' })
    ]);

    expect(result.menuItems).toHaveLength(1);
    expect(result.menuSections).toHaveLength(1);
    expect(result.menuSections[0].sectionLabel).toBe('Coffee & Tea');
    expect(result.menuSections[0].sectionIdentity).toBe('folder:100');
    expect(result.menuSections[0].items.map((item) => item.item_id)).toEqual([1]);
  });

  it('fans an item with one secondary category out to both sections with distinct composite keys', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 2,
        folder_id: 100,
        folder_name: 'Coffee & Tea',
        secondary_categories: [{ folder_id: 200, folder_name: 'Desserts' }]
      })
    ]);

    expect(result.menuItems).toHaveLength(1); // the canonical item record is not duplicated
    expect(result.menuSections).toHaveLength(2);

    const coffeeSection = result.menuSections.find((section) => section.sectionLabel === 'Coffee & Tea');
    const dessertSection = result.menuSections.find((section) => section.sectionLabel === 'Desserts');
    expect(coffeeSection.items.map((item) => item.item_id)).toEqual([2]);
    expect(dessertSection.items.map((item) => item.item_id)).toEqual([2]);
    expect(coffeeSection.items[0].menuItemKey).toBe('folder:100:2');
    expect(dessertSection.items[0].menuItemKey).toBe('folder:200:2');
    expect(coffeeSection.items[0].menuItemKey).not.toBe(dessertSection.items[0].menuItemKey);
  });

  it('fans an item with multiple secondary categories out to every one of them', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 3,
        folder_id: 100,
        folder_name: 'Mains',
        secondary_categories: [
          { folder_id: 201, folder_name: 'Rice Meals' },
          { folder_id: 202, folder_name: 'Snacks' }
        ]
      })
    ]);

    expect(result.menuSections).toHaveLength(3);
    const sectionLabels = result.menuSections.map((section) => section.sectionLabel).sort();
    expect(sectionLabels).toEqual(['Mains', 'Rice Meals', 'Snacks']);
    result.menuSections.forEach((section) => {
      expect(section.items.map((item) => item.item_id)).toEqual([3]);
    });
  });

  it('produces no duplicate composite keys across the fanned-out section grouping', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({ item_id: 1, folder_id: 100, folder_name: 'Coffee & Tea' }),
      baseItem({
        item_id: 2,
        folder_id: 100,
        folder_name: 'Coffee & Tea',
        secondary_categories: [{ folder_id: 200, folder_name: 'Desserts' }]
      }),
      baseItem({
        item_id: 3,
        folder_id: 101,
        folder_name: 'Mains',
        secondary_categories: [
          { folder_id: 201, folder_name: 'Rice Meals' },
          { folder_id: 202, folder_name: 'Snacks' }
        ]
      })
    ]);

    const allKeys = result.menuSections.flatMap((section) => section.items.map((item) => item.menuItemKey));
    expect(allKeys.length).toBeGreaterThan(0);
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });

  it('does not inflate the flat menuItems list or totalItems for a fanned-out item', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 4,
        folder_id: 100,
        folder_name: 'Mains',
        secondary_categories: [
          { folder_id: 201, folder_name: 'Rice Meals' },
          { folder_id: 202, folder_name: 'Snacks' }
        ]
      })
    ]);

    expect(result.menuItems).toHaveLength(1);
    expect(result.totalItems).toBe(1);
    expect(result.menuSections).toHaveLength(3);
    expect(result.menuSectionCount).toBe(3);
  });

  it('deduplicates a secondary category that is the same folder as the primary', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 5,
        folder_id: 100,
        folder_name: 'Coffee & Tea',
        secondary_categories: [{ folder_id: 100, folder_name: 'Coffee & Tea' }]
      })
    ]);

    expect(result.menuSections).toHaveLength(1);
    expect(result.menuSections[0].items).toHaveLength(1);
  });

  it('deduplicates two secondary categories that are the same folder (duplicate membership rows)', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 6,
        folder_id: 100,
        folder_name: 'Mains',
        secondary_categories: [
          { folder_id: 200, folder_name: 'Desserts' },
          { folder_id: 200, folder_name: '  desserts  ' }
        ]
      })
    ]);

    expect(result.menuSections).toHaveLength(2); // Mains + Desserts, not 3
  });

  // RF-1 (PR #1583 review): the actual blocker. Two genuinely distinct folders -- different
  // folder_id -- whose display names happen to normalize to the identical `sectionKey` text must
  // still render as two separate sections, not collapse into one and silently drop the secondary
  // membership.
  it('keeps two distinct folders as separate sections even when their normalized names collide', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 7,
        folder_id: 10,
        folder_name: 'A B',
        secondary_categories: [{ folder_id: 11, folder_name: 'A_B' }]
      })
    ]);

    // "A B" and "A_B" both normalize to the `a_b` sectionKey text, but folder_id 10 and 11 are
    // two genuinely distinct folders.
    expect(result.menuSections).toHaveLength(2);
    result.menuSections.forEach((section) => {
      expect(section.sectionKey).toBe('a_b');
    });
    const identities = result.menuSections.map((section) => section.sectionIdentity).sort();
    expect(identities).toEqual(['folder:10', 'folder:11']);
    const keys = result.menuSections.flatMap((section) => section.items.map((item) => item.menuItemKey)).sort();
    expect(keys).toEqual(['folder:10:7', 'folder:11:7']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps unassigned items under All without creating an inferred category', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({ item_id: 8, folder_id: null, folder_name: 'Masu Cafe', item_group_name: 'Chef Specials' }),
      baseItem({ item_id: 9, folder_id: null, folder_name: '', product_type: 'main course' })
    ]);

    expect(result.menuItems.map((item) => item.item_id)).toEqual([8, 9]);
    expect(result.totalItems).toBe(2);
    expect(result.menuSections).toEqual([]);
  });
});
