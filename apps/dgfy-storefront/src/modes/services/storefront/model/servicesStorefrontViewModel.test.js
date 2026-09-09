import { describe, expect, it } from 'vitest';
import { getServicesStorefrontViewModel } from './servicesStorefrontViewModel.js';

// ADR 0080 Decision 4/5 opt-in (Phase 289, #1318): the services storefront's category grouping
// now renders a service once per category it belongs to (primary + each secondary category),
// keyed by a composite `{categoryIdentity}:{itemId}`. These tests cover that fan-out plus the
// guarantees Decision 5 requires alongside it: the flat `services`/`allServices` list and its
// stat counts stay primary-only (no double counting), grouping/dedup identity is folder_id-based
// rather than normalized-name-based (RF-1, PR #1583 review -- two distinct folders whose names
// happen to normalize identically must never collapse into one group, and a real secondary
// membership must never be dropped just because its name collides with the primary's), and no
// composite key collides.
const baseService = (overrides = {}) => ({
  item_id: 1,
  name: 'Wash & Fold',
  category: 'service',
  folder_id: 100,
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
  it('orders category groups by the shared catalog sort order', () => {
    const result = getServicesStorefrontViewModel([
      baseService({ item_id: 1, folder_id: 100, folder_name: 'Laundry', folder_sort_order: 9 }),
      baseService({ item_id: 2, folder_id: 200, folder_name: 'Pressing', folder_sort_order: 1 }),
      baseService({ item_id: 3, folder_id: 300, folder_name: 'Alterations', folder_sort_order: 5 })
    ]);
    expect(result.serviceGroups.map((group) => group.categoryIdentity)).toEqual(['folder:200', 'folder:300', 'folder:100']);
  });

  it('keeps a secondary-only service available in All while using only its valid secondary category', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 10,
        folder_id: null,
        folder_name: 'Legacy Services',
        secondary_categories: [
          { folder_id: 200, folder_name: 'Laundry', sort_order: 4 },
          { folder_id: 0, folder_name: 'Invalid ID', sort_order: 1 },
          { folder_id: 'not-a-number', folder_name: 'Invalid ID', sort_order: 2 },
          { folder_id: 201, folder_name: '   ', sort_order: 3 }
        ]
      })
    ]);

    expect(result.allServices.map((item) => item.item_id)).toEqual([10]);
    expect(result.totalServices).toBe(1);
    expect(result.serviceGroups).toHaveLength(1);
    expect(result.serviceGroups[0]).toMatchObject({
      categoryIdentity: 'folder:200',
      categoryKey: 'laundry'
    });
    expect(result.serviceGroups[0].items.map((item) => item.item_id)).toEqual([10]);
    expect(result.serviceGroups[0].items[0].categorySortOrder).toBe(4);
  });

  it('keeps every service exactly once in All when primary and secondary memberships coexist', () => {
    const result = getServicesStorefrontViewModel([
      baseService({ item_id: 11, folder_id: 100, folder_name: 'Laundry', secondary_categories: [{ folder_id: 200, folder_name: 'Pressing' }] }),
      baseService({ item_id: 12, folder_id: null, folder_name: '', secondary_categories: [{ folder_id: 201, folder_name: 'Alterations' }] }),
      baseService({ item_id: 13, folder_id: 101, folder_name: 'Laundry' })
    ]);

    expect(result.allServices.map((item) => item.item_id)).toEqual([11, 12, 13]);
    expect(new Set(result.allServices.map((item) => item.item_id)).size).toBe(3);
  });

  it('renders a primary-only service exactly once, in its primary category', () => {
    const result = getServicesStorefrontViewModel([
      baseService({ item_id: 1, folder_id: 100, folder_name: 'Laundry' })
    ]);

    expect(result.services).toHaveLength(1);
    expect(result.serviceGroups).toHaveLength(1);
    expect(result.serviceGroups[0].categoryIdentity).toBe('folder:100');
    expect(result.serviceGroups[0].items.map((item) => item.item_id)).toEqual([1]);
  });

  it('fans a service with one secondary category out to both categories with distinct composite keys', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 2,
        folder_id: 100,
        folder_name: 'Laundry',
        secondary_categories: [{ folder_id: 200, folder_name: 'Pressing' }]
      })
    ]);

    expect(result.services).toHaveLength(1); // the canonical service record is not duplicated
    expect(result.serviceGroups).toHaveLength(2);

    const laundryGroup = result.serviceGroups.find((group) => group.categoryIdentity === 'folder:100');
    const pressingGroup = result.serviceGroups.find((group) => group.categoryIdentity === 'folder:200');
    expect(laundryGroup.items.map((item) => item.item_id)).toEqual([2]);
    expect(pressingGroup.items.map((item) => item.item_id)).toEqual([2]);
    expect(laundryGroup.items[0].serviceItemKey).toBe('folder:100:2');
    expect(pressingGroup.items[0].serviceItemKey).toBe('folder:200:2');
    expect(laundryGroup.items[0].serviceItemKey).not.toBe(pressingGroup.items[0].serviceItemKey);
  });

  it('fans a service with multiple secondary categories out to every one of them', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 3,
        folder_id: 100,
        folder_name: 'Laundry',
        secondary_categories: [
          { folder_id: 201, folder_name: 'Pressing' },
          { folder_id: 202, folder_name: 'Aircon Cleaning' }
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
      baseService({ item_id: 1, folder_id: 100, folder_name: 'Laundry' }),
      baseService({
        item_id: 2,
        folder_id: 100,
        folder_name: 'Laundry',
        secondary_categories: [{ folder_id: 200, folder_name: 'Pressing' }]
      }),
      baseService({
        item_id: 3,
        folder_id: 101,
        folder_name: 'Laundry',
        secondary_categories: [
          { folder_id: 201, folder_name: 'Pressing' },
          { folder_id: 202, folder_name: 'Aircon Cleaning' }
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
        folder_id: 100,
        folder_name: 'Laundry',
        secondary_categories: [
          { folder_id: 201, folder_name: 'Pressing' },
          { folder_id: 202, folder_name: 'Aircon Cleaning' }
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

  it('deduplicates a secondary category that is the same folder as the primary', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 5,
        folder_id: 100,
        folder_name: 'Laundry',
        secondary_categories: [{ folder_id: 100, folder_name: 'Laundry' }]
      })
    ]);

    expect(result.serviceGroups).toHaveLength(1);
    expect(result.serviceGroups[0].items).toHaveLength(1);
  });

  it('deduplicates two secondary categories that are the same folder (duplicate membership rows)', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 6,
        folder_id: 100,
        folder_name: 'Laundry',
        secondary_categories: [
          { folder_id: 200, folder_name: 'Pressing' },
          { folder_id: 200, folder_name: '  pressing  ' }
        ]
      })
    ]);

    expect(result.serviceGroups).toHaveLength(2); // Laundry + Pressing, not 3
  });

  // RF-1 (PR #1583 review): the actual blocker. Two genuinely distinct folders -- different
  // folder_id -- whose display names happen to normalize to the identical `categoryKey` text must
  // still render as two separate groups, not collapse into one and silently drop the secondary
  // membership.
  it('keeps two distinct folders as separate groups even when their normalized names collide', () => {
    const result = getServicesStorefrontViewModel([
      baseService({
        item_id: 7,
        folder_id: 10,
        folder_name: 'Wash',
        secondary_categories: [{ folder_id: 11, folder_name: 'wash' }]
      })
    ]);

    // "Wash" and "wash" both normalize to the same `wash` categoryKey text, but folder_id 10 and
    // 11 are two genuinely distinct folders.
    expect(result.serviceGroups).toHaveLength(2);
    result.serviceGroups.forEach((group) => {
      expect(group.categoryKey).toBe('wash');
    });
    const identities = result.serviceGroups.map((group) => group.categoryIdentity).sort();
    expect(identities).toEqual(['folder:10', 'folder:11']);
    const keys = result.serviceGroups.flatMap((group) => group.items.map((item) => item.serviceItemKey)).sort();
    expect(keys).toEqual(['folder:10:7', 'folder:11:7']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps unassigned services under All without creating an inferred category', () => {
    const result = getServicesStorefrontViewModel([
      baseService({ item_id: 8, folder_id: null, folder_name: 'Legacy Services', service_detail: { service_category: 'wellness' } }),
      baseService({ item_id: 9, folder_id: null, folder_name: '', service_detail: { service_category: 'wellness' } })
    ]);

    expect(result.allServices.map((item) => item.item_id)).toEqual([8, 9]);
    expect(result.totalServices).toBe(2);
    expect(result.serviceGroups).toEqual([]);
  });
});
