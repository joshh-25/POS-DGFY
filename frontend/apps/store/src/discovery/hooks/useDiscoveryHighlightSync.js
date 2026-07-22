import { useEffect } from 'react';

export function useDiscoveryHighlightSync({
  activeDiscoveryMapPins,
  filteredDiscoveryStores,
  getDiscoveryMarkerKey,
  highlightedDiscoveryMarkerKey,
  highlightedStoreSlug,
  setHighlightedDiscoveryMarkerKey,
  setHighlightedStoreSlug
}) {
  useEffect(() => {
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
    setHighlightedDiscoveryMarkerKey,
    setHighlightedStoreSlug
  ]);
}
