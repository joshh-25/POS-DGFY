import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';
import {
    isWorkflowMode,
    normalizeWorkflowMode,
    WORKFLOW_MODE_VALUES
} from '../../shared/constants/workflowModes.js';
import {
    assertComplianceOperationAllowed,
    COMPLIANCE_OPERATION
} from '../../compliance/index.js';
import {
    POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY,
    POS_TERMINAL_REGISTRY_KEY,
    buildStrictBindingTransitionPatch,
    assertStrictBindingReadiness
} from './posTerminalLocationBindingPolicy.js';
import { resolveChangedSettingKeys } from './settingsChangeSet.js';
import { assertPublicStorefrontHandleAvailable } from './publicStorefrontHandlePolicy.js';

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
            let strictBindingRegistryPatch = null;
            if (key === WORKFLOW_MODE_SETTING_KEY) {
                if (!isWorkflowMode(value)) {
                    return fail(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `ops_workflow_mode must be one of: ${WORKFLOW_MODE_VALUES.join(', ')}`,
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
            if (key === 'store_tenant_slug') {
                await assertPublicStorefrontHandleAvailable({
                    handleValue: normalizedValue,
                    settingsRepository
                });
                if (typeof settingsRepository?.reservePublicStorefrontHandle === 'function') {
                    await settingsRepository.reservePublicStorefrontHandle(normalizedValue);
                }
            }
            if (
                key === POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY
                && normalizedValue === true
            ) {
                const { strictBindingTransitioningOn, patchedRegistry } = await buildStrictBindingTransitionPatch({
                    settingsRepository
                });
                strictBindingRegistryPatch = strictBindingTransitioningOn ? patchedRegistry : null;
            }
            if (key === POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY && normalizedValue === true) {
                await assertStrictBindingReadiness({ settingsRepository });
            }

            const tenant = getTenantComplianceSnapshot();
            if (tenant?.id) {
                const changedSettingKeys = await resolveChangedSettingKeys({
                    settingsRepository,
                    settingsData: { [key]: normalizedValue }
                });
                const complianceResult = await assertComplianceOperationAllowed({
                    tenantId: tenant.id,
                    tenant,
                    operation: COMPLIANCE_OPERATION.SETTINGS_UPDATE,
                    context: {
                        setting_keys: changedSettingKeys,
                        setting_updates: { [key]: normalizedValue }
                    },
                    actorUser
                });
                if (!complianceResult.success) {
                    return complianceResult;
                }
            }

            if (strictBindingRegistryPatch) {
                if (typeof settingsRepository?.updateSettings === 'function') {
                    await settingsRepository.updateSettings({
                        [POS_TERMINAL_REGISTRY_KEY]: strictBindingRegistryPatch,
                        [key]: normalizedValue
                    });
                    if (typeof settingsRepository?.getSettingByKey === 'function') {
                        const setting = await settingsRepository.getSettingByKey(key);
                        return ok(setting);
                    }
                    return ok({ setting_key: key, value: normalizedValue });
                }

                await settingsRepository.updateSettingByKey(POS_TERMINAL_REGISTRY_KEY, strictBindingRegistryPatch);
            }

            const updatedSetting = await settingsRepository.updateSettingByKey(key, normalizedValue);
            return ok(updatedSetting);
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to update setting'));
        }
    };
};
