import {
    getPushProviderMode,
    isPushDeliveryLogEnabled,
    isPushDeliveryRetentionEnabled
} from '../../pushDelivery/adapters/index.js';
import { hashExpoPushToken } from '../../pushDelivery/utils/pushTokenSecurity.js';

const LABEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,29}$/;
const PROBE_TOKEN = 'ExponentPushToken[diagnostics-probe]';

const normalizeLabel = (value) => {
    const label = String(value || '').trim().toLowerCase();
    return LABEL_PATTERN.test(label) ? label : null;
};

/**
 * NODE_ENV is "production" on staging and production alike, so the environment shown to an operator
 * comes from an explicit label. An unset or malformed label is reported as "unknown" rather than
 * guessed.
 */
export const resolveEnvironmentLabel = (env = process.env) => {
    const explicit = normalizeLabel(env.DEPLOY_ENV_LABEL);
    if (explicit) return { label: explicit, source: 'DEPLOY_ENV_LABEL' };
    const sentry = normalizeLabel(env.SENTRY_ENVIRONMENT);
    if (sentry) return { label: sentry, source: 'SENTRY_ENVIRONMENT' };
    return { label: 'unknown', source: 'unset' };
};

const present = (value) => Boolean(String(value || '').trim());

/** Presence-only readiness indicators. Never returns a secret value. */
export const buildReadiness = ({ env = process.env, schedulerStatus = { scheduled: false, last_cycle_completed_at: null } } = {}) => {
    const requested = String(env.PUSH_PROVIDER || '').trim().toLowerCase();
    const configuredMode = ['expo', 'fake'].includes(requested) ? requested : 'unconfigured';
    let tokenHashReady = true;
    try {
        hashExpoPushToken(PROBE_TOKEN, { secret: env.PUSH_TOKEN_HASH_SECRET });
    } catch {
        tokenHashReady = false;
    }
    return {
        provider: {
            configured_mode: configuredMode,
            effective_mode: getPushProviderMode(),
            fake_blocked_in_production: configuredMode === 'fake' && env.NODE_ENV === 'production'
        },
        expo_access_token_present: present(env.EXPO_ACCESS_TOKEN),
        token_hash_secret_present: present(env.PUSH_TOKEN_HASH_SECRET),
        token_hash_ready: tokenHashReady,
        guest_proof_secret_present: present(env.STORE_PUSH_PROOF_SECRET),
        delivery_log_enabled: isPushDeliveryLogEnabled(),
        retention_enabled: isPushDeliveryRetentionEnabled(),
        receipt_scheduler: {
            scheduled: Boolean(schedulerStatus.scheduled),
            last_cycle_completed_at: schedulerStatus.last_cycle_completed_at || null
        }
    };
};
