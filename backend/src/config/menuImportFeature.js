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
