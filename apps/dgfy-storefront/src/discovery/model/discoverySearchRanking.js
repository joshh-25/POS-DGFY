import Fuse from 'fuse.js';

const STORE_SEARCH_KEYS = [
  { name: 'tenant_name', weight: 0.9 },
  { name: 'storefront_categories', weight: 0.5 },
  { name: 'matching_item_sample', weight: 0.6 },
  { name: 'address_line', weight: 0.2 }
];

const FUSE_OPTIONS = {
  includeScore: true,
  threshold: 0.45,
  minMatchCharLength: 2,
  ignoreLocation: true,
  keys: STORE_SEARCH_KEYS
};

const WORST_RELEVANCE_SCORE = 1;

export const RELEVANCE_DISTANCE_PENALTY_KM = 2;

const normalizeQuery = (value) => String(value || '').trim();

const flattenMatchingItemSample = (store) => (
  Array.isArray(store?.matching_item_sample)
    ? store.matching_item_sample.map((item) => String(item?.name || item || '')).join(' ')
    : ''
);

const toSearchableRow = (store) => ({
  store,
  tenant_name: store?.tenant_name || '',
  storefront_categories: Array.isArray(store?.storefront_categories) ? store.storefront_categories.join(' ') : '',
  matching_item_sample: flattenMatchingItemSample(store),
  address_line: store?.address_line || ''
});

export const scoreStoresByRelevance = (stores = [], rawQuery = '') => {
  const rows = Array.isArray(stores) ? stores : [];
  const query = normalizeQuery(rawQuery);
  const scoreMap = new Map();
  if (rows.length === 0) return scoreMap;
  if (!query || query.length < 2) {
    rows.forEach((store) => scoreMap.set(store, 0));
    return scoreMap;
  }

  const fuse = new Fuse(rows.map(toSearchableRow), FUSE_OPTIONS);
  fuse.search(query).forEach((result) => {
    scoreMap.set(result.item.store, Number.isFinite(result.score) ? result.score : WORST_RELEVANCE_SCORE);
  });
  rows.forEach((store) => {
    if (!scoreMap.has(store)) scoreMap.set(store, WORST_RELEVANCE_SCORE);
  });
  return scoreMap;
};

export const getRelevanceWeightedDistanceRank = (store, relevanceByStore) => {
  const distanceKm = Number.isFinite(Number(store?.nearest_distance_km))
    ? Number(store.nearest_distance_km)
    : Number.POSITIVE_INFINITY;
  const relevance = relevanceByStore?.get(store) ?? 0;
  return distanceKm + relevance * RELEVANCE_DISTANCE_PENALTY_KM;
};

export default {
  scoreStoresByRelevance,
  getRelevanceWeightedDistanceRank,
  RELEVANCE_DISTANCE_PENALTY_KM
};
