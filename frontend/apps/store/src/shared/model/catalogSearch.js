import Fuse from 'fuse.js';

import { getCatalogSearchQueryVariants } from './catalogSearchSynonyms.js';

// Fields searched across storefront catalog items, ordered by match priority.
// sku / sku_code / item_code / code cover the many field-name variants that
// can appear across different tenant catalog payloads. category_label pulls
// whichever merchant-facing category/folder field is present on the item
// (categoryMeta.label / category_name / folder_name / category), since the
// exact field name varies by business mode and catalog source.
const CATALOG_SEARCH_KEYS = [
  { name: 'sku_code',    weight: 0.9 },
  { name: 'sku',         weight: 0.9 },
  { name: 'item_code',   weight: 0.9 },
  { name: 'code',        weight: 0.8 },
  { name: 'name',        weight: 0.7 },
  { name: 'description', weight: 0.3 },
  {
    name: 'category_label',
    weight: 0.5,
    getFn: (item) => String(
      item?.categoryMeta?.label || item?.category_name || item?.folder_name || item?.category || ''
    )
  },
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

// Builds a lowercase haystack across the same fields Fuse fuzzy-matches, used
// only for exact-substring synonym matching (see below) — never for fuzzy
// scoring, so it can't affect existing fuzzy-search relevance ordering.
const buildCategorySearchHaystack = (item) => CATALOG_SEARCH_KEYS
  .map((key) => (key.getFn ? key.getFn(item) : item?.[key.name]))
  .filter(Boolean)
  .join(' ')
  .toLowerCase();

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
  const fuzzyItems = fuse.search(query).map((result) => result.item);

  // Cuisine/category synonym terms (e.g. "seafood" -> "shrimp") are matched by
  // exact substring inclusion, not fuzzy search — fuzzy-matching short, generic
  // synonym words against every field independently produces false positives
  // (e.g. "hot"/"cake" incidentally fuzzy-matching unrelated item names).
  const synonymVariants = getCatalogSearchQueryVariants(query)
    .map((variant) => variant.toLowerCase())
    .filter((variant) => variant !== query.toLowerCase());
  if (synonymVariants.length === 0) return fuzzyItems;

  const fuzzyItemSet = new Set(fuzzyItems);
  const synonymOnlyItems = catalog.filter((item) => {
    if (fuzzyItemSet.has(item)) return false;
    const haystack = buildCategorySearchHaystack(item);
    return synonymVariants.some((variant) => haystack.includes(variant));
  });

  return [...fuzzyItems, ...synonymOnlyItems];
};

export default {
  filterCatalogItems
};
