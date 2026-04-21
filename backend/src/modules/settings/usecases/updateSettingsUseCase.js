import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';
import { isWorkflowMode, normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import {
    assertComplianceOperationAllowed,
    COMPLIANCE_OPERATION
} from '../../compliance/index.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY = 'pos_terminal_location_binding_enforced';
const POS_LOCATION_BINDING_REASON_CODE = 'POS_LOCATION_BINDING_READINESS_REQUIRED';

const assertWorkflowModeAuthorization = ({ settingsData, actorUser }) => {
    if (!Object.prototype.hasOwnProperty.call(settingsData, WORKFLOW_MODE_SETTING_KEY)) {
        return;
    }

    const requestedMode = settingsData[WORKFLOW_MODE_SETTING_KEY];
    if (!isWorkflowMode(requestedMode)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `ops_workflow_mode must be one of: manufacturing, msme`,
            { statusCode: 422 }
        );
    }

    if (actorUser?.is_master_admin !== true) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only master admin can update ops_workflow_mode',
            { statusCode: 403 }
        );
    }

    settingsData[WORKFLOW_MODE_SETTING_KEY] = normalizeWorkflowMode(requestedMode);
};

const getTenantComplianceSnapshot = () => {
    const store = dbStore.getStore() || {};
    const tenantId = store.tenantId;
    if (!tenantId || tenantId === 'default') return null;

    return {
        id: tenantId,
        compliance_mode_state: store.tenantComplianceModeState || null,
        compliance_mode_choice_required: store.tenantComplianceModeChoiceRequired === true,
        compliance_profile: store.tenantComplianceProfile || null,
        compliance_policy_version: store.tenantCompliancePolicyVersion || null
    };
};

export const buildUpdateSettingsUseCase = ({ settingsRepository }) => {
    return async ({ settingsData, actorUser = null }) => {
        if (!settingsData || typeof settingsData !== 'object' || Array.isArray(settingsData)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'settingsData must be an object'
            ));
        }

        try {
            assertWorkflowModeAuthorization({ settingsData, actorUser });
            const requestedStrictBinding = settingsData[POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY] === true;

            if (
                requestedStrictBinding
                && typeof settingsRepository?.getPosLocationBindingReadinessSummary === 'function'
            ) {
                const readinessSummary = await settingsRepository.getPosLocationBindingReadinessSummary();
                const unresolvedCount = Number.parseInt(readinessSummary?.unresolved_count || 0, 10) || 0;
                const lowConfidenceCount = Number.parseInt(readinessSummary?.low_confidence_count || 0, 10) || 0;

                if (unresolvedCount > 0 || lowConfidenceCount > 0 || readinessSummary?.ready_for_strict_mode === false) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Strict POS location binding cannot be enabled until location backfill readiness is complete.',
                        {
                            statusCode: 422,
                            details: {
                                reason_code: POS_LOCATION_BINDING_REASON_CODE,
                                location_binding_readiness: readinessSummary || null
                            }
                        }
                    );
                }
            }

            const tenant = getTenantComplianceSnapshot();
            if (tenant?.id) {
                const complianceResult = await assertComplianceOperationAllowed({
                    tenantId: tenant.id,
                    tenant,
                    operation: COMPLIANCE_OPERATION.SETTINGS_UPDATE,
                    context: {
                        setting_keys: Object.keys(settingsData),
                        setting_updates: settingsData
                    },
                    actorUser
                });
                if (!complianceResult.success) {
                    return complianceResult;
                }
            }

            const result = await settingsRepository.updateSettings(settingsData);
            return ok(result);
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to update settings'));
        }
    };
};
