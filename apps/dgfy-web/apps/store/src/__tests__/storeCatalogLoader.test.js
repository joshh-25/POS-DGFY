import { describe, expect, it } from 'vitest';

import { buildCatalogRequestUrl } from '../shared/hooks/useStoreCatalogLoader.js';

describe('store catalog endpoint selection', () => {
  it('uses the Services-only catalog for a pure Services storefront', () => {
    expect(buildCatalogRequestUrl({ isServicesMode: true })).toBe(
      '/api/v1/store/services/catalog?limit=120'
    );
  });

  it('keeps the general catalog for Retail/F&B and preserves location scope', () => {
    expect(buildCatalogRequestUrl({ locationId: 22 })).toBe(
      '/api/v1/store/catalog?limit=120&location_id=22'
    );
  });
});
