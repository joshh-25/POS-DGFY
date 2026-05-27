const normalizePublicSearchText = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const PUBLIC_SEARCH_ALIAS_GROUPS = Object.freeze([
    ['aircon', 'air con', 'a c', 'ac', 'a/c', 'air conditioning', 'air conditioner']
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

export default {
    expandPublicSearchText,
    getPublicSearchQueryVariants,
    publicSearchTextMatches
};
