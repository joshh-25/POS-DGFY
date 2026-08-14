import { describe, expect, it } from 'vitest';
import { buildStorefrontLoadFailureState } from '../shared/model/storefrontLoadState.js';

describe('buildStorefrontLoadFailureState', () => {
  it('keeps the loaded industry profile when catalog loading fails', () => {
    const profile = { slug: 'abeezee-bb983b', workflow_mode: 'services' };
    const locations = [{ location_id: 2, name: 'Mandurriao Branch' }];

    expect(buildStorefrontLoadFailureState({
      profile,
      profileLocations: locations,
      errorMessage: 'Failed to load tenant catalog.'
    })).toEqual({
      selectedStore: profile,
      storeLocations: locations,
      catalog: [],
      catalogError: 'Failed to load tenant catalog.'
    });
  });

  it('clears the profile when the profile itself did not load', () => {
    expect(buildStorefrontLoadFailureState({
      errorMessage: 'Failed to load tenant storefront page.'
    })).toEqual({
      selectedStore: null,
      storeLocations: [],
      catalog: [],
      catalogError: 'Failed to load tenant storefront page.'
    });
  });
});
