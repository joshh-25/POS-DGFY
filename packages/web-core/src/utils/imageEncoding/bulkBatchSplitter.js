/**
 * Byte-based batch splitter for the bulk catalog image upload path (#1643, epic #265's 298d).
 *
 * Packs same-SKU-stem file groups into as few outgoing HTTP requests as possible while staying
 * under a soft per-request byte target and the server's own file-count-per-request cap. Pure,
 * framework-free, no `api.js` import -- unit-testable in isolation.
 *
 * **Grouping-unit correctness requirement (non-obvious, worth stating plainly):** the packing unit
 * passed in here must already be grouped **per SKU stem**, not per originally-selected file. If
 * two different originally-selected files happen to share a SKU stem (a genuine accidental
 * duplicate, or a bare file plus an explicit `__large` file for the same SKU), today's
 * single-request behavior lets the server's own `groupBulkCatalogFilesBySku` catch it as
 * `duplicate_filename`/`duplicate_variant_for_sku`. If this splitter ever placed those two in
 * *different* HTTP requests, that detection silently stops working (each request only sees its
 * own files) and the second write would just overwrite the first with no error. So: callers must
 * run a same-stem grouping pass over the *original* selected files first (before conversion, see
 * `bulkVariantFilename.js`'s `getBulkFileGroupingKey`), keep every file for one stem together as
 * one atomic packing unit through conversion, and only then call this function. This preserves the
 * server's existing duplicate semantics exactly, regardless of how many requests this splitter
 * ultimately produces.
 */

// ~6 MB per request: no doc or code literally states this number. It's inferred from every
// production nginx server block capping request bodies at `client_max_body_size 8m`
// (infrastructure/docker/nginx/nginx.conf.template, nginx/dgfy.ph.conf, per-app docker nginx
// configs) -- the exact ceiling issue #1408 documents a real 413 incident against (a 16 MB item
// photo, 2026-09-05; a 12 MB one on 2026-09-01). 6 MB leaves ~2 MB of headroom under that 8 MB
// edge cap for multipart boundary/header overhead, without a hard dependency on infra config. See
// ADR 0017's #1643 amendment -- flagged there as a confirmed-reasonable inferred value, not one
// read from a spec.
export const DEFAULT_BULK_BATCH_TARGET_BYTES = 6 * 1024 * 1024;

// Matches the server's `BULK_CATALOG_IMAGE_TRANSPORT_MAX_FILES`
// (apps/dgfy-api/src/config/uploadConfig.js) -- keep these two in sync.
export const DEFAULT_MAX_FILES_PER_BATCH = 50;

const groupByteSize = (group) => (Array.isArray(group?.files) ? group.files : [])
  .reduce((sum, file) => sum + (Number(file?.size) || 0), 0);

/**
 * @param {Array<{ files: File[] }>} groups -- one entry per SKU-stem group; every file in a group
 *   travels in the same output batch (1-3 files: large/medium/thumbnail, or just the bare
 *   original when conversion is skipped).
 * @param {{ targetBytes?: number, maxFilesPerBatch?: number }} [options]
 * @returns {File[][]} one flat array of File objects per outgoing request, in original order.
 */
export function splitIntoByteBoundedBatches(groups, options = {}) {
  const targetBytes = options.targetBytes ?? DEFAULT_BULK_BATCH_TARGET_BYTES;
  const maxFilesPerBatch = options.maxFilesPerBatch ?? DEFAULT_MAX_FILES_PER_BATCH;

  const batches = [];
  let currentBatch = [];
  let currentBytes = 0;
  let currentFileCount = 0;

  const closeCurrentBatch = () => {
    if (currentFileCount === 0) return;
    batches.push(currentBatch);
    currentBatch = [];
    currentBytes = 0;
    currentFileCount = 0;
  };

  for (const group of groups || []) {
    const files = Array.isArray(group?.files) ? group.files : [];
    if (files.length === 0) continue;
    const bytes = groupByteSize(group);

    // Greedy, order-preserving: close the current batch only when it already has something in it
    // and adding this group would push it over either cap. A single group already over
    // `targetBytes`/`maxFilesPerBatch` on its own is never dropped or split -- it always starts
    // (and, by itself, fills) its own batch; the server's own transport/product-policy caps are
    // the real ceiling, this is a soft packing target, not a hard limit.
    const wouldExceedBytes = currentBytes + bytes > targetBytes;
    const wouldExceedFiles = currentFileCount + files.length > maxFilesPerBatch;
    if (currentFileCount > 0 && (wouldExceedBytes || wouldExceedFiles)) {
      closeCurrentBatch();
    }

    currentBatch.push(...files);
    currentBytes += bytes;
    currentFileCount += files.length;
  }

  closeCurrentBatch();

  return batches;
}
