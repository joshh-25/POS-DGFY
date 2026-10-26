import { describe, expect, it } from 'vitest';
import { filterDiscoveryStores } from '../discovery/model/discoveryStoreResultsModel.js';
import { DISCOVERY_CATEGORY_MATCHERS } from '../discovery/model/discoveryFilterOptions.js';
import {
  normalizeDiscoveryCategoryKey,
  normalizeStorefrontCategories,
  normalizeStorefrontReviewSummary
} from '../features/discovery/utils/storefrontDiscoveryNormalization.js';

const partnerRows = [
  { slug: 'synqcore-hotel', external_provider: 'synqcore', storefront_categories: ['Hotel'], workflow_mode: 'hospitality' },
  { slug: 'mapviu-home', external_provider: 'mapviu', storefront_categories: ['Real Estate'], workflow_mode: 'services' },
  { slug: 'proventus-job', external_provider: 'proventus', storefront_categories: ['Job'], workflow_mode: 'services' },
  { slug: 'eytitu-taxi', external_provider: 'eytitu', storefront_categories: ['Taxi'], workflow_mode: 'ticketing_transport' },
  { slug: 'native-food', external_provider: null, storefront_categories: ['Food'], workflow_mode: 'food' }
];

describe('partner discovery category filtering', () => {
  it.each([
    ['hotel', 'synqcore-hotel'],
    ['real estate', 'mapviu-home'],
    ['taxi', 'eytitu-taxi'],
    ['job', 'proventus-job']
  ])('filters %s to its provider rows', (category, expectedSlug) => {
    const rows = filterDiscoveryStores({
      DISCOVERY_CATEGORY_MATCHERS,
      discoveryAvailabilityFilter: 'all',
      discoveryCategoryFilter: category,
      discoveryDistanceFilter: 'all',
      discoveryOpenFilter: 'all',
      discoveryRatingFilter: 'all',
      discoveryResultStores: partnerRows,
      normalizeDiscoveryCategoryKey,
      normalizeStorefrontCategories,
      normalizeStorefrontReviewSummary
    });

    expect(rows.map(({ slug }) => slug)).toEqual([expectedSlug]);
  });
});
