import { mergeMenuImportItems, normalizeItemName, levenshteinDistance } from '../src/modules/menuImport/support/mergeMenuImportItems.js';

const item = (overrides = {}) => ({
    name: 'Chicken Adobo',
    price: 180,
    section: 'Mains',
    description: null,
    ...overrides
});

describe('normalizeItemName', () => {
    it('trims, collapses whitespace, and lowercases', () => {
        expect(normalizeItemName('  Chicken   Adobo  ')).toBe('chicken adobo');
    });

    it('treats a missing name as an empty string', () => {
        expect(normalizeItemName(undefined)).toBe('');
    });
});

describe('levenshteinDistance', () => {
    it('is 0 for identical strings', () => {
        expect(levenshteinDistance('adobo', 'adobo')).toBe(0);
    });

    it('counts a single substitution as distance 1', () => {
        expect(levenshteinDistance('adobo', 'adoba')).toBe(1);
    });

    it('handles empty strings', () => {
        expect(levenshteinDistance('', 'abc')).toBe(3);
        expect(levenshteinDistance('abc', '')).toBe(3);
    });
});

describe('mergeMenuImportItems', () => {
    it('returns empty results for an empty batch', () => {
        const result = mergeMenuImportItems([]);
        expect(result).toEqual({
            mergedItems: [],
            conflicts: [],
            nearDuplicates: [],
            itemsBeforeDedup: 0,
            itemsAfterDedup: 0
        });
    });

    it('leaves distinct items alone', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180 }),
            item({ name: 'Beef Caldereta', price: 220 })
        ]);
        expect(result.itemsBeforeDedup).toBe(2);
        expect(result.itemsAfterDedup).toBe(2);
        expect(result.conflicts).toEqual([]);
        expect(result.mergedItems.map((m) => m.name)).toEqual(['Chicken Adobo', 'Beef Caldereta']);
        expect(result.mergedItems.every((m) => m.price_conflict === false)).toBe(true);
    });

    it('merges same-name same-price items from different files into one row', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180 }),
            item({ name: '  chicken   adobo ', price: 180 })
        ]);
        expect(result.itemsBeforeDedup).toBe(2);
        expect(result.itemsAfterDedup).toBe(1);
        expect(result.mergedItems).toEqual([
            expect.objectContaining({ name: 'Chicken Adobo', price: 180, price_conflict: false })
        ]);
        expect(result.conflicts).toEqual([]);
    });

    it('surfaces a price conflict instead of silently resolving it', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180 }),
            item({ name: 'Chicken Adobo', price: 185 })
        ]);
        expect(result.itemsAfterDedup).toBe(1);
        expect(result.mergedItems[0]).toMatchObject({
            name: 'Chicken Adobo',
            price: 180, // first-seen price is the editable placeholder
            price_conflict: true,
            observed_prices: [180, 185]
        });
        expect(result.conflicts).toEqual([
            { name: 'Chicken Adobo', chosen_price: 180, observed_prices: [180, 185], index: 0 }
        ]);
    });

    it('does not treat differing prices among distinct near-miss names as a near-duplicate', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180 }),
            item({ name: 'Chicken Adobe', price: 220 }) // 1 char off, different price
        ]);
        expect(result.nearDuplicates).toEqual([]);
    });

    it('flags a near-duplicate only when names are within edit distance 2 AND price matches', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180 }),
            item({ name: 'Chicken Adobe', price: 180 }) // 1 char off, same price
        ]);
        expect(result.nearDuplicates).toEqual([
            { name_a: 'Chicken Adobo', name_b: 'Chicken Adobe', price: 180, index_a: 0, index_b: 1 }
        ]);
    });

    it('does not flag names further than edit distance 2 apart as near-duplicates', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180 }),
            item({ name: 'Beef Caldereta', price: 180 })
        ]);
        expect(result.nearDuplicates).toEqual([]);
    });

    it('keeps the first-seen section/description for a merged group', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180, section: 'Mains', description: 'From file A' }),
            item({ name: 'Chicken Adobo', price: 180, section: 'Entrees', description: 'From file B' })
        ]);
        expect(result.mergedItems[0]).toMatchObject({ section: 'Mains', description: 'From file A' });
    });

    it('takes the first NON-NULL section, not merely the first-seen occurrence', () => {
        // A dish photographed on two pages may only carry its heading on one of
        // them — seeding from the first-seen copy left it uncategorized.
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180, section: null, description: null }),
            item({ name: 'Chicken Adobo', price: 180, section: 'Mains', description: 'From file B' })
        ]);
        expect(result.mergedItems[0]).toMatchObject({ section: 'Mains', description: 'From file B' });
    });

    it('prefers a printed section over one the model inferred, regardless of file order', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180, section: 'Guessed', section_inferred: true }),
            item({ name: 'Chicken Adobo', price: 180, section: 'Mains', section_inferred: false })
        ]);
        expect(result.mergedItems[0]).toMatchObject({ section: 'Mains', section_inferred: false });
    });

    it('keeps an inferred section when no printed one exists anywhere in the group', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180, section: null }),
            item({ name: 'Chicken Adobo', price: 180, section: 'Mains', section_inferred: true })
        ]);
        expect(result.mergedItems[0]).toMatchObject({ section: 'Mains', section_inferred: true });
    });

    it('does not split one dish into two rows just because it appeared under two headings', () => {
        const result = mergeMenuImportItems([
            item({ name: 'Chicken Adobo', price: 180, section: 'Mains' }),
            item({ name: 'Chicken Adobo', price: 180, section: 'House Specials' })
        ]);
        expect(result.mergedItems).toHaveLength(1);
        expect(result.itemsAfterDedup).toBe(1);
    });
});
