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

export const buildUpdateSettingByKeyUseCase = ({ settingsRepository }) => {
    return async ({ key, value, actorUser = null }) => {
        if (!key || typeof key !== 'string') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Setting key is required'
            ));
        }

        if (typeof value === 'undefined') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Setting value is required'
            ));
        }

        try {
            let normalizedValue = value;
            if (key === WORKFLOW_MODE_SETTING_KEY) {
                if (!isWorkflowMode(value)) {
                    return fail(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `ops_workflow_mode must be one of: manufacturing, msme`,
                        { statusCode: 422 }
                    ));
                }
                if (actorUser?.is_master_admin !== true) {
                    return fail(new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'Only master admin can update ops_workflow_mode',
                        { statusCode: 403 }
                    ));
                }
                normalizedValue = normalizeWorkflowMode(value);
            }
            if (
                key === POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY
                && normalizedValue === true
                && typeof settingsRepository?.getPosLocationBindingReadinessSummary === 'function'
            ) {
                const readinessSummary = await settingsRepository.getPosLocationBindingReadinessSummary();
                const unresolvedCount = Number.parseInt(readinessSummary?.unresolved_count || 0, 10) || 0;
                const lowConfidenceCount = Number.parseInt(readinessSummary?.low_confidence_count || 0, 10) || 0;
                if (unresolvedCount > 0 || lowConfidenceCount > 0 || readinessSummary?.ready_for_strict_mode === false) {
                    return fail(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Strict POS location binding cannot be enabled until location backfill readiness is complete.',
                        {
                            statusCode: 422,
                            details: {
                                reason_code: POS_LOCATION_BINDING_REASON_CODE,
                                location_binding_readiness: readinessSummary || null
                            }
                        }
                    ));
                }
            }

            const tenant = getTenantComplianceSnapshot();
            if (tenant?.id) {
                const complianceResult = await assertComplianceOperationAllowed({
                    tenantId: tenant.id,
                    tenant,
                    operation: COMPLIANCE_OPERATION.SETTINGS_UPDATE,
                    context: {
                        setting_keys: [key],
                        setting_updates: { [key]: normalizedValue }
                    },
                    actorUser
                });
                if (!complianceResult.success) {
                    return complianceResult;
                }
            }

            const updatedSetting = await settingsRepository.updateSettingByKey(key, normalizedValue);
            return ok(updatedSetting);
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to update setting'));
        }
    };
};
