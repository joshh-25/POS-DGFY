import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';
import {
    isWorkflowMode,
    normalizeWorkflowMode,
    DEFAULT_WORKFLOW_MODE,
    WORKFLOW_MODE_VALUES,
    ALL_WORKFLOW_CAPABILITIES,
    ENABLED_CAPABILITIES_SETTING_KEY,
    normalizeEnabledCapabilities,
    DISABLED_CAPABILITIES_SETTING_KEY,
    normalizeDisabledCapabilities,
    resolveEffectiveCapabilities,
    INVENTORY_AUTHORITY_SETTING_KEY,
    INVENTORY_AUTHORITY_VALUES,
    normalizeInventoryAuthority
} from '../../shared/constants/workflowModes.js';
import { validateModuleSelection } from '../../shared/constants/capabilityModules.js';
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
    applyStoreProfileShadowWrite,
    assertStoreProfileNotClientWritten
} from './storeProfileShadowWrite.js';
import {
    STORE_PROFILE_SETTING_KEY,
    STORE_PROFILE_READ_SETTING_KEY,
    normalizeStoreProfileReadFlag
} from '../../shared/constants/storeProfile.js';
import { applyWorkflowModeAuditLog, resolveWorkflowModeAuditBeforeValues } from './workflowModeAuditLog.js';
import logger from '../../../config/logger.js';
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
import { clearWorkflowCapabilitySettingsCache } from '../../shared/utils/workflowCapabilitySettingsCache.js';
import { isPlatformControlledImageClientConversionKey } from '../../shared/utils/imageClientConversionGate.js';
import { clearStoreProfileResolutionCache } from './resolveStoreProfile.js';
import { assertFulfillmentMethodAvailableForAccessModeTransition } from './customerAccessModeFulfillmentPolicy.js';
import { assertLaundryWorkflowModeRuntimeOwnership } from './laundryWorkflowModeRuntimeGuard.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const PLATFORM_MAX_CUSTOMER_ACCESS_MODE_KEY = 'platform_max_customer_access_mode';

// issue #178 Phase 22: mirrors updateSettingsUseCase.js's
// clearCapabilityCachesIfTouched for the single-key write path.
const CAPABILITY_CACHE_SENSITIVE_KEYS = Object.freeze([
    WORKFLOW_MODE_SETTING_KEY,
    ENABLED_CAPABILITIES_SETTING_KEY,
    DISABLED_CAPABILITIES_SETTING_KEY,
    STORE_PROFILE_READ_SETTING_KEY
]);

const clearCapabilityCachesIfKeyTouched = async (settingKey) => {
    if (!CAPABILITY_CACHE_SENSITIVE_KEYS.includes(settingKey)) return;
    clearWorkflowCapabilitySettingsCache();
    clearStoreProfileResolutionCache();
    // Dynamic import deliberately - see updateSettingsUseCase.js's identical
    // comment: a static import here would form a settings <-> inventory
    // circular init (itemRepository.js imports settings/index.js).
    const { clearItemRepositorySettingsCache } = await import('../../inventory/index.js');
    clearItemRepositorySettingsCache();
};

// Phase 16 (issue #178): mirrors assertEffectiveModuleSelectionIsBuildable
// in updateSettingsUseCase.js for the single-key write path. Resolves
// whichever of mode/enabled/disabled this write doesn't touch from the
// tenant's current settings, so a lone PATCH to ops_disabled_capabilities is
// validated against the tenant's real resulting state.
const assertEffectiveModuleSelectionIsBuildable = async ({ settingsRepository, key, normalizedValue }) => {
    const touchesMode = key === WORKFLOW_MODE_SETTING_KEY;
    const touchesEnabled = key === ENABLED_CAPABILITIES_SETTING_KEY;
    const touchesDisabled = key === DISABLED_CAPABILITIES_SETTING_KEY;
    if (!touchesMode && !touchesEnabled && !touchesDisabled) return;
    if (typeof settingsRepository?.getSettingsByKeys !== 'function') return;

    const current = await settingsRepository.getSettingsByKeys([
        WORKFLOW_MODE_SETTING_KEY,
        ENABLED_CAPABILITIES_SETTING_KEY,
        DISABLED_CAPABILITIES_SETTING_KEY
    ]);

    const effectiveMode = touchesMode
        ? normalizedValue
        : (current?.[WORKFLOW_MODE_SETTING_KEY]?.value ?? DEFAULT_WORKFLOW_MODE);
    const effectiveEnabled = touchesEnabled
        ? normalizedValue
        : (current?.[ENABLED_CAPABILITIES_SETTING_KEY]?.value ?? []);
    const effectiveDisabled = touchesDisabled
        ? normalizedValue
        : (current?.[DISABLED_CAPABILITIES_SETTING_KEY]?.value ?? []);

    // issue #178 Phase 22: mirrors updateSettingsUseCase.js's contradictory-
    // write rejection for the single-key path.
    const contradictory = normalizeEnabledCapabilities(effectiveEnabled)
        .filter((capability) => normalizeDisabledCapabilities(effectiveDisabled).includes(capability));
    if (contradictory.length > 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'A capability cannot be both enabled and disabled at the same time.',
            {
                statusCode: 422,
                details: {
                    reason_code: 'CAPABILITY_SELECTION_CONTRADICTORY',
                    contradictory_capabilities: contradictory
                }
            }
        );
    }

    const effectiveModules = resolveEffectiveCapabilities(effectiveMode, effectiveEnabled, effectiveDisabled);
    const validation = validateModuleSelection(effectiveModules);
    if (!validation.ok) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'The resulting capability selection is not buildable: a disabled capability is still required by another enabled one.',
            {
                statusCode: 422,
                details: {
                    reason_code: 'CAPABILITY_SELECTION_UNBUILDABLE',
                    ...validation
                }
            }
        );
    }
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

