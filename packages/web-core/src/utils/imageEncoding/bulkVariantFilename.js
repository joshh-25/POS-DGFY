/**
 * Client-side mirror of the server's bulk-catalog-image-upload filename convention
 * (apps/dgfy-api/src/modules/shared/utils/bulkCatalogImageFilename.js's `getSkuStem`/
 * `parseBulkCatalogFilename`) -- #1643, epic #265's 298d.
 *
 * Keep the stem-extraction rule ("slice at the last dot") textually in sync with the server's own
 * `getSkuStem`; a divergence here would silently break the round trip between what the client
 * names a converted variant file and what the server's own parser expects to see.
 */

const getFilenameStem = (originalFilename = '') => {
  const name = String(originalFilename || '').trim();
  const lastDot = name.lastIndexOf('.');
  const stem = lastDot > 0 ? name.slice(0, lastDot) : name;
  return stem.trim();
};

const getFilenameExtension = (originalFilename = '') => {
  const name = String(originalFilename || '').trim();
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(lastDot) : '';
};

/**
 * Builds the `<SKU>__<variantKey><ext>` filename the server's bulk convention expects.
 *
 * Fixed (pr-reviewer RF-2, PR #1676): builds off `parseBulkVariantFilename`'s already-stripped
 * `skuStem`, not the raw filename stem -- an originally-selected file that already carries a
 * known variant suffix (e.g. `SKU__large.jpg`, a valid opt-in-signal filename under today's
 * ungated bulk convention) previously got a *second* suffix appended
 * (`SKU__large__large.jpg`), which the server's own `parseBulkCatalogFilename` would then
 * misparse as SKU stem `SKU__large` instead of `SKU` -- turning a valid optimized upload into an
 * unmatched/wrong-SKU one. Stripping first means `SKU__large.jpg` correctly produces
 * `SKU__large.jpg`/`SKU__medium.jpg`/`SKU__thumbnail.jpg`, matching what a bare `SKU.jpg` source
 * would produce.
 *
 * Known, shared limitation that remains (matches the server's own documented caveat,
 * pr-reviewer RF-3, PR #1641): a SKU that *legitimately* ends in `__large`/`__medium`/
 * `__thumbnail` as part of its own code (e.g. a SKU literally named `WIDGET__large`) is still
 * indistinguishable from a variant-suffixed upload for the shorter SKU `WIDGET` -- this fix
 * cannot and does not resolve that ambiguity, it only stops this function from *creating* a new,
 * avoidable instance of it out of an already-unambiguous source filename.
 *
 * @param {string} originalFilename
 * @param {'large'|'medium'|'thumbnail'} variantKey
 * @returns {string}
 */
export function buildBulkVariantFilename(originalFilename, variantKey) {
  const { skuStem } = parseBulkVariantFilename(originalFilename);
  const ext = getFilenameExtension(originalFilename);
  return `${skuStem}__${variantKey}${ext}`;
}

const BULK_VARIANT_KEYS = new Set(['large', 'medium', 'thumbnail']);

/**
 * Client-side mirror of the server's `parseBulkCatalogFilename` -- strips a known
 * `__large`/`__medium`/`__thumbnail` suffix (if present) off the filename stem, the same way the
 * server does before it groups a batch by SKU.
 *
 * @param {string} originalFilename
 * @returns {{skuStem: string, variantKey: ('large'|'medium'|'thumbnail'|null)}}
 */
export function parseBulkVariantFilename(originalFilename) {
  const stem = getFilenameStem(originalFilename);
  const lastDoubleUnderscore = stem.lastIndexOf('__');
  if (lastDoubleUnderscore <= 0) {
    return { skuStem: stem, variantKey: null };
  }

  const suffix = stem.slice(lastDoubleUnderscore + 2).trim().toLowerCase();
  if (!BULK_VARIANT_KEYS.has(suffix)) {
    return { skuStem: stem, variantKey: null };
  }

  const skuStem = stem.slice(0, lastDoubleUnderscore).trim();
  if (!skuStem) {
    return { skuStem: stem, variantKey: null };
  }

  return { skuStem, variantKey: suffix };
}

/**
 * Case-insensitive grouping key for "does this originally-selected file share a SKU stem with
 * another one" -- used by bulkCatalogUpload.js's pre-conversion grouping pass (see
 * bulkBatchSplitter.js's "grouping-unit correctness requirement" doc comment for why this has to
 * run before conversion/splitting, not after). Mirrors the server's own
 * `groupBulkCatalogFilesBySku`, which keys its Map by `skuCode.toUpperCase()`.
 *
 * @param {string} originalFilename
 * @returns {string}
 */
export function getBulkFileGroupingKey(originalFilename) {
  return parseBulkVariantFilename(originalFilename).skuStem.toUpperCase();
}
