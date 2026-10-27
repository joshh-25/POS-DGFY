import { describe, expect, it } from 'vitest';
import { filterDiscoveryStores } from '../discovery/model/discoveryStoreResultsModel.js';
import {
  buildDiscoveryBusinessModeOptions,
  DISCOVERY_CATEGORY_FILTER_OPTIONS,
  DISCOVERY_CATEGORY_MATCHERS
} from '../discovery/model/discoveryFilterOptions.js';
import {
  normalizeDiscoveryCategoryKey,
  normalizeStorefrontCategories,
  normalizeStorefrontReviewSummary
} from '../features/discovery/utils/storefrontDiscoveryNormalization.js';

const discoveryRows = [
  { slug: 'synqcore-hotel', entity_type: 'external_listing', external_provider: 'synqcore', storefront_categories: ['Resort'], workflow_mode: 'services' },
  { slug: 'mapviu-home', entity_type: 'external_listing', external_provider: 'mapviu', storefront_categories: ['Hotel'], workflow_mode: 'hospitality' },
  { slug: 'eytitu-taxi', entity_type: 'external_listing', external_provider: 'eytitu', workflow_mode: 'hospitality' },
  { slug: 'proventous-job-event', entity_type: 'external_listing', external_provider: 'proventus', external_record_origin: 'event_seed', storefront_categories: ['Food'], workflow_mode: 'food' },
  { slug: 'proventous-job-manual', entity_type: 'external_listing', external_provider: 'proventus', external_record_origin: 'manual', storefront_categories: [], workflow_mode: 'services' },
  { slug: 'unknown-hotel', entity_type: 'external_listing', external_provider: 'other', storefront_categories: ['Hotel'], workflow_mode: 'hospitality' },
  { slug: 'missing-type-hotel', external_provider: 'synqcore', storefront_categories: ['Hotel'], workflow_mode: 'hospitality' },
  { slug: 'unknown-type-hotel', entity_type: 'external', external_provider: 'synqcore', storefront_categories: ['Hotel'], workflow_mode: 'hospitality' },
  { slug: 'native-hospitality', entity_type: 'dgfy_native', storefront_categories: ['Hotel'], workflow_mode: 'hospitality' },
  { slug: 'native-food', entity_type: 'dgfy_native', storefront_categories: ['Food'], workflow_mode: 'food' }
];

const filterRows = (category, rows = discoveryRows) => filterDiscoveryStores({
  DISCOVERY_CATEGORY_MATCHERS,
  discoveryAvailabilityFilter: 'all',
  discoveryCategoryFilter: category,
  discoveryDistanceFilter: 'all',
  discoveryOpenFilter: 'all',
  discoveryRatingFilter: 'all',
  discoveryResultStores: rows,
  normalizeDiscoveryCategoryKey,
  normalizeStorefrontCategories,
  normalizeStorefrontReviewSummary
});

describe('partner discovery category filtering', () => {
  it('shows native rows by default and excludes external or unknown entity types', () => {
    expect(filterRows('all').map(({ slug }) => slug)).toEqual([
      'native-hospitality',
      'native-food'
    ]);
  });

  it.each([
    ['hotel', ['synqcore-hotel']],
    ['real estate', ['mapviu-home']],
    ['taxi', ['eytitu-taxi']],
    ['job', ['proventous-job-event', 'proventous-job-manual']]
  ])('uses provider identity for the %s category, regardless of tags or row origin', (category, expectedSlugs) => {
    expect(filterRows(category).map(({ slug }) => slug)).toEqual(expectedSlugs);
  });

  it('keeps native category matching and returns to native-only for All or another category', () => {
    expect(filterRows('food').map(({ slug }) => slug)).toEqual(['native-food']);
    expect(filterRows('all').map(({ slug }) => slug)).toEqual(['native-hospitality', 'native-food']);
  });

  it('adds the four partner categories to the actual business-mode dropdown exactly once', () => {
    const options = buildDiscoveryBusinessModeOptions({
      workflowModeLabels: { food: 'Food & Beverage' },
      workflowModeSelectValues: ['food', 'hotel']
    });

    expect(options.slice(-4)).toEqual([
      ['hotel', 'Hotel'],
      ['real estate', 'Real Estate'],
      ['taxi', 'Taxi'],
      ['job', 'Job']
    ]);
    expect(options.filter(([value]) => value === 'hotel')).toHaveLength(1);
    expect(DISCOVERY_CATEGORY_FILTER_OPTIONS.slice(-4)).toEqual(options.slice(-4));
  });
});
