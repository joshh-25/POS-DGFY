/**
 * Search Synonyms Configuration
 * 
 * Define mappings for complex word variations to make the AI search more intelligent.
 * This allows "hidden" connections between user slang/terms and database values.
 * 
 * Format:
 * 'user_term': ['db_term1', 'db_term2']
 * 
 * The system will automatically search for ALL mapped terms when the user_term is found.
 */
export const SYNONYMS = {
    // Herbal products
    'herbs': ['herb', 'herbal'],
    'tea': ['blend', 'leaf', 'leaves', 'bag'],

    // Packaging
    'box': ['carton', 'container', 'case'],
    'boxes': ['carton', 'container', 'case'],
    'wrap': ['film', 'shrink'],

    // Common adjustments
    'fizzy': ['carbonated', 'sparkling'],
    'bubbly': ['carbonated', 'sparkling'],

    // Add your own complex variations below:
    // 'slang_word': ['official_sku_term'],
};

/**
 * Helper to get all variations for a term including the term itself
 */
export const getVariations = (term) => {
    const lowerTerm = term.toLowerCase();
    const variations = new Set([term]); // Start with original

    // Add synonyms if they exist
    if (SYNONYMS[lowerTerm]) {
        SYNONYMS[lowerTerm].forEach(v => variations.add(v));
    }

    // Basic plural handling (can be kept here or in service)
    if (lowerTerm.endsWith('s')) variations.add(term.slice(0, -1));

    return Array.from(variations);
};
