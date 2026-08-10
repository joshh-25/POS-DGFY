// Issue #282, Phase E: split out of TrackingRouteMap.jsx. This helper has
// no maplibre-gl dependency, but living in the same module as the map
// component meant any consumer that only needed the coordinate math (e.g.
// FnbTrackingRoutePage.jsx) still statically pulled in the whole map
// module -- and therefore maplibre-gl -- just to import this function.
// TrackingRouteMap.jsx re-exports this for back-compat with anything
// importing both together; production consumers that only need the
// coordinates should import from here directly to avoid that.
const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const extractTrackingMapCoordinates = (trackingResult, selectedStore, selectedLocation) => {
  const raw = trackingResult?.raw || {};
  const fromTracking = {
    storeLatitude: toNumberOrNull(trackingResult?.storeLatitude ?? raw?.location?.latitude ?? raw?.order?.location_latitude ?? raw?.order?.store_latitude),
    storeLongitude: toNumberOrNull(trackingResult?.storeLongitude ?? raw?.location?.longitude ?? raw?.order?.location_longitude ?? raw?.order?.store_longitude),
    customerLatitude: toNumberOrNull(trackingResult?.customerLatitude ?? raw?.delivery_latitude ?? raw?.order?.delivery_latitude),
    customerLongitude: toNumberOrNull(trackingResult?.customerLongitude ?? raw?.delivery_longitude ?? raw?.order?.delivery_longitude)
  };

  const fromSelection = {
    storeLatitude: toNumberOrNull(selectedLocation?.latitude ?? selectedStore?.latitude),
    storeLongitude: toNumberOrNull(selectedLocation?.longitude ?? selectedStore?.longitude)
  };

  return {
    storePin: (Number.isFinite(fromTracking.storeLatitude) && Number.isFinite(fromTracking.storeLongitude))
      ? { latitude: fromTracking.storeLatitude, longitude: fromTracking.storeLongitude }
      : (Number.isFinite(fromSelection.storeLatitude) && Number.isFinite(fromSelection.storeLongitude))
        ? { latitude: fromSelection.storeLatitude, longitude: fromSelection.storeLongitude }
        : null,
    customerPin: (Number.isFinite(fromTracking.customerLatitude) && Number.isFinite(fromTracking.customerLongitude))
      ? { latitude: fromTracking.customerLatitude, longitude: fromTracking.customerLongitude }
      : null
  };
};
