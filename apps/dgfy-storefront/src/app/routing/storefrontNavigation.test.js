import { describe, expect, it } from 'vitest';

import {
  buildBookingTarget,
  buildCanonicalStorefrontTarget,
  buildCatalogTarget,
  buildItemDetailTarget,
  buildStorefrontHistoryState
} from './storefrontNavigation.js';

describe('storefront branch navigation', () => {
  it('keeps the selected branch in catalog and subpage URLs', () => {
    expect(buildCatalogTarget('Space-Bar-2193ed', { locationId: 1 }))
      .toBe('/tenant-store/space-bar-2193ed?location_id=1');
    expect(buildCatalogTarget('Space-Bar-2193ed', { locationId: 2 }))
      .toBe('/tenant-store/space-bar-2193ed?location_id=2');
    expect(buildItemDetailTarget('space-bar-2193ed', '81', { locationId: 2 }))
      .toBe('/tenant-store/space-bar-2193ed/item?item=81&location_id=2');
    expect(buildBookingTarget('space-bar-2193ed', { locationId: 2 }))
      .toBe('/tenant-store/space-bar-2193ed/book?location_id=2');
  });

  it('canonicalizes the current route without dropping the selected branch', () => {
    expect(buildCanonicalStorefrontTarget({
      storeSlug: 'space-bar-2193ed',
      routeSubpage: 'item',
      routeItemId: '81',
      locationId: 2
    })).toBe('/tenant-store/space-bar-2193ed/item?item=81&location_id=2');

    expect(buildStorefrontHistoryState({
      storeSlug: 'space-bar-2193ed',
      locationId: 2
    })).toEqual({
      storeSlug: 'space-bar-2193ed',
      storeSubpage: null,
      locationId: 2
    });
  });
});
