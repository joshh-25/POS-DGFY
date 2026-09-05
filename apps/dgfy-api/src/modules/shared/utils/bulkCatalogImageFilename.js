// Single source of truth for the bulk-catalog-image-upload filename convention, shared by
// posUseCases.js and storefrontCatalogUseCases.js (both previously carried their own duplicate
// copy of `getSkuStem`). Phase 297 (#265) extends the convention -- documented at
// docs/architecture/adr/0017-customer-access-modes-and-inventory-display.md's newest Amendments
// block -- without breaking it:
//
//   <SKU>.<ext>                 -- today's format, unchanged. No client variants; the server
//                                   derives large/medium/thumbnail from this one file, exactly as
//                                   before this phase.
//   <SKU>__large.<ext>          -- the same file slot as above, but flagged as an already
//                                   client-optimized "large" the server may skip re-encoding.
//   <SKU>__medium.<ext>         -- a companion client-derived medium variant for <SKU>.
//   <SKU>__thumbnail.<ext>      -- a companion client-derived thumbnail variant for <SKU>.
//
// Anything else -- including a SKU that itself legitimately contains "__" but isn't followed by
// one of the three known variant keys -- falls back to "no variant suffix, treat the whole stem
// as the SKU", the same safe default a truly unparseable name gets.
export const BULK_CATALOG_IMAGE_VARIANT_KEYS = Object.freeze(['large', 'medium', 'thumbnail']);

export const getSkuStem = (file = {}) => {
    const originalName = String(file?.originalname || '').trim();
    const lastDot = originalName.lastIndexOf('.');
    const stem = lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
    return stem.trim();
};

/**
 * @param {object} file - a multer file object (only `originalname` is read).
 * @returns {{skuCode: string, variantKey: ('large'|'medium'|'thumbnail'|null)}}
 */
export const parseBulkCatalogFilename = (file = {}) => {
    const stem = getSkuStem(file);
    const lastDoubleUnderscore = stem.lastIndexOf('__');
    if (lastDoubleUnderscore <= 0) {
        return { skuCode: stem, variantKey: null };
    }

    const suffix = stem.slice(lastDoubleUnderscore + 2).trim().toLowerCase();
    if (!BULK_CATALOG_IMAGE_VARIANT_KEYS.includes(suffix)) {
        return { skuCode: stem, variantKey: null };
    }

    const skuCode = stem.slice(0, lastDoubleUnderscore).trim();
    if (!skuCode) {
        return { skuCode: stem, variantKey: null };
    }

    return { skuCode, variantKey: suffix };
};

/**
 * Groups a bulk-catalog-image-upload file batch by SKU, so a caller can move from "one file = one
 * item = one imageStorage.store() call" to "one SKU group (up to one large + one medium + one
 * thumbnail) = one imageStorage.store() call" -- shared between posUseCases.js's and
 * storefrontCatalogUseCases.js's bulk use cases, which were otherwise about to duplicate this
 * grouping/duplicate-detection logic verbatim a second time.
 *
 * @param {object[]} normalizedFiles - multer file objects (only `originalname` is read here).
 * @returns {{
 *   bySku: Map<string, {skuCode: string, slots: {large: object[], medium: object[], thumbnail: object[]}}>,
 *   duplicateReasonBySku: Map<string, 'duplicate_filename'|'duplicate_variant_for_sku'>,
 *   groupOrder: string[]
 * }}
 */
export const groupBulkCatalogFilesBySku = (normalizedFiles) => {
    const bySku = new Map();
    for (const file of normalizedFiles) {
        const { skuCode, variantKey } = parseBulkCatalogFilename(file);
        const skuKey = skuCode.toUpperCase();
        if (!skuKey) continue;
        if (!bySku.has(skuKey)) {
            bySku.set(skuKey, { skuCode, slots: { large: [], medium: [], thumbnail: [] } });
        }
        bySku.get(skuKey).slots[variantKey || 'large'].push(file);
    }

    // Per-group duplicate resolution: a collision in the medium/thumbnail slots, or a `large`
    // slot collision where at least one of the colliding files used an explicit `__large` suffix,
    // is the new duplicate_variant_for_sku failure mode. A `large` slot collision where every
    // colliding file is a bare filename (no suffix at all) stays today's duplicate_filename --
    // unchanged, so two plain `<SKU>.<ext>` files sharing a stem behave exactly as before.
    const duplicateReasonBySku = new Map();
    for (const [skuKey, group] of bySku.entries()) {
        const { large, medium, thumbnail } = group.slots;
        if (medium.length > 1 || thumbnail.length > 1) {
            duplicateReasonBySku.set(skuKey, 'duplicate_variant_for_sku');
            continue;
        }
        if (large.length > 1) {
            const allBare = large.every((file) => !parseBulkCatalogFilename(file).variantKey);
            duplicateReasonBySku.set(skuKey, allBare ? 'duplicate_filename' : 'duplicate_variant_for_sku');
        }
    }

    return { bySku, duplicateReasonBySku, groupOrder: [...bySku.keys()] };
};
