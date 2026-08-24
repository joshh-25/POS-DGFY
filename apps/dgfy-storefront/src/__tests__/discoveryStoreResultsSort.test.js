import { describe, expect, it } from 'vitest';
import { sortDiscoveryResultStores } from '../discovery/model/discoveryStoreResultsModel.js';

describe('sortDiscoveryResultStores relevance-weighted search ranking', () => {
  const nearButUnrelated = {
    tenant_name: 'Unrelated Hardware',
    storefront_categories: ['Hardware'],
    matching_item_sample: [],
    address_line: 'Iloilo City',
    nearest_distance_km: 1
  };
  const fartherButRelevant = {
    tenant_name: 'Bay View Grill',
    storefront_categories: ['Seafood'],
    matching_item_sample: [{ name: 'Grilled Shrimp' }],
    address_line: 'Iloilo City',
    nearest_distance_km: 2.5
  };

  it('keeps pure distance ordering when there is no active search', () => {
    const sorted = sortDiscoveryResultStores({
      discoveryCoords: null,
      discoverySortBy: 'nearest',
      hasDiscoverySearch: false,
      normalizeStorefrontReviewSummary: () => null,
      search: '',
      storesWithNearestBranch: [fartherButRelevant, nearButUnrelated]
    });
    expect(sorted.map((store) => store.tenant_name)).toEqual(['Unrelated Hardware', 'Bay View Grill']);
  });

  it('lets a relevant but slightly farther store outrank a nearer unrelated store during search', () => {
    const sorted = sortDiscoveryResultStores({
      discoveryCoords: null,
      discoverySortBy: 'nearest',
      hasDiscoverySearch: true,
      normalizeStorefrontReviewSummary: () => null,
      search: 'seafood',
      storesWithNearestBranch: [nearButUnrelated, fartherButRelevant]
    });
    expect(sorted.map((store) => store.tenant_name)).toEqual(['Bay View Grill', 'Unrelated Hardware']);
  });

  it('still lets a much nearer unrelated store win over a distant relevant match', () => {
    const veryNearUnrelated = { ...nearButUnrelated, nearest_distance_km: 0.1 };
    const veryFarRelevant = { ...fartherButRelevant, nearest_distance_km: 20 };
    const sorted = sortDiscoveryResultStores({
      discoveryCoords: null,
      discoverySortBy: 'nearest',
      hasDiscoverySearch: true,
      normalizeStorefrontReviewSummary: () => null,
      search: 'seafood',
      storesWithNearestBranch: [veryFarRelevant, veryNearUnrelated]
    });
    expect(sorted.map((store) => store.tenant_name)).toEqual(['Unrelated Hardware', 'Bay View Grill']);
  });
});
