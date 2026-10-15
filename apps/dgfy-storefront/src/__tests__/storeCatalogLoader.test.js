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

  it('adds the stable QR token to the general catalog URL', () => {
    expect(buildCatalogRequestUrl({ locationId: 22, qrToken: 'DGFYQR_test-token' })).toBe(
      '/api/v1/store/catalog?limit=200&location_id=22&qr_token=DGFYQR_test-token'
    );
  });

  it('uses the DGLaundry projection endpoint without unrelated generic filters', () => {
    expect(buildCatalogRequestUrl({ isLaundryMode: true, locationId: 22 })).toBe(
      '/api/v1/store/laundry/catalog?location_id=22'
    );
  });
});
