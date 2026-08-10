import dbStore from '../../../utils/dbStore.js';
import {
    DEFAULT_INVENTORY_AUTHORITY,
    INVENTORY_AUTHORITY_SETTING_KEY,
    normalizeInventoryAuthority
} from '../constants/workflowModes.js';

// Same short-TTL convention as workflowCapabilitySettingsCache.js (15s):
// this cache backs both an authorization-adjacent read (the item write-path's
// external_ims gate) and a request-path gate (the Phase 9 sibling of
// requireWorkflowCapability that fails closed on delegated-authority writes),
// so a master admin flipping inventory_authority should take effect quickly
// rather than staying stale for minutes like itemRepository's 5-minute
// settings cache.
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

const readInventoryAuthoritySetting = async () => {
    const SystemSetting = dbStore.get('SystemSetting');
    const setting = await SystemSetting.findOne({
        where: { setting_key: INVENTORY_AUTHORITY_SETTING_KEY },
        attributes: ['setting_key', 'setting_value', 'data_type']
    });
    return normalizeInventoryAuthority(parseJsonSettingValue(setting, DEFAULT_INVENTORY_AUTHORITY));
};

/**
 * Tenant-scoped, short-TTL cache for the inventory_authority setting (Phase 9
 * Axis 4 delegation switch). Mirrors resolveWorkflowCapabilitySettings's
 * shape exactly, one setting instead of two.
 */
export const resolveInventoryAuthority = async () => {
    const store = dbStore.getStore();
    const tenantKey = store?.tenantId ?? 'default';
    const cached = cache.get(tenantKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const value = await readInventoryAuthoritySetting();
    cache.set(tenantKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
};

// Test-only: force the next read to hit SystemSetting again.
export const clearInventoryAuthoritySettingsCache = () => cache.clear();
