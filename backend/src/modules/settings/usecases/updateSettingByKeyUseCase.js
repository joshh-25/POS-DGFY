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
import {
    POS_RECEIPT_METADATA_PENDING_SETTING_KEY,
    buildPendingPosReceiptMetadata,
    isPlatformControlledPosSoftwareKey,
    isTenantReviewedPosReceiptKey
} from './posReceiptMetadataApprovalPolicy.js';
import {
    cleanupOmittedStorefrontGalleryAssets,
    snapshotStorefrontGalleryCleanup
} from './storefrontGalleryAssetCleanup.js';
import {
    hashTerminalRegistrySecrets,
    sanitizeTerminalRegistryForRead,
    sanitizeSingleSettingForRead
} from './posTerminalRegistrySecrets.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const PLATFORM_MAX_CUSTOMER_ACCESS_MODE_KEY = 'platform_max_customer_access_mode';

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

export const buildUpdateSettingByKeyUseCase = ({ settingsRepository, storefrontAssetStorage = null }) => {
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
            if (key === PLATFORM_MAX_CUSTOMER_ACCESS_MODE_KEY) {
                return fail(new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Platform maximum Customer Access Mode is controlled by platform admin.',
                    {
                        statusCode: 403,
                        details: {
                            reason_code: 'CUSTOMER_ACCESS_PLATFORM_MAX_PLATFORM_CONTROLLED',
                            setting_keys: [PLATFORM_MAX_CUSTOMER_ACCESS_MODE_KEY]
                        }
                    }
                ));
            }
            if (actorUser?.is_platform_admin !== true && isPlatformControlledPosSoftwareKey(key)) {
                return fail(new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Software name, software version, and software serial number are configured by platform admin for DGFY POS.',
                    {
                        statusCode: 403,
                        details: {
                            reason_code: 'POS_SOFTWARE_IDENTITY_PLATFORM_CONTROLLED',
                            setting_keys: [key]
                        }
                    }
                ));
            }
            if (actorUser?.is_platform_admin !== true && isTenantReviewedPosReceiptKey(key)) {
                const changedSettingKeys = await resolveChangedSettingKeys({
                    settingsRepository,
                    settingsData: { [key]: value }
                });
                if (changedSettingKeys.length === 0) {
                    return ok({
                        setting_key: key,
                        value,
                        pending_review_keys: []
                    });
                }
                const current = typeof settingsRepository?.getSettingByKey === 'function'
                    ? await settingsRepository.getSettingByKey(POS_RECEIPT_METADATA_PENDING_SETTING_KEY).catch(() => null)
                    : null;
                const pending = buildPendingPosReceiptMetadata({
                    requestedChanges: { [key]: value },
                    currentPending: current?.value,
                    actorUser
                });
                const updatedSetting = await settingsRepository.updateSettingByKey(
                    POS_RECEIPT_METADATA_PENDING_SETTING_KEY,
                    pending
                );
                return ok({
                    ...updatedSetting,
                    pending_review_keys: [key]
                });
            }
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
            if (key === POS_TERMINAL_REGISTRY_KEY) {
                const current = typeof settingsRepository?.getSettingsByKeys === 'function'
                    ? await settingsRepository.getSettingsByKeys([POS_TERMINAL_REGISTRY_KEY])
                    : {};
                normalizedValue = await hashTerminalRegistrySecrets({
                    incomingEntries: normalizedValue,
                    currentEntries: current?.[POS_TERMINAL_REGISTRY_KEY]?.value || []
                });
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
                        setting_updates: {
                            [key]: key === POS_TERMINAL_REGISTRY_KEY
                                ? sanitizeTerminalRegistryForRead(normalizedValue)
                                : normalizedValue
                        }
                    },
                    actorUser
                });
                if (!complianceResult.success) {
                    return complianceResult;
                }
            }

            if (strictBindingRegistryPatch) {
                const currentRegistry = typeof settingsRepository?.getSettingsByKeys === 'function'
                    ? await settingsRepository.getSettingsByKeys([POS_TERMINAL_REGISTRY_KEY])
                    : {};
                strictBindingRegistryPatch = await hashTerminalRegistrySecrets({
                    incomingEntries: strictBindingRegistryPatch,
                    currentEntries: currentRegistry?.[POS_TERMINAL_REGISTRY_KEY]?.value || []
                });
                if (typeof settingsRepository?.updateSettings === 'function') {
                    await settingsRepository.updateSettings({
                        [POS_TERMINAL_REGISTRY_KEY]: strictBindingRegistryPatch,
                        [key]: normalizedValue
                    });
                    if (typeof settingsRepository?.getSettingByKey === 'function') {
                        const setting = await settingsRepository.getSettingByKey(key);
                        return ok(sanitizeSingleSettingForRead({ key, setting }));
                    }
                    return ok({ setting_key: key, value: normalizedValue });
                }

                await settingsRepository.updateSettingByKey(POS_TERMINAL_REGISTRY_KEY, strictBindingRegistryPatch);
            }

            const omittedStorefrontGalleryPaths = await snapshotStorefrontGalleryCleanup({
                settingsRepository,
                settingsData: { [key]: normalizedValue }
            });

            const updatedSetting = await settingsRepository.updateSettingByKey(key, normalizedValue);
            await cleanupOmittedStorefrontGalleryAssets({
                omittedPaths: omittedStorefrontGalleryPaths,
                storefrontAssetStorage
            });
            return ok(sanitizeSingleSettingForRead({ key, setting: updatedSetting }));
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to update setting'));
        }
    };
};
