import dbStore from '../../../utils/dbStore.js';
import { ENABLED_CAPABILITIES_SETTING_KEY, DISABLED_CAPABILITIES_SETTING_KEY } from '../../shared/constants/workflowModes.js';

// Not centralized in workflowModes.js - duplicated as a local const across
// ~11 backend call sites (see workflowModes.js's own comment on this).
const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

// Phase 234 (#1327): delivery-pricing settings audit trail. Depends on #233's
// keys existing; #233 doesn't centralize them in a shared constants module
// (the way ops_workflow_mode's siblings above are), so referenced here as
// literals - same duplication pattern WORKFLOW_MODE_SETTING_KEY above
// already uses, not a new one introduced by this change.
export const STORE_DELIVERY_FEE_MODE_SETTING_KEY = 'store_delivery_fee_mode';
export const STORE_DELIVERY_FEE_CALC_SETTING_KEY = 'store_delivery_fee_calc';

// Every setting key this audit log tracks. Single source of truth for both
// the "does this write need a before-snapshot" gate (resolveWorkflowModeAuditBeforeValues,
// used by the settings write use cases before the underlying write happens)
// and the "did anything this log cares about actually change" gate
// (applyWorkflowModeAuditLog below, run after) - so the two can never drift
// out of sync with each other.
const AUDITED_SETTING_KEYS = Object.freeze([
    WORKFLOW_MODE_SETTING_KEY,
    ENABLED_CAPABILITIES_SETTING_KEY,
    DISABLED_CAPABILITIES_SETTING_KEY,
    STORE_DELIVERY_FEE_MODE_SETTING_KEY,
    STORE_DELIVERY_FEE_CALC_SETTING_KEY
]);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const sortedCapabilities = (value) => (
    Array.isArray(value) ? [...value].sort() : null
);

const capabilitiesEqual = (a, b) => (
    JSON.stringify(sortedCapabilities(a)) === JSON.stringify(sortedCapabilities(b))
);

// Generic equality for a scalar or JSON-blob setting value (delivery fee
// mode is a string, delivery fee calc is a JSON blob per #1327's own
// wording) - unlike capabilitiesEqual, neither of these is an unordered set,
// so no sort step is needed before comparing.
const valuesEqual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * True when settingsData touches at least one setting key this audit log
 * tracks. Exported so the settings write use cases can gate their
 * before-snapshot fetch on the same list this file uses internally.
 */
export const touchesWorkflowModeAuditedSetting = (settingsData = {}) => (
    AUDITED_SETTING_KEYS.some((key) => hasOwn(settingsData, key))
);

/**
 * Fetches the pre-write value of every audited setting key, for use as
 * applyWorkflowModeAuditLog's beforeValues. Call before the underlying
 * settings write executes. No-ops (no DB round-trip) when settingsData
 * touches none of AUDITED_SETTING_KEYS.
 */
export const resolveWorkflowModeAuditBeforeValues = async ({ settingsRepository, settingsData = {} } = {}) => {
    if (
        !touchesWorkflowModeAuditedSetting(settingsData)
        || typeof settingsRepository?.getSettingsByKeys !== 'function'
    ) {
        return {};
    }
    const current = await settingsRepository.getSettingsByKeys(AUDITED_SETTING_KEYS);
    return AUDITED_SETTING_KEYS.reduce((acc, key) => {
        acc[key] = current?.[key]?.value ?? null;
        return acc;
    }, {});
};

/**
 * Mode-switch hardening (issue #178 phase 5): appends a row to
 * workflow_mode_change_log whenever a settings write actually changes
 * ops_workflow_mode and/or ops_enabled_capabilities. A no-op write (same
 * value re-submitted) logs nothing - this is a change log, not an access log.
 * Phase 234 (issue #1327) extends the same gate to store_delivery_fee_mode
 * and store_delivery_fee_calc.
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
    const touchesDisabledOverlay = hasOwn(settingsData, DISABLED_CAPABILITIES_SETTING_KEY);
    const touchesDeliveryFeeMode = hasOwn(settingsData, STORE_DELIVERY_FEE_MODE_SETTING_KEY);
    const touchesDeliveryFeeCalc = hasOwn(settingsData, STORE_DELIVERY_FEE_CALC_SETTING_KEY);
    if (
        !touchesMode && !touchesOverlay && !touchesDisabledOverlay
        && !touchesDeliveryFeeMode && !touchesDeliveryFeeCalc
    ) return null;

    const fromMode = beforeValues[WORKFLOW_MODE_SETTING_KEY] ?? null;
    const toMode = touchesMode ? settingsData[WORKFLOW_MODE_SETTING_KEY] : fromMode;
    const fromCapabilities = beforeValues[ENABLED_CAPABILITIES_SETTING_KEY] ?? null;
    const toCapabilities = touchesOverlay ? settingsData[ENABLED_CAPABILITIES_SETTING_KEY] : fromCapabilities;
    const fromDisabledCapabilities = beforeValues[DISABLED_CAPABILITIES_SETTING_KEY] ?? null;
    const toDisabledCapabilities = touchesDisabledOverlay
        ? settingsData[DISABLED_CAPABILITIES_SETTING_KEY]
        : fromDisabledCapabilities;
    const fromDeliveryFeeMode = beforeValues[STORE_DELIVERY_FEE_MODE_SETTING_KEY] ?? null;
    const toDeliveryFeeMode = touchesDeliveryFeeMode
        ? settingsData[STORE_DELIVERY_FEE_MODE_SETTING_KEY]
        : fromDeliveryFeeMode;
    const fromDeliveryFeeCalc = beforeValues[STORE_DELIVERY_FEE_CALC_SETTING_KEY] ?? null;
    const toDeliveryFeeCalc = touchesDeliveryFeeCalc
        ? settingsData[STORE_DELIVERY_FEE_CALC_SETTING_KEY]
        : fromDeliveryFeeCalc;

    const modeChanged = touchesMode && fromMode !== toMode;
    const capabilitiesChanged = touchesOverlay && !capabilitiesEqual(fromCapabilities, toCapabilities);
    const disabledCapabilitiesChanged = touchesDisabledOverlay
        && !capabilitiesEqual(fromDisabledCapabilities, toDisabledCapabilities);
    const deliveryFeeModeChanged = touchesDeliveryFeeMode && !valuesEqual(fromDeliveryFeeMode, toDeliveryFeeMode);
    const deliveryFeeCalcChanged = touchesDeliveryFeeCalc && !valuesEqual(fromDeliveryFeeCalc, toDeliveryFeeCalc);
    if (
        !modeChanged && !capabilitiesChanged && !disabledCapabilitiesChanged
        && !deliveryFeeModeChanged && !deliveryFeeCalcChanged
    ) return null;

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
        to_enabled_capabilities: sortedCapabilities(toCapabilities),
        from_disabled_capabilities: sortedCapabilities(fromDisabledCapabilities),
        to_disabled_capabilities: sortedCapabilities(toDisabledCapabilities),
        from_store_delivery_fee_mode: fromDeliveryFeeMode,
        to_store_delivery_fee_mode: toDeliveryFeeMode,
        from_store_delivery_fee_calc: fromDeliveryFeeCalc,
        to_store_delivery_fee_calc: toDeliveryFeeCalc
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
