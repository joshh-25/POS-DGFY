// AI item-image generation feature flag (env-gated, default OFF). Mirrors
// menuImportFeature.js's conventions: flags/caps captured at import, but
// tunables that benefit from retuning without a redeploy (the model name,
// the caps) are read at call time instead.
//
// Two callers share this config and the service/worker it gates:
//   1. Batch menu import's post-confirm review step (#176) — per-item opt-in.
//   2. The standalone "Generate an Image" action for existing items (#197).
export const ITEM_IMAGE_GENERATION_ENABLED = process.env.ITEM_IMAGE_GENERATION_ENABLED === 'true';

export const itemImageGenerationDisabledMessage = 'AI item image generation is not enabled for this environment.';

/**
 * Reports whether item-image generation is safely configured. Same
 * { configured, missing } shape as requireMenuImportConfig() /
 * requireMenuBatchImportConfig() in menuImportFeature.js. Generation runs on
 * the same Redis-backed worker convention as batch menu import, so it shares
 * that hard dependency.
 * @returns {{configured: boolean, missing: string[]}}
 */
export const requireItemImageGenerationConfig = () => {
    const missing = [];
    if (!ITEM_IMAGE_GENERATION_ENABLED) missing.push('ITEM_IMAGE_GENERATION_ENABLED');
    if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
    if (!process.env.REDIS_URL) missing.push('REDIS_URL');
    return { configured: missing.length === 0, missing };
};

const parsePositiveIntEnv = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parsePositiveFloatEnv = (value, fallback) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Caps — all server-side, all env-overridable.
export const ITEM_IMAGE_MAX_PER_BATCH = parsePositiveIntEnv(process.env.ITEM_IMAGE_MAX_PER_BATCH, 20);
export const ITEM_IMAGE_DAILY_USD_BUDGET = parsePositiveFloatEnv(process.env.ITEM_IMAGE_DAILY_USD_BUDGET, 5.0);
export const ITEM_IMAGE_WORKER_CONCURRENCY = parsePositiveIntEnv(process.env.ITEM_IMAGE_WORKER_CONCURRENCY, 2);

// Generation model. Read at call time (like menuImportModel() in
// menuImportFeature.js) rather than captured at import, so an operator can
// retune it without a redeploy.
//
// gpt-image-1 shuts down 2026-10-23; gpt-image-1.5/1-mini/chatgpt-image-latest
// all shut down 2026-12-01, all migrating to gpt-image-2 — the only
// forward-compatible default (see #176's revision history for sourcing
// caveats on the exact dates/pricing).
export const ITEM_IMAGE_DEFAULT_MODEL = 'gpt-image-2';

export const itemImageGenerationModel = () => (
    process.env.ITEM_IMAGE_GENERATION_MODEL || ITEM_IMAGE_DEFAULT_MODEL
);

// Requested image resolution tier — must line up with a key in
// config/aiModelRates.js's IMAGE_MODEL_RATES so spend is priced exactly, not
// via the unpriced-size fallback.
export const ITEM_IMAGE_DEFAULT_SIZE_TIER = '1K';

export const itemImageSizeTier = () => (
    process.env.ITEM_IMAGE_SIZE_TIER || ITEM_IMAGE_DEFAULT_SIZE_TIER
);

export default {
    ITEM_IMAGE_GENERATION_ENABLED,
    itemImageGenerationDisabledMessage,
    requireItemImageGenerationConfig,
    ITEM_IMAGE_MAX_PER_BATCH,
    ITEM_IMAGE_DAILY_USD_BUDGET,
    ITEM_IMAGE_WORKER_CONCURRENCY,
    ITEM_IMAGE_DEFAULT_MODEL,
    itemImageGenerationModel,
    ITEM_IMAGE_DEFAULT_SIZE_TIER,
    itemImageSizeTier
};
