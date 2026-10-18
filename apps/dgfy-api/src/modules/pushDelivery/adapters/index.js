import { expoPushAdapter } from './expoPushAdapter.js';
import { fakePushAdapter } from './fakePushAdapter.js';
import { unconfiguredPushAdapter } from './unconfiguredPushAdapter.js';

export const getPushProviderMode = () => {
    const configuredMode = String(process.env.PUSH_PROVIDER || '').trim().toLowerCase();
    if (configuredMode === 'fake') return process.env.NODE_ENV === 'production' ? 'unconfigured' : 'fake';
    if (configuredMode === 'expo') return 'expo';
    return 'unconfigured';
};

export const isPushDeliveryLogEnabled = () => process.env.PUSH_DELIVERY_LOG_ENABLED !== 'false';
export const isPushDeliveryRetentionEnabled = () => process.env.PUSH_DELIVERY_RETENTION_ENABLED !== 'false';
export const getPushDeliveryLogRetentionDays = () => {
    const parsed = Number.parseInt(process.env.PUSH_DELIVERY_LOG_RETENTION_DAYS || '30', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 30;
};
export const getPushGuestTokenTtlDays = () => {
    const parsed = Number.parseInt(process.env.PUSH_GUEST_TOKEN_TTL_DAYS || '7', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 7;
};
export const getPushAccountTokenMaxAgeDays = () => {
    const parsed = Number.parseInt(process.env.PUSH_ACCOUNT_TOKEN_MAX_AGE_DAYS || '90', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 90;
};

export const resolvePushAdapter = ({ onProductionFakeBlocked } = {}) => {
    const configuredMode = String(process.env.PUSH_PROVIDER || '').trim().toLowerCase();
    if (configuredMode === 'fake' && process.env.NODE_ENV === 'production') {
        onProductionFakeBlocked?.();
        return { mode: 'unconfigured', adapter: unconfiguredPushAdapter };
    }
    const mode = getPushProviderMode();
    return {
        mode,
        adapter: mode === 'expo' ? expoPushAdapter : mode === 'fake' ? fakePushAdapter : unconfiguredPushAdapter
    };
};

export default { getPushProviderMode, resolvePushAdapter };
