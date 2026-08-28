import { hasPlottableCoordinate } from '../../discovery/model/discoveryMapLayers.js';

/**
 * Build the business-information map input from the selected tenant location.
 *
 * A multi-location storefront must never fall back to the tenant profile's
 * coordinate or another branch when the selected location is unavailable.
 * Single-location storefronts may use the profile row because it represents
 * that one location and there is no competing branch context.
 */
export function buildSelectedStorefrontMapStores({
  mapPublicationDisabled = false,
  selectedLocation = null,
  selectedStore = null,
  storeLocations = []
} = {}) {
  if (mapPublicationDisabled) return [];

  const locations = Array.isArray(storeLocations) ? storeLocations : [];
  const mapLocation = selectedLocation || (locations.length === 0 ? selectedStore : null);
  if (!mapLocation || !hasPlottableCoordinate(mapLocation.latitude, mapLocation.longitude, { allowProvisionedPlaceholder: true })) return [];

  return [{
    ...mapLocation,
    tenant_name: selectedStore?.tenant_name ?? mapLocation.tenant_name,
    workflow_mode: selectedStore?.workflow_mode ?? mapLocation.workflow_mode,
    business_mode: selectedStore?.business_mode ?? mapLocation.business_mode
  }];
}
