import dbStore from '../../../utils/dbStore.js';
import {
    DEFAULT_WORKFLOW_MODE,
    ENABLED_CAPABILITIES_SETTING_KEY,
    normalizeEnabledCapabilities,
    normalizeWorkflowMode
} from '../constants/workflowModes.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

// Short TTL relative to itemRepository's 5-minute settings cache: this cache
// backs an authorization check that gates nearly every guarded request
// (requireWorkflowCapability), so a change to ops_workflow_mode or
// ops_enabled_capabilities should take effect quickly rather than staying
// stale for minutes. 15s still collapses "one SystemSetting query per guarded
// request" (the pre-Phase-6 behavior) down to at most one query per tenant
// per 15 seconds.
const CACHE_TTL_MS = 15 * 1000;

const cache = new Map();

const parseJsonSettingValue = (setting, fallback) => {
    if (!setting) return fallback;
    const raw = setting.setting_value;
    if (setting.data_type === 'json' && typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }
    return raw ?? fallback;
};

const readWorkflowCapabilitySettings = async () => {
    const SystemSetting = dbStore.get('SystemSetting');
    const rows = await SystemSetting.findAll({
        where: { setting_key: [WORKFLOW_MODE_SETTING_KEY, ENABLED_CAPABILITIES_SETTING_KEY] },
        attributes: ['setting_key', 'setting_value', 'data_type']
    });
    const byKey = Object.fromEntries(rows.map((row) => [row.setting_key, row]));

    const mode = normalizeWorkflowMode(parseJsonSettingValue(byKey[WORKFLOW_MODE_SETTING_KEY], DEFAULT_WORKFLOW_MODE));
    const enabledCapabilities = normalizeEnabledCapabilities(
        parseJsonSettingValue(byKey[ENABLED_CAPABILITIES_SETTING_KEY], [])
    );
    return { mode, enabledCapabilities };
};

/**
 * Tenant-scoped, short-TTL cache for the two settings that drive workflow
 * capability gating (ops_workflow_mode + the Phase 6 ops_enabled_capabilities
 * overlay). Replaces the previous uncached per-request SystemSetting.findOne
 * in requireWorkflowCapability, which ran once per guarded request with no
 * cache of any kind.
 */
export const resolveWorkflowCapabilitySettings = async () => {
    const store = dbStore.getStore();
    const tenantKey = store?.tenantId ?? 'default';
    const cached = cache.get(tenantKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.settings;
    }

    const settings = await readWorkflowCapabilitySettings();
    cache.set(tenantKey, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
    return settings;
};

// Test-only: force the next read to hit SystemSetting again.
export const clearWorkflowCapabilitySettingsCache = () => cache.clear();
