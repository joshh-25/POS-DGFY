// PDF menu import feature flag (quick/temporary feature — env-gated, default OFF).
// Mirrors the process.env.X === 'true' + requireXConfig() convention used by
// commercePaymentsFeature.js and paymentsFeature.js.
export const MENU_IMPORT_ENABLED = process.env.MENU_IMPORT_ENABLED === 'true';

export const menuImportDisabledMessage = 'PDF menu import is not enabled for this environment.';

/**
 * Reports whether PDF menu import is safely configured. Returns
 * { configured, missing } (never a bare boolean) so callers can surface
 * exactly which env vars/flags are absent.
 * @returns {{configured: boolean, missing: string[]}}
 */
export const requireMenuImportConfig = () => {
    const missing = [];
    if (!MENU_IMPORT_ENABLED) missing.push('MENU_IMPORT_ENABLED');
    if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
    return { configured: missing.length === 0, missing };
};

// Batch menu import (multi-file: several PDFs/photos in one job, processed
// asynchronously by workers/menuImportWorker.js) — a second capability tier on
// top of the single-file feature above. Separately gated because it adds a
// background worker, a hard Redis dependency, and materially more AI spend per
// import; it must be killable without regressing the single-file path.
export const MENU_IMPORT_BATCH_ENABLED = process.env.MENU_IMPORT_BATCH_ENABLED === 'true';

export const menuImportBatchDisabledMessage = 'Batch menu import is not enabled for this environment.';

const parsePositiveIntEnv = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parsePositiveFloatEnv = (value, fallback) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Caps — all server-side, all env-overridable. See docs/architecture/adr/
// (menu batch import ADR) for the reasoning behind each ceiling.
export const MENU_IMPORT_MAX_FILES_PER_BATCH = parsePositiveIntEnv(process.env.MENU_IMPORT_MAX_FILES_PER_BATCH, 20);
export const MENU_IMPORT_MAX_PDF_PAGES = parsePositiveIntEnv(process.env.MENU_IMPORT_MAX_PDF_PAGES, 15);
export const MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH = parsePositiveIntEnv(process.env.MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH, 25);
export const MENU_IMPORT_DAILY_USD_BUDGET = parsePositiveFloatEnv(process.env.MENU_IMPORT_DAILY_USD_BUDGET, 5.0);
export const MENU_IMPORT_WORKER_CONCURRENCY = parsePositiveIntEnv(process.env.MENU_IMPORT_WORKER_CONCURRENCY, 2);
// Post-dedup ceiling for the merge/preview use case (modules/menuImport/usecases/
// previewMenuImportJobUseCase.js) — per-file extraction is already capped at
// MAX_MENU_ITEMS_PER_IMPORT (menuExtractionService.js), but nothing caps the
// merged total across a whole batch until this.
export const MENU_IMPORT_MAX_MERGED_ITEMS = parsePositiveIntEnv(process.env.MENU_IMPORT_MAX_MERGED_ITEMS, 200);

// Extraction model. Read at call time (like isMenuImportLegacySingleFileEnabled
// below) rather than captured at import, so an operator can retune it without a
// redeploy and so tests can swap it without module-registry juggling.
//
// Default is a GPT-5-tier model: menu photos are the primary input, so vision/OCR
// accuracy is the thing not to economise on, and gpt-5-mini beats the previous
// gpt-4o default on multimodal quality at roughly a twentieth of the input cost.
// NOTE: GPT-5-family models reject `max_tokens` and restrict `temperature` — see
// buildExtractionRequestParams() in services/menuExtractionService.js.
export const MENU_IMPORT_DEFAULT_MODEL = 'gpt-5-mini';

export const menuImportModel = () => (
    process.env.MENU_IMPORT_MODEL || process.env.OPENAI_MODEL || MENU_IMPORT_DEFAULT_MODEL
);

// Deprecation of the original single-file path (/items/import/pdf/preview and
// /confirm), superseded by the batch job endpoints above.
//
// Deprecated, not removed: the single-file path is the only menu importer that
// has actually run in production, it works without Redis (the batch path hard-
// requires it), and it is the fallback when the batch worker is unavailable.
// It stays reachable until the batch path has been verified against a real
// environment — see the removal criteria in ADR 0039.
export const MENU_IMPORT_LEGACY_SUCCESSOR_PATH = '/api/v1/items/import/menu/jobs';

// Read at call time rather than captured at import: this is an operational
// kill switch, and a call-time read keeps it testable without module-registry
// juggling (requireMenuImportConfig() already reads process.env this way).
export const isMenuImportLegacySingleFileEnabled = () => (
    process.env.MENU_IMPORT_LEGACY_SINGLE_FILE_ENABLED !== 'false'
);

/**
 * Optional retirement date, surfaced to clients as an RFC 8594 `Sunset`
 * header. Accepts anything Date can parse; an unparseable value is ignored
 * rather than emitting a malformed header.
 * @returns {string|null} HTTP-date, or null when unset/invalid
 */
export const menuImportLegacySunsetHttpDate = () => {
    const configured = process.env.MENU_IMPORT_LEGACY_SUNSET_DATE;
    if (!configured) return null;
    const parsed = new Date(configured);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toUTCString();
};

export const menuImportLegacyRetiredMessage = 'Single-file menu import has been retired. Use the batch menu import endpoints instead.';

/**
 * Reports whether batch menu import is safely configured. Same
 * { configured, missing } shape as requireMenuImportConfig(). Batch import
 * additionally requires the single-file feature's config AND a live Redis
 * connection, since job state lives only in Redis (see
 * modules/menuImport/repositories/menuImportJobRepository.js).
 * @returns {{configured: boolean, missing: string[]}}
 */
export const requireMenuBatchImportConfig = () => {
    const { missing: baseMissing } = requireMenuImportConfig();
    const missing = [...baseMissing];
    if (!MENU_IMPORT_BATCH_ENABLED) missing.push('MENU_IMPORT_BATCH_ENABLED');
    if (!process.env.REDIS_URL) missing.push('REDIS_URL');
    return { configured: missing.length === 0, missing };
};
