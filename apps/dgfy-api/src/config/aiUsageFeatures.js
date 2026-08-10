/**
 * Canonical `ai_usage_logs.feature` values (see migration
 * 20260803000001-add-ai-usage-feature-and-units.cjs and #195).
 *
 * A shared enum rather than each writer/reader inlining its own string —
 * models/Landlord/AiUsageLog.js writers, menuImportBudgetRepository's
 * feature filter, and (once built) itemImageWorker.js all need to agree on
 * the exact spelling.
 */
export const AI_USAGE_FEATURES = Object.freeze({
    AI_ASSISTANT: 'ai_assistant',
    MENU_IMPORT: 'menu_import',
    ITEM_IMAGE_GENERATION: 'item_image_generation'
});

export default AI_USAGE_FEATURES;
