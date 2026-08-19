// #604: tenant-wide POS voucher redemption master switch, default off. Modeled directly on
// modules/shared/utils/inventoryAuthoritySettingsCache.js -- same short-TTL, tenant-scoped Map
// convention, one boolean setting instead of one JSON setting. This is a request-path gate
// (`buildRedeemVoucherUseCase` fails closed on it when `channel === 'pos'`), so it should reflect a
// merchant flipping the toggle within seconds, not stay stale for minutes.
//
// Deliberately not wired into updateSettingsUseCase.js's CAPABILITY_CACHE_SENSITIVE_KEYS
// invalidate-on-write list -- the inventory-authority precedent this mirrors doesn't wire itself in
// there either; it relies purely on the 15s TTL. No live caller reads this yet (POS voucher
// redemption itself is not built), so eager invalidation buys nothing today.
import dbStore from '../../../utils/dbStore.js';

export const VOUCHER_POS_REDEMPTION_ENABLED_SETTING_KEY = 'voucher_pos_redemption_enabled';
const DEFAULT_VOUCHER_POS_REDEMPTION_ENABLED = false;
const CACHE_TTL_MS = 15 * 1000;

const cache = new Map();

const readVoucherPosRedemptionSetting = async () => {
    const SystemSetting = dbStore.get('SystemSetting');
    const setting = await SystemSetting.findOne({
        where: { setting_key: VOUCHER_POS_REDEMPTION_ENABLED_SETTING_KEY },
        attributes: ['setting_key', 'setting_value', 'data_type']
    });
    // No settings row is expected and correct pre-cutover -- an absent row means the tenant never
    // toggled it, which must read as the default-off state, not an error.
    if (!setting) return DEFAULT_VOUCHER_POS_REDEMPTION_ENABLED;
    return setting.setting_value === 'true' || setting.setting_value === '1';
};

/**
 * Tenant-scoped, short-TTL cache for the voucher_pos_redemption_enabled setting.
 */
export const resolveVoucherPosRedemptionEnabled = async () => {
    const store = dbStore.getStore();
    const tenantKey = store?.tenantId ?? 'default';
    const cached = cache.get(tenantKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const value = await readVoucherPosRedemptionSetting();
    cache.set(tenantKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
};

// Test-only: force the next read to hit SystemSetting again.
export const clearVoucherPosRedemptionSettingCache = () => cache.clear();
