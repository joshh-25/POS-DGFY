export {
  buildStoresWithNearestBranch,
  filterDiscoveryStores,
  sortDiscoveryResultStores
} from './discoveryStoreResultsModel.js';

export {
  buildDiscoveryMapPins,
  buildFallbackDiscoveryMapPins,
  buildHeroDiscoveryMapPins,
  groupDiscoveryPinsBySlug
} from './discoveryPinResultsModel.js';

export function buildDiscoverySummary(filteredDiscoveryStores) {
  const totalStores = filteredDiscoveryStores.length;
  const openStores = filteredDiscoveryStores.filter((store) => store.storefront_open).length;
  const totalCatalogItems = filteredDiscoveryStores.reduce((sum, store) => sum + Number(store.catalog_count || 0), 0);
  const waitTotals = filteredDiscoveryStores.reduce((sum, store) => sum + Number(store.estimated_wait_minutes || 0), 0);
  const avgWait = totalStores > 0 ? Math.round(waitTotals / totalStores) : 0;
  return { totalStores, openStores, totalCatalogItems, avgWait };
}

export function getNearestDistanceKm(filteredDiscoveryStores) {
  const withDistance = filteredDiscoveryStores
    .map((store) => Number(store?.nearest_distance_km))
    .filter((distance) => Number.isFinite(distance));
  if (withDistance.length === 0) return null;
  return Math.min(...withDistance);
}

export function getHighlightedStore({ filteredDiscoveryStores, highlightedStoreSlug }) {
  if (!filteredDiscoveryStores.length) return null;
  if (!highlightedStoreSlug) return filteredDiscoveryStores[0];
  return filteredDiscoveryStores.find((store) => store.slug === highlightedStoreSlug) || filteredDiscoveryStores[0];
}
