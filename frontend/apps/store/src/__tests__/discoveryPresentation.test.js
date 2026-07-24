import { describe, expect, it } from 'vitest';
import {
  getDiscoveryEmptyStateMessage,
  getDiscoveryMatchBadges,
  getPreferredDiscoveryLocationId,
  selectDiscoveryPinLocations
} from '../discovery/model/discoveryPresentation.js';
import { buildDiscoveryResultsRendererProps } from '../discovery/model/discoveryRendererProps.js';

describe('selectDiscoveryPinLocations', () => {
  const activeLocations = [
    { location_id: 1, name: 'Primary', is_primary_storefront: true },
    { location_id: 2, name: 'Branch A', is_primary_storefront: false },
    { location_id: 3, name: 'Branch B', is_primary_storefront: false }
  ];

  it('keeps explicit all-branches scope when no search query is active', () => {
    expect(selectDiscoveryPinLocations({ activeLocations, hasSearchQuery: false, pinScope: 'all_matching_branches' }))
      .toEqual(activeLocations);
  });

  it('returns nearest matching location when pin scope is nearest_matching_branch', () => {
    expect(selectDiscoveryPinLocations({
      activeLocations,
      hasSearchQuery: true,
      pinScope: 'nearest_matching_branch',
      nearestMatchingLocationId: 3
    })).toEqual([activeLocations[2]]);
  });

  it('returns only matching branches when pin scope is all_matching_branches', () => {
    expect(selectDiscoveryPinLocations({
      activeLocations,
      hasSearchQuery: true,
      pinScope: 'all_matching_branches',
      matchingLocationIds: [2, 3]
    })).toEqual([activeLocations[1], activeLocations[2]]);
  });

  it('keeps all active branches in all_matching_branches scope when no item-match ids are present', () => {
    expect(selectDiscoveryPinLocations({
      activeLocations,
      hasSearchQuery: true,
      pinScope: 'all_matching_branches',
      matchingLocationIds: []
    })).toEqual(activeLocations);
  });

  it('returns primary branch when pin scope is tenant_primary', () => {
    expect(selectDiscoveryPinLocations({
      activeLocations,
      hasSearchQuery: true,
      pinScope: 'tenant_primary'
    })).toEqual([activeLocations[0]]);
  });

  it('returns primary branch for tenant_primary even before search is active', () => {
    expect(selectDiscoveryPinLocations({
      activeLocations,
      hasSearchQuery: false,
      pinScope: 'tenant_primary'
    })).toEqual([activeLocations[0]]);
  });
});

describe('getDiscoveryMatchBadges', () => {
  it('returns store+item and in-stock badges for mixed matches', () => {
    expect(getDiscoveryMatchBadges({
      match_reasons: ['store', 'item'],
      has_in_stock_match: true
    }, true)).toEqual([
      { key: 'reason-both', label: 'Store + Item match', tone: 'teal' },
      { key: 'stock-state', label: 'In-stock match', tone: 'emerald' }
    ]);
  });

  it('returns empty badges when no search query is active', () => {
    expect(getDiscoveryMatchBadges({ match_reasons: ['item'] }, false)).toEqual([]);
  });
});

describe('location + empty-state helpers', () => {
  it('prefers first scoped pin location id for store navigation', () => {
    expect(getPreferredDiscoveryLocationId({
      store: { nearest_matching_location_id: 4, nearest_location_id: 5 },
      storePins: [{ location_id: 2 }, { location_id: 7 }]
    })).toBe(2);
  });

  it('provides recovery guidance in search empty-state message', () => {
    expect(getDiscoveryEmptyStateMessage('milk')).toContain('No stores matched "milk"');
  });
});

describe('buildDiscoveryResultsRendererProps', () => {
  it('preserves results-panel state and the cluster clear action', () => {
    const clearDiscoveryClusterResults = () => {};
    const props = buildDiscoveryResultsRendererProps({
      clearDiscoveryClusterResults,
      clusterResultStores: [],
      getDiscoveryMarkerKey: () => '',
      isClusterResultsActive: false,
      isMobileResultsCollapsed: true,
      searchedDiscoveryMapPins: []
    });

    expect(props.clearDiscoveryClusterResults).toBe(clearDiscoveryClusterResults);
    expect(props.isMobileResultsCollapsed).toBe(true);
  });
});
