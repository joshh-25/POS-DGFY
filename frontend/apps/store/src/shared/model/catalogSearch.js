import Fuse from 'fuse.js';

// Fields searched across storefront catalog items, ordered by match priority.
// sku / sku_code / item_code / code cover the many field-name variants that
// can appear across different tenant catalog payloads.
const CATALOG_SEARCH_KEYS = [
  { name: 'sku_code',    weight: 0.9 },
  { name: 'sku',         weight: 0.9 },
  { name: 'item_code',   weight: 0.9 },
  { name: 'code',        weight: 0.8 },
  { name: 'name',        weight: 0.7 },
  { name: 'description', weight: 0.3 },
];

const FUSE_OPTIONS = {
  includeScore: true,
  // 0.4 matches the backend semantic search threshold (itemRepository.js searchByMeaning).
  threshold: 0.4,
  minMatchCharLength: 2,
  ignoreLocation: true,
  keys: CATALOG_SEARCH_KEYS,
};

const normalizeQuery = (value) => String(value || '').trim();

/**
 * Fuzzy-searches a storefront catalog array using Fuse.js.
 *
 * Drop-in replacement for the previous substring-match implementation.
 * Public API is unchanged: filterCatalogItems(catalog, rawQuery) → item[].
 *
 * A new Fuse instance is created per call, which is acceptable because
 * storefront catalogs are small (typically < 200 items) and this function
 * is always called inside a useMemo in StorefrontApp.jsx so React
 * deduplicates calls across renders.
 *
 * @param {Object[]} catalog   - The full storefront catalog array.
 * @param {string}   rawQuery  - Raw search string from the user.
 * @returns {Object[]}         - Filtered items sorted by relevance, or the
 *                               full catalog when the query is empty.
 */
export const filterCatalogItems = (catalog = [], rawQuery = '') => {
  const query = normalizeQuery(rawQuery);
  if (!query || query.length < 2) return Array.isArray(catalog) ? catalog : [];
  if (!Array.isArray(catalog) || catalog.length === 0) return [];

  const fuse = new Fuse(catalog, FUSE_OPTIONS);
  return fuse.search(query).map((result) => result.item);
};

export default {
  filterCatalogItems
};
