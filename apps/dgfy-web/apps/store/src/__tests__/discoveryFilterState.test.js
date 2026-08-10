import { describe, expect, it } from 'vitest';
import { getDiscoveryFilterState } from '../discovery/model/discoveryResultsModel.js';

describe('getDiscoveryFilterState distance filter', () => {
  const baseArgs = {
    discoverySortBy: 'nearest',
    discoveryCategoryFilter: 'all',
    discoveryOpenFilter: 'all',
    discoveryDistanceFilter: 'all',
    discoveryRatingFilter: 'all',
    discoveryAvailabilityFilter: 'all'
  };

  it('is inactive and excluded from the count/reset state by default', () => {
    const state = getDiscoveryFilterState(baseArgs);
    expect(state.isDistanceFilterActive).toBe(false);
    expect(state.hasActiveDiscoveryFilters).toBe(false);
    expect(state.activeDiscoveryFilterCount).toBe(0);
  });

  it('becomes active and increments the count/reset state when set to a radius', () => {
    const state = getDiscoveryFilterState({ ...baseArgs, discoveryDistanceFilter: '3' });
    expect(state.isDistanceFilterActive).toBe(true);
    expect(state.hasActiveDiscoveryFilters).toBe(true);
    expect(state.activeDiscoveryFilterCount).toBe(1);
  });

  it('stacks with other active filters in the count', () => {
    const state = getDiscoveryFilterState({
      ...baseArgs,
      discoveryDistanceFilter: '5',
      discoveryOpenFilter: 'open',
      discoveryCategoryFilter: 'food'
    });
    expect(state.activeDiscoveryFilterCount).toBe(3);
  });
});
