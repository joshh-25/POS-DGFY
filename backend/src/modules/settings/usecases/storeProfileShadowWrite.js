import logger from '../../../config/logger.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { ENABLED_CAPABILITIES_SETTING_KEY } from '../../shared/constants/workflowModes.js';
import {
    STORE_PROFILE_SETTING_KEY,
    buildStoreProfile,
    storeProfilesEqual
} from '../../shared/constants/storeProfile.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// The profile is derived server-side from mode + overlay; accepting a client
// value would let a caller desynchronize it from the registries it mirrors.
export const assertStoreProfileNotClientWritten = ({ settingsData }) => {
    if (!hasOwn(settingsData, STORE_PROFILE_SETTING_KEY)) return;
    throw new DomainError(
        DomainErrorCode.AUTHORIZATION_FAILED,
        'ops_store_profile is derived by the server and cannot be written directly.',
        {
            statusCode: 403,
            details: {
                reason_code: 'STORE_PROFILE_SERVER_DERIVED',
                setting_keys: [STORE_PROFILE_SETTING_KEY]
            }
        }
    );
};

// A settings write that touches mode/overlay only ever runs after
// provisioning (that first write happens directly in
// tenantProvisioningService.js, not through this path) - so if the
// tenant's existing profile carries template provenance, this write is, by
// definition, the tenant's config moving away from what that template
// produced. Preserve the origin pointer (a future review-and-accept flow
// needs it - issue #178 §9.3) but flag the divergence; never re-derive it
// from the template row itself (ADR 0056 clause 2).
const carryForwardProvenance = (existingProfile, nextProfile) => {
    const existingProvenance = existingProfile?.provenance;
    if (!existingProvenance?.source_template_id) return nextProfile;
    return {
        ...nextProfile,
        provenance: {
            ...existingProvenance,
            diverged_from_source: true
        }
    };
};

/**
 * Shadow-write (issue #178 Phase 11): whenever a settings write touches
 * ops_workflow_mode or ops_enabled_capabilities, materialize the resulting
 * Store Profile into the same write. The profile is written and diffed only —
 * no runtime path reads it yet.
 */
export const applyStoreProfileShadowWrite = async ({ settingsRepository, settingsData }) => {
    const touchesMode = hasOwn(settingsData, WORKFLOW_MODE_SETTING_KEY);
    const touchesOverlay = hasOwn(settingsData, ENABLED_CAPABILITIES_SETTING_KEY);
    if (!touchesMode && !touchesOverlay) return settingsData;
    if (typeof settingsRepository?.getSettingsByKeys !== 'function') return settingsData;

    const current = await settingsRepository.getSettingsByKeys([
        WORKFLOW_MODE_SETTING_KEY,
        ENABLED_CAPABILITIES_SETTING_KEY,
        STORE_PROFILE_SETTING_KEY
    ]);

    const existingProfile = current?.[STORE_PROFILE_SETTING_KEY]?.value || null;

    const profile = carryForwardProvenance(existingProfile, buildStoreProfile({
        workflowMode: touchesMode
            ? settingsData[WORKFLOW_MODE_SETTING_KEY]
            : current?.[WORKFLOW_MODE_SETTING_KEY]?.value,
        enabledCapabilities: touchesOverlay
            ? settingsData[ENABLED_CAPABILITIES_SETTING_KEY]
            : current?.[ENABLED_CAPABILITIES_SETTING_KEY]?.value
    }));
    if (existingProfile && !storeProfilesEqual(existingProfile, profile)) {
        logger.info('[StoreProfile] shadow profile changed on settings write', {
            from_base_mode: existingProfile?.source?.base_mode,
            to_base_mode: profile.source.base_mode,
            from_modules: existingProfile?.modules,
            to_modules: profile.modules
        });
    }

    return { ...settingsData, [STORE_PROFILE_SETTING_KEY]: profile };
};
