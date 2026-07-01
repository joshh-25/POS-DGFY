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
    sanitizeTerminalRegistryForRead
} from './posTerminalRegistrySecrets.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const PLATFORM_MAX_CUSTOMER_ACCESS_MODE_KEY = 'platform_max_customer_access_mode';

const assertTenantSettingsDoNotMutatePlatformAccessCeiling = ({ settingsData }) => {
    if (!Object.prototype.hasOwnProperty.call(settingsData, PLATFORM_MAX_CUSTOMER_ACCESS_MODE_KEY)) {
        return;
    }
    throw new DomainError(
        DomainErrorCode.AUTHORIZATION_FAILED,
        'Platform maximum Customer Access Mode is controlled by platform admin.',
        {
            statusCode: 403,
            details: {
                reason_code: 'CUSTOMER_ACCESS_PLATFORM_MAX_PLATFORM_CONTROLLED',
                setting_keys: [PLATFORM_MAX_CUSTOMER_ACCESS_MODE_KEY]
            }
        }
    );
};

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

const extractTenantReviewedPosReceiptChanges = async ({ settingsRepository, settingsData, actorUser }) => {
    if (actorUser?.is_platform_admin === true) {
        return { settingsData, pendingReviewKeys: [] };
    }

    const nextSettingsData = { ...settingsData };
    const reviewedSettingsData = {};
    const blockedSoftwareKeys = [];

    Object.keys(settingsData).forEach((key) => {
        if (isPlatformControlledPosSoftwareKey(key)) {
            blockedSoftwareKeys.push(key);
            delete nextSettingsData[key];
            return;
        }
        if (isTenantReviewedPosReceiptKey(key)) {
            reviewedSettingsData[key] = settingsData[key];
            delete nextSettingsData[key];
        }
    });

    if (blockedSoftwareKeys.length > 0) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Software name, software version, and software serial number are configured by platform admin for DGFY POS.',
            {
                statusCode: 403,
                details: {
                    reason_code: 'POS_SOFTWARE_IDENTITY_PLATFORM_CONTROLLED',
                    setting_keys: blockedSoftwareKeys
                }
            }
        );
    }

    const pendingReviewKeys = await resolveChangedSettingKeys({
        settingsRepository,
        settingsData: reviewedSettingsData
    });
    if (pendingReviewKeys.length === 0) {
        return { settingsData: nextSettingsData, pendingReviewKeys };
    }

    const pendingChanges = pendingReviewKeys.reduce((acc, key) => {
        acc[key] = reviewedSettingsData[key];
        return acc;
    }, {});
    const current = typeof settingsRepository?.getSettingByKey === 'function'
        ? await settingsRepository.getSettingByKey(POS_RECEIPT_METADATA_PENDING_SETTING_KEY).catch(() => null)
        : null;
    nextSettingsData[POS_RECEIPT_METADATA_PENDING_SETTING_KEY] = buildPendingPosReceiptMetadata({
        requestedChanges: pendingChanges,
        currentPending: current?.value,
        actorUser
    });
    return { settingsData: nextSettingsData, pendingReviewKeys };
};

export const buildUpdateSettingsUseCase = ({ settingsRepository, storefrontAssetStorage = null }) => {
    return async ({ settingsData, actorUser = null }) => {
        if (!settingsData || typeof settingsData !== 'object' || Array.isArray(settingsData)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'settingsData must be an object'
            ));
        }

        try {
            const posMetadataReview = await extractTenantReviewedPosReceiptChanges({
                settingsRepository,
                settingsData,
                actorUser
            });
            settingsData = posMetadataReview.settingsData;

            assertTenantSettingsDoNotMutatePlatformAccessCeiling({ settingsData });
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

            if (Object.prototype.hasOwnProperty.call(settingsData, POS_TERMINAL_REGISTRY_KEY)) {
                const current = typeof settingsRepository?.getSettingsByKeys === 'function'
                    ? await settingsRepository.getSettingsByKeys([POS_TERMINAL_REGISTRY_KEY])
                    : {};
                settingsData[POS_TERMINAL_REGISTRY_KEY] = await hashTerminalRegistrySecrets({
                    incomingEntries: settingsData[POS_TERMINAL_REGISTRY_KEY],
                    currentEntries: current?.[POS_TERMINAL_REGISTRY_KEY]?.value || []
                });
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
                        setting_updates: {
                            ...settingsData,
                            ...(Object.prototype.hasOwnProperty.call(settingsData, POS_TERMINAL_REGISTRY_KEY)
                                ? {
                                    [POS_TERMINAL_REGISTRY_KEY]: sanitizeTerminalRegistryForRead(
                                        settingsData[POS_TERMINAL_REGISTRY_KEY]
                                    )
                                }
                                : {})
                        }
                    },
                    actorUser
                });
                if (!complianceResult.success) {
                    return complianceResult;
                }
            }

            if (Object.keys(settingsData).length === 0) {
                return ok({
                    message: posMetadataReview.pendingReviewKeys.length > 0
                        ? 'Receipt metadata changes submitted for platform admin approval'
                        : 'No settings changes detected',
                    updated: 0,
                    pending_review_keys: posMetadataReview.pendingReviewKeys
                });
            }

            const omittedStorefrontGalleryPaths = await snapshotStorefrontGalleryCleanup({
                settingsRepository,
                settingsData
            });

            const result = await settingsRepository.updateSettings(settingsData);
            await cleanupOmittedStorefrontGalleryAssets({
                omittedPaths: omittedStorefrontGalleryPaths,
                storefrontAssetStorage
            });
            return ok({
                ...result,
                pending_review_keys: posMetadataReview.pendingReviewKeys
            });
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to update settings'));
        }
    };
};
