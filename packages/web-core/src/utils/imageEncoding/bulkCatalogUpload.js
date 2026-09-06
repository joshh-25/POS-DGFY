/**
 * Shared client-side orchestration for the bulk catalog image upload paths (#1643, epic #265's
 * 298d) -- imported (lazily, matching this module's own lazy-import convention in
 * `index.js`/`posCatalogService.js`/`storefrontCatalogService.js`) by both
 * `posCatalogService.js`'s `uploadBulkPosCatalogImages` and `storefrontCatalogService.js`'s
 * `uploadBulkStorefrontCatalogImages`, rather than duplicated in each. This is a deliberate
 * deviation from the single-image pattern (which duplicates its ~10-line gate-check block across
 * the two service files): the orchestration here (sequential per-file conversion + stem-grouping
 * + batch packing + multi-request send + summary merge) is materially larger -- the same "don't
 * duplicate a second time" reasoning the server's own `bulkCatalogImageFilename.js` doc comment
 * already states.
 */
import { splitIntoByteBoundedBatches } from './bulkBatchSplitter.js';
import { buildBulkVariantFilename, getBulkFileGroupingKey } from './bulkVariantFilename.js';
import { isImageClientConversionEnabledForScope } from './rolloutFlag.js';

const VARIANT_KEYS = ['large', 'medium', 'thumbnail'];

// Groups the *originally selected* files by SKU stem, before any conversion happens -- see
// bulkBatchSplitter.js's "grouping-unit correctness requirement" doc comment for why this has to
// happen first and stay intact through conversion and splitting.
const groupFilesByStem = (files) => {
  const order = [];
  const byStem = new Map();
  for (const file of files) {
    const key = getBulkFileGroupingKey(file?.name);
    if (!byStem.has(key)) {
      byStem.set(key, []);
      order.push(key);
    }
    byStem.get(key).push(file);
  }
  return order.map((key) => byStem.get(key));
};

const buildRenamedVariantFile = (originalFile, variantValue, variantKey) => {
  if (!(variantValue instanceof File)) return null;
  const filename = buildBulkVariantFilename(originalFile.name, variantKey);
  if (variantValue.name === filename) return variantValue;
  return new File([variantValue], filename, { type: variantValue.type || originalFile.type });
};

// Merges every batch response's `summary` object by summing whichever fields are present
// (`uploaded`, `blocked_readiness`, `failed`, `unmatched`, `duplicate_filename`,
// `duplicate_variant_for_sku`, or any other field the endpoint returns) -- not a fixed field list,
// so this stays correct if the server adds a new summary field later.
const mergeSummaries = (summaries) => {
  const merged = {};
  for (const summary of summaries) {
    for (const [key, value] of Object.entries(summary || {})) {
      merged[key] = (merged[key] || 0) + (Number(value) || 0);
    }
  }
  return merged;
};

/**
 * Packs `groups` into byte-bounded batches and POSTs each one **sequentially** via `postBatch`
 * (parallel requests would race no live constraint once conversion is already done, but
 * sequential POSTs keep `bulkImageUploadLoading`'s single loading flag meaningful as one linear
 * progress, and avoid hammering the server with N concurrent multipart uploads for one user
 * action). Merges every response into the same `{summary, results}` shape the bulk endpoints
 * already return today.
 */
const sendBatches = async (groups, postBatch) => {
  const batches = splitIntoByteBoundedBatches(groups);
  const summaries = [];
  const resultsArrays = [];
  for (const batchFiles of batches) {
    const response = await postBatch(batchFiles);
    const data = response?.data?.data || {};
    summaries.push(data.summary || {});
    resultsArrays.push(Array.isArray(data.results) ? data.results : []);
  }
  return {
    summary: mergeSummaries(summaries),
    results: resultsArrays.flat(),
  };
};

/**
 * @param {object} args
 * @param {File[]} args.files
 * @param {string} args.scope -- 'pos_catalog_bulk' | 'storefront_catalog_bulk'
 * @param {(batchFiles: File[]) => Promise<{data:{data:any}}>} args.postBatch -- injected by the
 *   caller so this module never imports `api.js` directly.
 * @returns {Promise<{summary: object, results: any[]}>} merged across however many requests were
 *   actually sent -- the same shape `ItemsPage.jsx`'s `uploadBulkCatalogImages()` already
 *   consumes (`result?.summary?.uploaded` etc.).
 */
export async function uploadBulkCatalogImagesWithClientConversion({ files = [], scope, postBatch }) {
  const selectedFiles = (Array.isArray(files) ? files : []).filter(Boolean);
  if (selectedFiles.length === 0) {
    return { summary: {}, results: [] };
  }

  if (!isImageClientConversionEnabledForScope(scope)) {
    // Fail-safe default: byte-for-byte today's behavior when the gate is closed -- same request
    // shape, same filenames. The splitter still applies here too, since even unconverted
    // phone-camera photos can individually or collectively exceed the batch target; this
    // incidentally also fixes the pre-existing ">50 files in one selection" gap (today an
    // unbounded `multiple` file input can produce more files than the server's own per-request
    // cap accepts, surfacing as a raw multer error the UI doesn't handle specially).
    const groups = groupFilesByStem(selectedFiles).map((groupFiles) => ({ files: groupFiles }));
    return sendBatches(groups, postBatch);
  }

  const { prepareImageVariants } = await import('./index.js');
  const { reportImageClientConversionDegradation } = await import('./reportDegradation.js');

  const stemGroups = groupFilesByStem(selectedFiles);
  const convertedGroups = [];
  for (const stemFiles of stemGroups) {
    const groupFiles = [];
    // Sequential, never Promise.all -- prepareImageVariants throws if called concurrently ("an
    // encode is already in progress for this session").
    for (const file of stemFiles) {
      const { variants, manifest, degraded } = await prepareImageVariants(file);
      reportImageClientConversionDegradation({ scope, degraded, manifest });

      if (!(variants?.large instanceof File)) {
        // Mirrors the single-image path's own fallback: no usable `large` variant means this one
        // file falls back to its original bytes/name entirely.
        groupFiles.push(file);
        continue;
      }

      for (const variantKey of VARIANT_KEYS) {
        const renamed = buildRenamedVariantFile(file, variants[variantKey], variantKey);
        if (renamed) groupFiles.push(renamed);
      }
    }
    convertedGroups.push({ files: groupFiles });
  }

  return sendBatches(convertedGroups, postBatch);
}
