/**
 * Merges a batch job's per-file extracted items into one deduped list,
 * keyed on normalized name alone (not name+price — two photos of the same
 * item routinely disagree on price by one OCR digit). Price conflicts are
 * surfaced on the merged row (never silently resolved), and near-duplicates
 * (Levenshtein <=2, matching price) are flagged for review only — never
 * auto-merged. Pure function, no I/O.
 *
 * Section (the item's menu category) is deliberately NOT part of the dedup key:
 * a dish printed under two headings is still one item. The merged row takes the
 * best available section across the group — see the loop below.
 */

const roundPrice = (value) => Math.round(Number(value) * 100) / 100;

export const normalizeItemName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const levenshteinDistance = (a, b) => {
    const s = String(a || '');
    const t = String(b || '');
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;

    let prevRow = Array.from({ length: t.length + 1 }, (_, j) => j);
    for (let i = 1; i <= s.length; i += 1) {
        const currRow = [i];
        for (let j = 1; j <= t.length; j += 1) {
            const substitutionCost = s[i - 1] === t[j - 1] ? 0 : 1;
            currRow[j] = Math.min(
                currRow[j - 1] + 1,
                prevRow[j] + 1,
                prevRow[j - 1] + substitutionCost
            );
        }
        prevRow = currRow;
    }
    return prevRow[t.length];
};

export const mergeMenuImportItems = (items = []) => {
    const itemsBeforeDedup = items.length;
    const groups = new Map();
    const groupOrder = [];

    for (const item of items) {
        const normalized = normalizeItemName(item?.name);
        if (!groups.has(normalized)) {
            groups.set(normalized, {
                name: item.name,
                section: null,
                section_inferred: false,
                description: null,
                prices: []
            });
            groupOrder.push(normalized);
        }
        const group = groups.get(normalized);
        group.prices.push(roundPrice(item?.price));

        // Section/description are filled from the first occurrence that actually
        // HAS one, not simply the first occurrence. A dish photographed on two
        // pages may only carry its heading on one of them; seeding from the
        // first-seen copy left such items uncategorized for no good reason.
        // Among candidates, a section printed on the menu outranks one the model
        // inferred from the item name, whichever file it came from.
        const itemSection = item?.section ?? null;
        const itemInferred = item?.section_inferred === true;
        if (itemSection && (!group.section || (group.section_inferred && !itemInferred))) {
            group.section = itemSection;
            group.section_inferred = itemInferred;
        }
        if (!group.description && item?.description) {
            group.description = item.description;
        }
    }

    const mergedItems = [];
    const conflicts = [];

    groupOrder.forEach((normalized, index) => {
        const group = groups.get(normalized);
        const observedPrices = [...new Set(group.prices)].sort((a, b) => a - b);
        const chosenPrice = group.prices[0];
        const priceConflict = observedPrices.length > 1;

        const mergedItem = {
            name: group.name,
            price: chosenPrice,
            section: group.section,
            section_inferred: group.section_inferred,
            description: group.description,
            price_conflict: priceConflict
        };
        if (priceConflict) {
            mergedItem.observed_prices = observedPrices;
            conflicts.push({ name: group.name, chosen_price: chosenPrice, observed_prices: observedPrices, index });
        }
        mergedItems.push(mergedItem);
    });

    const nearDuplicates = [];
    for (let i = 0; i < mergedItems.length; i += 1) {
        for (let j = i + 1; j < mergedItems.length; j += 1) {
            const a = mergedItems[i];
            const b = mergedItems[j];
            if (a.price !== b.price) continue;
            if (levenshteinDistance(normalizeItemName(a.name), normalizeItemName(b.name)) <= 2) {
                nearDuplicates.push({ name_a: a.name, name_b: b.name, price: a.price, index_a: i, index_b: j });
            }
        }
    }

    return {
        mergedItems,
        conflicts,
        nearDuplicates,
        itemsBeforeDedup,
        itemsAfterDedup: mergedItems.length
    };
};

export default mergeMenuImportItems;
