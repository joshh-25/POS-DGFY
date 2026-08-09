import dbStore from '../../../utils/dbStore.js';
import { ENABLED_CAPABILITIES_SETTING_KEY } from '../../shared/constants/workflowModes.js';

// Not centralized in workflowModes.js - duplicated as a local const across
// ~11 backend call sites (see workflowModes.js's own comment on this).
const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const sortedCapabilities = (value) => (
    Array.isArray(value) ? [...value].sort() : null
);

const capabilitiesEqual = (a, b) => (
    JSON.stringify(sortedCapabilities(a)) === JSON.stringify(sortedCapabilities(b))
);

/**
 * Mode-switch hardening (issue #178 phase 5): appends a row to
 * workflow_mode_change_log whenever a settings write actually changes
 * ops_workflow_mode and/or ops_enabled_capabilities. A no-op write (same
 * value re-submitted) logs nothing - this is a change log, not an access log.
 *
 * Call AFTER the underlying setting write has succeeded, so the log never
 * records a change that failed to persist.
 */
export const applyWorkflowModeAuditLog = async ({
    settingsData,
    beforeValues = {},
    actorUser = null
} = {}) => {
    const touchesMode = hasOwn(settingsData, WORKFLOW_MODE_SETTING_KEY);
    const touchesOverlay = hasOwn(settingsData, ENABLED_CAPABILITIES_SETTING_KEY);
    if (!touchesMode && !touchesOverlay) return null;

    const fromMode = beforeValues[WORKFLOW_MODE_SETTING_KEY] ?? null;
    const toMode = touchesMode ? settingsData[WORKFLOW_MODE_SETTING_KEY] : fromMode;
    const fromCapabilities = beforeValues[ENABLED_CAPABILITIES_SETTING_KEY] ?? null;
    const toCapabilities = touchesOverlay ? settingsData[ENABLED_CAPABILITIES_SETTING_KEY] : fromCapabilities;

    const modeChanged = touchesMode && fromMode !== toMode;
    const capabilitiesChanged = touchesOverlay && !capabilitiesEqual(fromCapabilities, toCapabilities);
    if (!modeChanged && !capabilitiesChanged) return null;

    const WorkflowModeChangeLog = typeof dbStore?.get === 'function'
        ? dbStore.get('WorkflowModeChangeLog')
        : null;
    if (!WorkflowModeChangeLog) return null;

    return WorkflowModeChangeLog.create({
        actor_user_id: actorUser?.user_id || null,
        actor_username_snapshot: actorUser?.username || null,
        from_workflow_mode: fromMode,
        to_workflow_mode: toMode,
        from_enabled_capabilities: sortedCapabilities(fromCapabilities),
        to_enabled_capabilities: sortedCapabilities(toCapabilities)
    });
};

export const listWorkflowModeChangeLogs = async ({ limit = 50 } = {}) => {
    const WorkflowModeChangeLog = typeof dbStore?.get === 'function'
        ? dbStore.get('WorkflowModeChangeLog')
        : null;
    if (!WorkflowModeChangeLog) return [];

    const rows = await WorkflowModeChangeLog.findAll({
        order: [['created_at', 'DESC']],
        limit: Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200)
    });
    return rows.map((row) => (typeof row.get === 'function' ? row.get({ plain: true }) : row));
};
