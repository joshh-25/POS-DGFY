/**
 * OpenAI per-token pricing, in USD per single token (already divided by 1M).
 *
 * Extracted out of modules/ai/aiCore.js so cost logging can be shared without
 * dragging the whole AI chat usecase graph (conversations, tool execution,
 * confirmations) along with it — services/menuExtractionService.js needs the
 * rates and deliberately keeps its dependency footprint small.
 *
 * Unknown models fall back to DEFAULT_MODEL_RATE rather than logging zero cost:
 * over-reporting spend for an unrecognised model is the safe direction, since
 * modules/menuImport/repositories/menuImportBudgetRepository.js meters the
 * tenant's daily AI budget off these logged values.
 */
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

/**
 * @param {string} model
 * @returns {{input: number, output: number}}
 */
export const resolveModelRate = (model) => MODEL_RATES[model] || DEFAULT_MODEL_RATE;

export default { MODEL_RATES, DEFAULT_MODEL_RATE, resolveModelRate };
