import { describe, expect, it } from 'vitest';
import { getServicesStorefrontViewModel } from './servicesStorefrontViewModel.js';

// ADR 0080 Decision 4/5 opt-in (Phase 288, #1318): the services storefront's category grouping
// now renders a service once per category it belongs to (primary + each secondary category),
// keyed by a composite `{categoryKey}:{itemId}`. These tests cover that fan-out plus the two
// guarantees Decision 5 requires alongside it: the flat `services`/`allServices` list and its
// stat counts stay primary-only (no double counting), and no composite key collides.
const baseService = (overrides = {}) => ({
  item_id: 1,
  name: 'Wash & Fold',
  category: 'service',
  folder_name: 'Laundry',
  service_detail: {
    service_area_type: 'in_store',
    duration_minutes: 60,
    payment_policy: 'customer_choice'
  },
  secondary_categories: [],
  ...overrides
});

describe('getServicesStorefrontViewModel — secondary-category grouping fan-out', () => {
  it('renders a primary-only service exactly once, in its primary category', () => {
    const result = getServicesStorefrontViewModel([
      baseService({ item_id: 1, folder_name: 'Laundry' })
    ]);

    expect(result.services).toHaveLength(1);
    expect(result.serviceGroups).toHaveLength(1);
    expect(result.serviceGroups[0].items.map((item) => item.item_id)).toEqual([1]);
  });

  it('fans a service with one secondary category out to both categories with distinct composite keys', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 2,
        folder_name: 'Laundry',
        secondary_categories: [{ folder_id: 20, folder_name: 'Pressing' }]
      })
    ]);

    expect(result.services).toHaveLength(1); // the canonical service record is not duplicated
    expect(result.serviceGroups).toHaveLength(2);

    const laundryGroup = result.serviceGroups.find((group) => group.categoryKey === 'laundry');
    const pressingGroup = result.serviceGroups.find((group) => group.categoryKey === 'pressing');
    expect(laundryGroup.items.map((item) => item.item_id)).toEqual([2]);
    expect(pressingGroup.items.map((item) => item.item_id)).toEqual([2]);
    expect(laundryGroup.items[0].serviceItemKey).toBe('laundry:2');
    expect(pressingGroup.items[0].serviceItemKey).toBe('pressing:2');
    expect(laundryGroup.items[0].serviceItemKey).not.toBe(pressingGroup.items[0].serviceItemKey);
  });

  it('fans a service with multiple secondary categories out to every one of them', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 3,
        folder_name: 'Laundry',
        secondary_categories: [
          { folder_id: 21, folder_name: 'Pressing' },
          { folder_id: 22, folder_name: 'Aircon Cleaning' }
        ]
      })
    ]);

    expect(result.serviceGroups).toHaveLength(3);
    const categoryKeys = result.serviceGroups.map((group) => group.categoryKey).sort();
    expect(categoryKeys).toEqual(['aircon cleaning', 'laundry', 'pressing']);
    result.serviceGroups.forEach((group) => {
      expect(group.items.map((item) => item.item_id)).toEqual([3]);
    });
  });

  it('produces no duplicate composite keys across the fanned-out category grouping', () => {
    const result = getServicesStorefrontViewModel([
      baseService({ item_id: 1, folder_name: 'Laundry' }),
      baseService({
        item_id: 2,
        folder_name: 'Laundry',
        secondary_categories: [{ folder_id: 20, folder_name: 'Pressing' }]
      }),
      baseService({
        item_id: 3,
        folder_name: 'Laundry',
        secondary_categories: [
          { folder_id: 21, folder_name: 'Pressing' },
          { folder_id: 22, folder_name: 'Aircon Cleaning' }
        ]
      })
    ]);

    const allKeys = result.serviceGroups.flatMap((group) => group.items.map((item) => item.serviceItemKey));
    expect(allKeys.length).toBeGreaterThan(0);
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });

  it('does not inflate services/allServices or the stat counts for a fanned-out service', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 4,
        folder_name: 'Laundry',
        secondary_categories: [
          { folder_id: 23, folder_name: 'Pressing' },
          { folder_id: 24, folder_name: 'Aircon Cleaning' }
        ]
      })
    ]);

    expect(result.services).toHaveLength(1);
    expect(result.allServices).toHaveLength(1);
    expect(result.totalServices).toBe(1);
    expect(result.inStoreCount).toBe(1);
    expect(result.serviceGroups).toHaveLength(3);
    expect(result.serviceFamilyCount).toBe(3);
  });

  it('deduplicates a secondary category that resolves to the same category as the primary', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 5,
        folder_name: 'Laundry',
        secondary_categories: [{ folder_id: 25, folder_name: 'Laundry' }]
      })
    ]);

    expect(result.serviceGroups).toHaveLength(1);
    expect(result.serviceGroups[0].items).toHaveLength(1);
  });
});
