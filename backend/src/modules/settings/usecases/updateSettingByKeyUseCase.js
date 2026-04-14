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