export const buildUpdateSettingByKeyUseCase = ({
    settingsRepository,
    storefrontAssetStorage = null,
    tenantLocationRepository = null,
    tenantRepository = null
}) => {
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
            // Phase 298 (#265): image_client_conversion / image_client_conversion_scopes are a
            // platform-controlled rollout lever, not a self-service tenant setting -- letting a
            // tenant admin flip it would break the controlled ladder. Same pattern as the POS
            // software identity keys above.
            if (actorUser?.is_platform_admin !== true && isPlatformControlledImageClientConversionKey(key)) {
                return fail(new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Client-side image conversion rollout is configured by platform admin.',
                    {
                        statusCode: 403,
                        details: {
                            reason_code: 'IMAGE_CLIENT_CONVERSION_PLATFORM_CONTROLLED',
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
            await assertFulfillmentMethodAvailableForAccessModeTransition({
                settingsData: { [key]: value },
                settingsRepository,
                tenantLocationRepository
            });
            assertStoreProfileNotClientWritten({ settingsData: { [key]: value } });
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
                await assertLaundryWorkflowModeRuntimeOwnership({
                    requestedMode: normalizedValue,
                    actorUser,
                    tenantRepository
                });
            }
            if (key === ENABLED_CAPABILITIES_SETTING_KEY) {
                if (!Array.isArray(value) || value.some((entry) => !ALL_WORKFLOW_CAPABILITIES.includes(String(entry || '').trim()))) {
                    return fail(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `ops_enabled_capabilities must be an array containing only: ${ALL_WORKFLOW_CAPABILITIES.join(', ')}`,
                        { statusCode: 422 }
                    ));
                }
                if (actorUser?.is_master_admin !== true) {
                    return fail(new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'Only master admin can update ops_enabled_capabilities',
                        { statusCode: 403 }
                    ));
                }
                normalizedValue = normalizeEnabledCapabilities(value);
            }
            if (key === DISABLED_CAPABILITIES_SETTING_KEY) {
                if (!Array.isArray(value) || value.some((entry) => !ALL_WORKFLOW_CAPABILITIES.includes(String(entry || '').trim()))) {
                    return fail(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `ops_disabled_capabilities must be an array containing only: ${ALL_WORKFLOW_CAPABILITIES.join(', ')}`,
                        { statusCode: 422 }
                    ));
                }
                if (actorUser?.is_master_admin !== true) {
                    return fail(new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'Only master admin can update ops_disabled_capabilities',
                        { statusCode: 403 }
                    ));
                }
                normalizedValue = normalizeDisabledCapabilities(value);
            }
            if (key === INVENTORY_AUTHORITY_SETTING_KEY) {
                if (!INVENTORY_AUTHORITY_VALUES.includes(String(value || '').trim().toLowerCase())) {
                    return fail(new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `inventory_authority must be one of: ${INVENTORY_AUTHORITY_VALUES.join(', ')}`,
                        { statusCode: 422 }
                    ));
                }
                if (actorUser?.is_master_admin !== true) {
                    return fail(new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'Only master admin can update inventory_authority',
                        { statusCode: 403 }
                    ));
                }
                normalizedValue = normalizeInventoryAuthority(value);
            }
            if (key === STORE_PROFILE_READ_SETTING_KEY) {
                if (actorUser?.is_master_admin !== true) {
                    return fail(new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'Only master admin can update ops_store_profile_read',
                        { statusCode: 403 }
                    ));
                }
                normalizedValue = normalizeStoreProfileReadFlag(value);
            }
            await assertEffectiveModuleSelectionIsBuildable({ settingsRepository, key, normalizedValue });
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

            // Phase 234 (#1327): fetched unconditionally, but cheap for the
            // common case - resolveWorkflowModeAuditBeforeValues only hits
            // the DB when `key` is one of the setting keys this audit log
            // actually tracks, same as updateSettingsUseCase.js's own
            // unconditional call.
            const workflowModeAuditBeforeValues = await resolveWorkflowModeAuditBeforeValues({
                settingsRepository,
                settingsData: { [key]: normalizedValue }
            });
            if (
                key === WORKFLOW_MODE_SETTING_KEY
                || key === ENABLED_CAPABILITIES_SETTING_KEY
                || key === DISABLED_CAPABILITIES_SETTING_KEY
            ) {
                const patchedSettingsData = await applyStoreProfileShadowWrite({
                    settingsRepository,
                    settingsData: { [key]: normalizedValue }
                });
                const shadowProfile = patchedSettingsData[STORE_PROFILE_SETTING_KEY];
                if (shadowProfile) {
                    await settingsRepository.updateSettingByKey(STORE_PROFILE_SETTING_KEY, shadowProfile);
                }
            }

            const updatedSetting = await settingsRepository.updateSettingByKey(key, normalizedValue);
            await clearCapabilityCachesIfKeyTouched(key);
            await cleanupOmittedStorefrontGalleryAssets({
                omittedPaths: omittedStorefrontGalleryPaths,
                storefrontAssetStorage
            });
            try {
                await applyWorkflowModeAuditLog({
                    settingsData: { [key]: normalizedValue },
                    beforeValues: workflowModeAuditBeforeValues,
                    actorUser
                });
            } catch (error) {
                logger.warn('[WorkflowModeAudit] failed to record workflow mode change log', {
                    error: error?.message
                });
            }
            return ok(sanitizeSingleSettingForRead({ key, setting: updatedSetting }));
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to update setting'));
        }
    };
};
