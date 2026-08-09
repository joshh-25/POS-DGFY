import dbStore from '../../../utils/dbStore.js';
import logger from '../../../config/logger.js';
import {
    STORE_PROFILE_SETTING_KEY,
    STORE_PROFILE_VERSION,
    STORE_PROFILE_READ_SETTING_KEY,
    buildStoreProfile,
    storeProfilesEqual,
    normalizeStoreProfileReadFlag
} from '../../shared/constants/storeProfile.js';
import {
    DEFAULT_WORKFLOW_MODE,
    ENABLED_CAPABILITIES_SETTING_KEY,
    normalizeEnabledCapabilities,
    DISABLED_CAPABILITIES_SETTING_KEY,
    normalizeDisabledCapabilities,
    normalizeWorkflowMode
} from '../../shared/constants/workflowModes.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

// Same short-TTL, tenant-scoped shape as workflowCapabilitySettingsCache.js's
// resolveWorkflowCapabilitySettings — kept as a separate cache rather than
// merged into it because this one also reads the (potentially large)
// persisted profile JSON on every miss. requireWorkflowCapability
// (workflowModeCapability.js, issue #178 Phase 19) is this resolver's
// consumer for every tenant opted into ops_store_profile_read.
const CACHE_TTL_MS = 15 * 1000;
const cache = new Map();

// provenance (issue #178 Phase 13) is a historical fact stamped once at
// provisioning or carried forward on divergence - a fresh rebuild can never
// reproduce it (buildStoreProfile always defaults it to null/false), so
// comparing it here would flag every template-provisioned tenant as
// "diverged" forever. The differ's job is catching drift in the
// registry-derived content, not in a field no rebuild could ever match.
const stripProvenanceForComparison = (profile) => {
    const { provenance, ...rest } = profile || {};
    return rest;
};

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

const readStoreProfileResolution = async () => {
    const SystemSetting = dbStore.get('SystemSetting');
    const rows = await SystemSetting.findAll({
        where: {
            setting_key: [
                WORKFLOW_MODE_SETTING_KEY,
                ENABLED_CAPABILITIES_SETTING_KEY,
                DISABLED_CAPABILITIES_SETTING_KEY,
                STORE_PROFILE_SETTING_KEY,
                STORE_PROFILE_READ_SETTING_KEY
            ]
        },
        attributes: ['setting_key', 'setting_value', 'data_type']
    });
    const byKey = Object.fromEntries(rows.map((row) => [row.setting_key, row]));

    const mode = normalizeWorkflowMode(parseJsonSettingValue(byKey[WORKFLOW_MODE_SETTING_KEY], DEFAULT_WORKFLOW_MODE));
    const enabledCapabilities = normalizeEnabledCapabilities(
        parseJsonSettingValue(byKey[ENABLED_CAPABILITIES_SETTING_KEY], [])
    );
    // Phase 16: without this, every template-curated tenant (whose
    // disabled_capabilities overlay is what makes its Profile diverge from
    // its base mode on purpose) would be flagged "diverged" on every read -
    // the rebuild has to see the same overlay the persisted profile was
    // built with, or the comparison below is comparing apples to oranges.
    const disabledCapabilities = normalizeDisabledCapabilities(
        parseJsonSettingValue(byKey[DISABLED_CAPABILITIES_SETTING_KEY], [])
    );
    const readFlagEnabled = normalizeStoreProfileReadFlag(
        parseJsonSettingValue(byKey[STORE_PROFILE_READ_SETTING_KEY], false)
    );
    const persistedProfile = parseJsonSettingValue(byKey[STORE_PROFILE_SETTING_KEY], null);

    const rebuiltProfile = buildStoreProfile({ workflowMode: mode, enabledCapabilities, disabledCapabilities });

    // The differ: always compute both regardless of the flag, so a
    // divergence is caught the moment it exists, not only once someone flips
    // a tenant's flag on. A stale profile_version counts as diverged too —
    // it means the tenant hasn't gone through a mode/overlay write since the
    // last STORE_PROFILE_VERSION bump, so its shape cannot be trusted as
    // current even if its content happens to be a subset match.
    const persistedIsCurrentVersion = persistedProfile != null
        && persistedProfile.profile_version === STORE_PROFILE_VERSION;
    const contentDiverged = persistedIsCurrentVersion
        ? !storeProfilesEqual(
            stripProvenanceForComparison(persistedProfile),
            stripProvenanceForComparison(rebuiltProfile)
        )
        : false;
    const diverged = persistedProfile != null && (!persistedIsCurrentVersion || contentDiverged);

    if (diverged) {
        const store = dbStore.getStore();
        logger.warn('[StoreProfile] persisted profile diverges from a fresh rebuild', {
            tenant_id: store?.tenantId ?? null,
            reason: persistedIsCurrentVersion ? 'content_mismatch' : 'stale_profile_version',
            persisted_version: persistedProfile?.profile_version ?? null,
            current_version: STORE_PROFILE_VERSION
        });
    }

    // Never serve a divergent or version-stale persisted profile, even with
    // the flag on: a stale shadow-write must never silently become
    // authoritative for the tenants that gate on this resolver
    // (requireWorkflowCapability, issue #178 Phase 19). A rebuild is always
    // correct by definition — it IS the registries.
    const canServePersisted = readFlagEnabled && persistedIsCurrentVersion && !contentDiverged;

    return {
        profile: canServePersisted ? persistedProfile : rebuiltProfile,
        source: canServePersisted ? 'persisted' : 'rebuilt',
        diverged,
        read_flag_enabled: readFlagEnabled
    };
};

/**
 * Resolves a tenant's effective Store Profile (issue #178 Phase 12,
 * differ; Phase 19, wired). requireWorkflowCapability
 * (workflowModeCapability.js) is this resolver's consumer for every tenant
 * with ops_store_profile_read enabled - see
 * docs/features/STORE_TEMPLATES_AND_PROFILES.md. Was built ahead of any
 * real consumer, deliberately: until Store Templates (Phase 13) and the
 * subtractive overlay (Phase 16) existed, a tenant's persisted profile
 * could never diverge from what rebuilding it would produce, so flipping a
 * real read path onto this resolver would have added latency and failure
 * surface for zero behavior change. Both now exist, so it is wired.
 */
export const resolveStoreProfile = async () => {
    const store = dbStore.getStore();
    const tenantKey = store?.tenantId ?? 'default';
    const cached = cache.get(tenantKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.resolution;
    }

    const resolution = await readStoreProfileResolution();
    cache.set(tenantKey, { resolution, expiresAt: Date.now() + CACHE_TTL_MS });
    return resolution;
};

// Test-only: force the next read to hit SystemSetting again.
export const clearStoreProfileResolutionCache = () => cache.clear();
