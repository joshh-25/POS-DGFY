import { describe, expect, it } from 'vitest';
import { getFoodBeverageStorefrontViewModel } from './fnbStorefrontViewModel.js';

// ADR 0080 Decision 4/5 opt-in (Phase 288, #1318): the F&B storefront menu's section grouping
// now renders an item once per section it belongs to (primary + each secondary category),
// keyed by a composite `{sectionKey}:{itemId}`. These tests cover that fan-out plus the two
// guarantees Decision 5 requires alongside it: the flat, unsectioned item list/stats stay
// primary-only (no double counting), and no composite key collides.
const baseItem = (overrides = {}) => ({
  item_id: 1,
  name: 'Item',
  category: 'menu',
  folder_name: 'Coffee & Tea',
  default_sale_price: 120,
  is_available: true,
  secondary_categories: [],
  ...overrides
});

describe('getFoodBeverageStorefrontViewModel — secondary-category grouping fan-out', () => {
  it('renders a primary-only item exactly once, in its primary section', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({ item_id: 1, folder_name: 'Coffee & Tea' })
    ]);

    expect(result.menuItems).toHaveLength(1);
    expect(result.menuSections).toHaveLength(1);
    expect(result.menuSections[0].sectionLabel).toBe('Coffee & Tea');
    expect(result.menuSections[0].items.map((item) => item.item_id)).toEqual([1]);
  });

  it('fans an item with one secondary category out to both sections with distinct composite keys', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 2,
        folder_name: 'Coffee & Tea',
        secondary_categories: [{ folder_id: 10, folder_name: 'Desserts' }]
      })
    ]);

    expect(result.menuItems).toHaveLength(1); // the canonical item record is not duplicated
    expect(result.menuSections).toHaveLength(2);

    const coffeeSection = result.menuSections.find((section) => section.sectionLabel === 'Coffee & Tea');
    const dessertSection = result.menuSections.find((section) => section.sectionLabel === 'Desserts');
    expect(coffeeSection.items.map((item) => item.item_id)).toEqual([2]);
    expect(dessertSection.items.map((item) => item.item_id)).toEqual([2]);
    expect(coffeeSection.items[0].menuItemKey).toBe('coffee_&_tea:2');
    expect(dessertSection.items[0].menuItemKey).toBe('desserts:2');
    expect(coffeeSection.items[0].menuItemKey).not.toBe(dessertSection.items[0].menuItemKey);
  });

  it('fans an item with multiple secondary categories out to every one of them', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 3,
        folder_name: 'Mains',
        secondary_categories: [
          { folder_id: 11, folder_name: 'Rice Meals' },
          { folder_id: 12, folder_name: 'Snacks' }
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
      baseItem({ item_id: 1, folder_name: 'Coffee & Tea' }),
      baseItem({
        item_id: 2,
        folder_name: 'Coffee & Tea',
        secondary_categories: [{ folder_id: 10, folder_name: 'Desserts' }]
      }),
      baseItem({
        item_id: 3,
        folder_name: 'Mains',
        secondary_categories: [
          { folder_id: 11, folder_name: 'Rice Meals' },
          { folder_id: 12, folder_name: 'Snacks' }
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
        folder_name: 'Mains',
        secondary_categories: [
          { folder_id: 13, folder_name: 'Rice Meals' },
          { folder_id: 14, folder_name: 'Snacks' }
        ]
      })
    ]);

    expect(result.menuItems).toHaveLength(1);
    expect(result.totalItems).toBe(1);
    expect(result.menuSections).toHaveLength(3);
    expect(result.menuSectionCount).toBe(3);
  });

  it('deduplicates a secondary category that resolves to the same section as the primary', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 5,
        folder_name: 'Coffee & Tea',
        secondary_categories: [{ folder_id: 15, folder_name: 'Coffee & Tea' }]
      })
    ]);

    expect(result.menuSections).toHaveLength(1);
    expect(result.menuSections[0].items).toHaveLength(1);
  });

  it('deduplicates two secondary categories that normalize to the same section', () => {
    const result = getFoodBeverageStorefrontViewModel([
      baseItem({
        item_id: 6,
        folder_name: 'Mains',
        secondary_categories: [
          { folder_id: 16, folder_name: 'Desserts' },
          { folder_id: 17, folder_name: '  desserts  ' }
        ]
      })
    ]);

    expect(result.menuSections).toHaveLength(2);
  });
});
