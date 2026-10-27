import { useEffect } from 'react';

export function useDiscoveryHighlightSync({
  activeDiscoveryMapPins,
  filteredDiscoveryStores,
  getDiscoveryMarkerKey,
  highlightedDiscoveryMarkerKey,
  highlightedStoreSlug,
  preserveDiscoveryCamera = false,
  setHighlightedDiscoveryMarkerKey,
  setHighlightedStoreSlug
}) {
  useEffect(() => {
    // Cancellation returns to an unselected hero map. Keep it clear rather than
    // immediately auto-highlighting the first native pin; an explicit search
    // or location action releases this preservation state.
    if (preserveDiscoveryCamera) return;

    if (!filteredDiscoveryStores.length) {
      setHighlightedStoreSlug('');
      setHighlightedDiscoveryMarkerKey('');
      return;
    }

    if (!highlightedStoreSlug || !filteredDiscoveryStores.some((store) => store.slug === highlightedStoreSlug)) {
      setHighlightedStoreSlug(filteredDiscoveryStores[0].slug);
    }

    if (!highlightedDiscoveryMarkerKey || !activeDiscoveryMapPins.some((pin) => getDiscoveryMarkerKey(pin) === highlightedDiscoveryMarkerKey)) {
      setHighlightedDiscoveryMarkerKey(getDiscoveryMarkerKey(activeDiscoveryMapPins[0]) || '');
    }
  }, [
    activeDiscoveryMapPins,
    filteredDiscoveryStores,
    getDiscoveryMarkerKey,
    highlightedDiscoveryMarkerKey,
    highlightedStoreSlug,
    preserveDiscoveryCamera,
    setHighlightedDiscoveryMarkerKey,
    setHighlightedStoreSlug
  ]);
}
