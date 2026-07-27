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
