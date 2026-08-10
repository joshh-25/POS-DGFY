const normalizePublicSearchText = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const PUBLIC_SEARCH_ALIAS_GROUPS = Object.freeze([
    ['aircon', 'air con', 'a c', 'ac', 'a/c', 'air conditioning', 'air conditioner'],
    ['seafood', 'shrimp', 'prawn', 'fish', 'crab', 'squid', 'calamari', 'sushi', 'salmon', 'tuna', 'oyster', 'mussel', 'clam', 'lobster'],
    ['italian', 'pasta', 'pizza', 'spaghetti', 'lasagna', 'risotto'],
    ['dessert', 'sweets', 'cake', 'pastry', 'ice cream', 'halo halo', 'halo-halo'],
    ['breakfast', 'brunch', 'silog', 'tapsilog', 'pancake', 'waffle'],
    ['vegan', 'vegetarian', 'plant based', 'meatless'],
    ['spicy', 'hot', 'chili', 'sisig', 'bicol express'],
    ['beverage', 'drinks', 'juice', 'milk tea', 'coffee', 'smoothie']
]);

export const expandPublicSearchText = (value) => {
    const normalized = normalizePublicSearchText(value);
    if (!normalized) return '';
    const terms = new Set([normalized]);
    PUBLIC_SEARCH_ALIAS_GROUPS.forEach((group) => {
        const normalizedGroup = group.map((entry) => normalizePublicSearchText(entry)).filter(Boolean);
        if (normalizedGroup.some((term) => normalized.includes(term))) {
            normalizedGroup.forEach((term) => terms.add(term));
        }
    });
    return Array.from(terms).join(' ');
};

export const getPublicSearchQueryVariants = (value) => {
    const normalized = normalizePublicSearchText(value);
    if (!normalized) return [];
    const terms = new Set([normalized]);
    PUBLIC_SEARCH_ALIAS_GROUPS.forEach((group) => {
        const normalizedGroup = group.map((entry) => normalizePublicSearchText(entry)).filter(Boolean);
        if (normalizedGroup.some((term) => normalized.includes(term))) {
            normalizedGroup.forEach((term) => terms.add(term));
        }
    });
    return Array.from(terms)
        .map((entry) => entry.trim())
        .filter(Boolean);
};

const containsPublicSearchTerm = (searchable, term) => {
    if (!searchable || !term) return false;
    if (/^[a-z0-9]{1,2}$/i.test(term)) {
        return searchable.split(/\s+/).includes(term);
    }
    return searchable.includes(term);
};

export const publicSearchTextMatches = (searchableValue, queryValue) => {
    const searchable = expandPublicSearchText(searchableValue);
    const queryVariants = getPublicSearchQueryVariants(queryValue);
    return queryVariants.some((term) => containsPublicSearchTerm(searchable, term));
};

// Returns the category "head" term (a group's first entry, e.g. 'seafood') for every
// alias group whose non-head terms appear in `text` — used to auto-tag a catalog item
// with its broad category alias (e.g. an item named "Grilled Shrimp" gets tagged
// 'seafood') without aliasing it to sibling terms like 'crab', which would be a false
// match. Never returns a head for text that only contains the head itself (no-op).
export const matchCuisineCategoryHeads = (text) => {
    const normalized = normalizePublicSearchText(text);
    if (!normalized) return [];
    const heads = new Set();
    PUBLIC_SEARCH_ALIAS_GROUPS.forEach((group) => {
        const [head, ...rest] = group.map((entry) => normalizePublicSearchText(entry)).filter(Boolean);
        if (!head) return;
        if (rest.some((term) => normalized.includes(term))) {
            heads.add(head);
        }
    });
    return Array.from(heads);
};

export default {
    expandPublicSearchText,
    getPublicSearchQueryVariants,
    matchCuisineCategoryHeads,
    publicSearchTextMatches
};
