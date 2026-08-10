import { WORKFLOW_MODE_CAPABILITIES } from '../../shared/constants/workflowModes.js';

/**
 * The shared translation between a Store Template row (a flat, final list of
 * module keys plus a base_mode) and the two overlay settings the runtime
 * actually reads (issue #178 Phase 17). A template's `modules` is the
 * template author's *final answer* - "this is what the store has" - not a
 * delta, so applying one means diffing it against its own base mode:
 *
 *   enabledCapabilities  = template.modules \ base mode's capability list
 *   disabledCapabilities = base mode's capability list \ template.modules
 *
 * A canonical preset's modules always equals its base mode's list by
 * construction (capabilityModules.contract.test.js pins this), so applying
 * one always resolves to empty overlays - byte-identical to the
 * pre-Phase-17 "no template selected" default. A non-canonical preset like
 * fnb_counter_service resolves to a real disabledCapabilities set.
 *
 * Used by exactly two call sites, so both compute the same answer from the
 * same template row and can never drift: tenant provisioning
 * (tenantProvisioningService.js) and the existing-tenant apply-template
 * admin action (applyTemplateToTenantUseCase.js).
 */
export const materializeTemplateModuleSelection = (template) => {
    const baseCapabilities = WORKFLOW_MODE_CAPABILITIES[template?.base_mode] || [];
    const templateModules = new Set(Array.isArray(template?.modules) ? template.modules : []);
    const baseCapabilitySet = new Set(baseCapabilities);

    const enabledCapabilities = [...templateModules]
        .filter((moduleKey) => !baseCapabilitySet.has(moduleKey))
        .sort();
    const disabledCapabilities = baseCapabilities
        .filter((moduleKey) => !templateModules.has(moduleKey))
        .sort();

    return {
        workflowMode: template?.base_mode ?? null,
        enabledCapabilities,
        disabledCapabilities
    };
};
