import { describe, expect, it } from 'vitest';
import { buildSelectedStorefrontMapStores } from './storefrontMapModel.js';

const locations = [
  { location_id: 1, name: 'Main Branch', latitude: 10.699817, longitude: 122.559893 },
  { location_id: 2, name: 'Second Branch', latitude: 10.71711903, longitude: 122.54796721 }
];

describe('buildSelectedStorefrontMapStores', () => {
  it('returns only the selected branch coordinates', () => {
    expect(buildSelectedStorefrontMapStores({
      selectedLocation: locations[1],
      selectedStore: { tenant_name: 'Space Bar' },
      storeLocations: locations
    })).toEqual([{
      ...locations[1],
      tenant_name: 'Space Bar',
      workflow_mode: undefined,
      business_mode: undefined
    }]);
  });

  it('does not fall back to another branch when the selected location is missing', () => {
    expect(buildSelectedStorefrontMapStores({
      selectedLocation: null,
      selectedStore: { latitude: locations[0].latitude, longitude: locations[0].longitude },
      storeLocations: locations
    })).toEqual([]);
  });

  it('uses a single-location profile coordinate when no location list exists', () => {
    expect(buildSelectedStorefrontMapStores({
      selectedLocation: null,
      selectedStore: { location_id: 1, latitude: locations[0].latitude, longitude: locations[0].longitude },
      storeLocations: []
    })).toEqual([{
      location_id: 1,
      latitude: locations[0].latitude,
      longitude: locations[0].longitude,
      workflow_mode: undefined,
      business_mode: undefined
    }]);
  });
});
