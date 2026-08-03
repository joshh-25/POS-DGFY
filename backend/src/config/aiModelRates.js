/**
 * OpenAI pricing, in USD.
 *
 * Extracted out of modules/ai/aiCore.js so cost logging can be shared without
 * dragging the whole AI chat usecase graph (conversations, tool execution,
 * confirmations) along with it — services/menuExtractionService.js needs the
 * rates and deliberately keeps its dependency footprint small.
 *
 * Two pricing dimensions live here, because they are not interchangeable:
 *   - MODEL_RATES: per-token, USD per single token (already divided by 1M) —
 *     chat/completions models (menu extraction, the AI assistant).
 *   - IMAGE_MODEL_RATES: per-image, flat USD per generated image at a given
 *     size — image-generation models (services/itemImageGenerationService.js).
 *     There is no token count to price these from at all, so they cannot
 *     share resolveModelRate()'s fallback path without producing a number
 *     with no relationship to the actual charge (see #195).
 *
 * Unknown models fall back to a default rate rather than logging zero cost:
 * over-reporting spend for an unrecognised model is the safe direction, since
 * modules/menuImport/repositories/menuImportBudgetRepository.js meters the
 * tenant's daily AI budget off these logged values. Both resolvers flag that
 * fallback with `estimated: true` and log a one-time warning per unseen model
 * name, so a mis-priced model is visible in logs instead of silently skewing
 * a budget — previously the fallback was indistinguishable from a real rate.
 */
import logger from './logger.js';

const perMillion = (input, output) => ({ input: input / 1000000, output: output / 1000000 });

export const MODEL_RATES = {
    // GPT-5 family (current default tier for menu extraction).
    'gpt-5': perMillion(1.25, 10.00),
    'gpt-5-mini': perMillion(0.25, 2.00),
    'gpt-5-nano': perMillion(0.05, 0.40),
    'gpt-5.4': perMillion(2.50, 15.00),
    'gpt-5.4-mini': perMillion(0.75, 4.50),
    'gpt-5.4-nano': perMillion(0.20, 1.25),
    // GPT-4 era — retained because OPENAI_MODEL still defaults to gpt-4o for the
    // AI assistant, and because historical usage rows reference these names.
    'gpt-4o': perMillion(5.00, 15.00),
    'gpt-4o-mini': perMillion(0.150, 0.600)
};

export const DEFAULT_MODEL_RATE = MODEL_RATES['gpt-4o'];

// Per-image USD, keyed by model then a size tier. Sizes are the loose "1K /
// 2K / 4K" resolution tiers OpenAI's own pricing pages use, not literal
// pixel dimensions — services/itemImageGenerationService.js maps whatever
// size it actually requests onto one of these keys.
//
// Sourced from a mix of primary docs and third-party aggregators that didn't
// always agree on exact figures for the newest models (see #176's revision
// history) — treat these as directionally right, not contractual, and
// reconcile against the OpenAI dashboard before relying on them for billing.
export const IMAGE_MODEL_RATES = {
    'gpt-image-2': { '1K': 0.03, '2K': 0.05, '4K': 0.06 }
};

export const DEFAULT_IMAGE_MODEL_RATE = IMAGE_MODEL_RATES['gpt-image-2'];
const DEFAULT_IMAGE_SIZE_TIER = '1K';

// Warn at most once per unseen model name per process — the log line exists
// to catch a genuinely new/unpriced model during development or right after
// an upstream migration, not to spam on every request against a known-unpriced
// one.
const _warnedTokenModels = new Set();
const _warnedImageModels = new Set();

/**
 * @param {string} model
 * @returns {{input: number, output: number, estimated: boolean}}
 */
export const resolveModelRate = (model) => {
    const rate = MODEL_RATES[model];
    if (rate) return { ...rate, estimated: false };

    if (!_warnedTokenModels.has(model)) {
        _warnedTokenModels.add(model);
        logger.warn('[aiModelRates] Unpriced token model — falling back to the gpt-4o rate; cost_usd for this model is an estimate', { model });
    }
    return { ...DEFAULT_MODEL_RATE, estimated: true };
};

/**
 * @param {string} model
 * @param {'1K'|'2K'|'4K'} [size]
 * @returns {{usd: number, estimated: boolean}}
 */
export const resolveImageModelRate = (model, size = DEFAULT_IMAGE_SIZE_TIER) => {
    const modelRates = IMAGE_MODEL_RATES[model];
    const usd = modelRates?.[size];
    if (typeof usd === 'number') return { usd, estimated: false };

    if (!_warnedImageModels.has(model)) {
        _warnedImageModels.add(model);
        logger.warn('[aiModelRates] Unpriced image model — falling back to the gpt-image-2 1K rate; cost_usd for this model is an estimate', { model, size });
    }
    return { usd: DEFAULT_IMAGE_MODEL_RATE[DEFAULT_IMAGE_SIZE_TIER], estimated: true };
};

export default { MODEL_RATES, DEFAULT_MODEL_RATE, resolveModelRate, IMAGE_MODEL_RATES, DEFAULT_IMAGE_MODEL_RATE, resolveImageModelRate };
