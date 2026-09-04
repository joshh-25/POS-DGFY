// Cuisine/category synonym groups for in-store catalog search approximation
// (e.g. searching "seafood" also surfaces menu items filed under a "Seafood"
// folder/category, or named "shrimp"/"crab"/etc.).
//
// Mirrors backend/src/modules/shared/utils/publicSearchAliasPolicy.js
// PUBLIC_SEARCH_ALIAS_GROUPS. There is no shared package between frontend/
// and backend/, so this list is intentionally duplicated (same pattern as
// modeItemTaxonomy.js) — keep both lists in sync when adding groups.
export const CATALOG_SEARCH_SYNONYM_GROUPS = Object.freeze([
  ['aircon', 'air con', 'a c', 'ac', 'a/c', 'air conditioning', 'air conditioner'],
  ['seafood', 'shrimp', 'prawn', 'fish', 'crab', 'squid', 'calamari', 'sushi', 'salmon', 'tuna', 'oyster', 'mussel', 'clam', 'lobster'],
  ['italian', 'pasta', 'pizza', 'spaghetti', 'lasagna', 'risotto'],
  ['dessert', 'sweets', 'cake', 'pastry', 'ice cream', 'halo halo', 'halo-halo'],
  ['breakfast', 'brunch', 'silog', 'tapsilog', 'pancake', 'waffle'],
  ['vegan', 'vegetarian', 'plant based', 'meatless'],
  ['spicy', 'hot', 'chili', 'sisig', 'bicol express'],
  ['beverage', 'drinks', 'juice', 'milk tea', 'coffee', 'smoothie']
]);

// Given a raw query, returns [query] when it doesn't match any known group,
// or [query, ...group terms] when it does — so callers can search each
// variant and merge results.
export const getCatalogSearchQueryVariants = (rawQuery) => {
  const query = String(rawQuery || '').trim();
  if (!query) return [];
  const normalized = query.toLowerCase();
  const terms = new Set([query]);
  CATALOG_SEARCH_SYNONYM_GROUPS.forEach((group) => {
    if (group.some((term) => normalized.includes(term))) {
      group.forEach((term) => terms.add(term));
    }
  });
  return Array.from(terms);
};

export default {
  CATALOG_SEARCH_SYNONYM_GROUPS,
  getCatalogSearchQueryVariants
};
