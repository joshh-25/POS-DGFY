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
import { assertPublicStorefrontHandlePatch } from './publicStorefrontHandlePolicy.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

const assertWorkflowModeAuthorization = ({ settingsData, actorUser }) => {
    if (!Object.prototype.hasOwnProperty.call(settingsData, WORKFLOW_MODE_SETTING_KEY)) {
        return;
    }

    const requestedMode = settingsData[WORKFLOW_MODE_SETTING_KEY];
    if (!isWorkflowMode(requestedMode)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `ops_workflow_mode must be one of: ${WORKFLOW_MODE_VALUES.join(', ')}`,
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
            await assertPublicStorefrontHandlePatch({ settingsData, settingsRepository });
            if (
                Object.prototype.hasOwnProperty.call(settingsData, 'store_tenant_slug')
                && typeof settingsRepository?.reservePublicStorefrontHandle === 'function'
            ) {
                await settingsRepository.reservePublicStorefrontHandle(settingsData.store_tenant_slug);
            }
            const requestedStrictBinding = settingsData[POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY] === true;
            const currentBindingSetting = requestedStrictBinding
                && typeof settingsRepository?.getSettingsByKeys === 'function'
                ? await settingsRepository.getSettingsByKeys([POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY, POS_TERMINAL_REGISTRY_KEY])
                : {};
            const strictBindingCurrentlyEnabled = currentBindingSetting?.[POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY]?.value === true;
            const strictBindingTransitioningOn = requestedStrictBinding && !strictBindingCurrentlyEnabled;

            if (strictBindingTransitioningOn) {
                const incomingRegistryEntries = Object.prototype.hasOwnProperty.call(settingsData, POS_TERMINAL_REGISTRY_KEY)
                    ? settingsData[POS_TERMINAL_REGISTRY_KEY]
                    : currentBindingSetting?.[POS_TERMINAL_REGISTRY_KEY]?.value;
                const { patchedRegistry } = await buildStrictBindingTransitionPatch({
                    settingsRepository,
                    incomingRegistryEntries
                });
                if (patchedRegistry) {
                    settingsData[POS_TERMINAL_REGISTRY_KEY] = patchedRegistry;
                }
            }

            if (requestedStrictBinding) {
                await assertStrictBindingReadiness({ settingsRepository });
            }

            const tenant = getTenantComplianceSnapshot();
            if (tenant?.id) {
                const changedSettingKeys = await resolveChangedSettingKeys({
                    settingsRepository,
                    settingsData
                });
                const complianceResult = await assertComplianceOperationAllowed({
                    tenantId: tenant.id,
                    tenant,
                    operation: COMPLIANCE_OPERATION.SETTINGS_UPDATE,
                    context: {
                        setting_keys: changedSettingKeys,
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
