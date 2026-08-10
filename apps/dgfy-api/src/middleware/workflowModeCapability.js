import {
    getWorkflowModeLabel,
    modeHasCapability
} from '../modules/shared/constants/workflowModes.js';
import { resolveWorkflowCapabilitySettings } from '../modules/shared/utils/workflowCapabilitySettingsCache.js';
import { resolveStoreProfile } from '../modules/settings/usecases/resolveStoreProfile.js';

// Issue #178 Phase 19: the fail-closed capability gate. Every branch that
// cannot positively confirm a grant denies - a resolver/settings-read
// failure falls through to next(error) (mapped to a 5xx by the global
// error handler), never grants access. There is no "allow on error" path.
//
// Default (ops_store_profile_read off, the vast majority of tenants):
// gates on the registries directly via modeHasCapability, now honoring the
// Phase 16 disabled-capabilities overlay as well as the enabled one - this
// is the permanent fallback, not a temporary one, and costs exactly the
// one cached settings query gating already paid before this phase.
//
// Opted-in (flag on, master-admin set per tenant): gates on
// resolveStoreProfile.js's resolution instead. The resolver never serves a
// divergent or version-stale persisted profile - it always falls back to
// an identical rebuild - so this is provably equivalent to the registry
// path for every tenant today; the flag controls rollout order, not the
// answer. The registries stay in place as the differ's oracle; nothing
// here retires them.
export const requireWorkflowCapability = (capability, moduleLabel = 'This module') => async (req, res, next) => {
    try {
        const normalizedCapability = String(capability || '').trim();
        const { mode, enabledCapabilities, disabledCapabilities, readFlagEnabled } = await resolveWorkflowCapabilitySettings();

        let granted;
        if (readFlagEnabled) {
            const resolution = await resolveStoreProfile();
            granted = resolution.profile.modules.includes(normalizedCapability);
        } else {
            granted = modeHasCapability(mode, normalizedCapability, enabledCapabilities, disabledCapabilities);
        }

        if (granted) {
            req.workflowMode = mode;
            req.enabledCapabilities = enabledCapabilities;
            req.disabledCapabilities = disabledCapabilities;
            return next();
        }
        return res.status(403).json({
            success: false,
            data: null,
            message: `${moduleLabel} is not available in ${getWorkflowModeLabel(mode)} Mode.`,
            error_code: 'WORKFLOW_MODE_CAPABILITY_DENIED',
            errors: {
                capability,
                workflow_mode: mode,
                workflow_mode_label: getWorkflowModeLabel(mode)
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
};

export default requireWorkflowCapability;
