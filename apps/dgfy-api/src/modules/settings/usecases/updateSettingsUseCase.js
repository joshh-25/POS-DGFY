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
import {
    POS_SETTINGS_ACCESS_PIN_HASH_KEY,
    assertPosSettingsAccessPinAuthorization,
    resolvePosSettingsAccessPinPatch
} from './posSettingsAccessPinPolicy.js';
import {
    applyStoreProfileShadowWrite,
    assertStoreProfileNotClientWritten
} from './storeProfileShadowWrite.js';
import { STORE_PROFILE_READ_SETTING_KEY, normalizeStoreProfileReadFlag } from '../../shared/constants/storeProfile.js';
import { applyWorkflowModeAuditLog } from './workflowModeAuditLog.js';
import logger from '../../../config/logger.js';
import { clearWorkflowCapabilitySettingsCache } from '../../shared/utils/workflowCapabilitySettingsCache.js';
import { clearStoreProfileResolutionCache } from './resolveStoreProfile.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const PLATFORM_MAX_CUSTOMER_ACCESS_MODE_KEY = 'platform_max_customer_access_mode';

// issue #178 Phase 22: a write to any of these settings can change what the
// capability gate (15s TTL), the Store Profile resolver, and item-taxonomy
// validation's settings cache (5min TTL) would otherwise keep serving stale
// for up to that long. Cleared together whenever a write touches any one of
// them, mirroring applyTemplateToTenantUseCase.js's same three-cache clear.
const CAPABILITY_CACHE_SENSITIVE_KEYS = Object.freeze([
    WORKFLOW_MODE_SETTING_KEY,
    ENABLED_CAPABILITIES_SETTING_KEY,
    DISABLED_CAPABILITIES_SETTING_KEY,
    STORE_PROFILE_READ_SETTING_KEY
]);

const clearCapabilityCachesIfTouched = async (settingsData) => {
    const touched = CAPABILITY_CACHE_SENSITIVE_KEYS.some((key) => (
        Object.prototype.hasOwnProperty.call(settingsData, key)
    ));
    if (!touched) return;
    clearWorkflowCapabilitySettingsCache();
    clearStoreProfileResolutionCache();
    // Dynamic import deliberately - inventory/index.js imports settings/index.js
    // (itemRepository.js reads getAllSettingsUseCase), so a static import
    // here would form settings <-> inventory circular init and throw
    // "Cannot access 'buildUpdateSettingsUseCase' before initialization" at
    // module load. Deferred until this function actually runs, well after
    // both modules have finished evaluating.
    const { clearItemRepositorySettingsCache } = await import('../../inventory/index.js');
    clearItemRepositorySettingsCache();
};

// Mode-switch hardening (issue #178 phase 5): capture the pre-write values so
// the audit log can record an accurate from -> to, even though the actual
// diffing/writing of the log happens after the setting write succeeds.
const resolveWorkflowModeAuditBeforeValues = async ({ settingsRepository, settingsData }) => {
    const touchesMode = Object.prototype.hasOwnProperty.call(settingsData, WORKFLOW_MODE_SETTING_KEY);
    const touchesOverlay = Object.prototype.hasOwnProperty.call(settingsData, ENABLED_CAPABILITIES_SETTING_KEY);
    const touchesDisabledOverlay = Object.prototype.hasOwnProperty.call(settingsData, DISABLED_CAPABILITIES_SETTING_KEY);
    if (
        (!touchesMode && !touchesOverlay && !touchesDisabledOverlay)
        || typeof settingsRepository?.getSettingsByKeys !== 'function'
    ) {
        return {};
    }
    const current = await settingsRepository.getSettingsByKeys([
        WORKFLOW_MODE_SETTING_KEY,
        ENABLED_CAPABILITIES_SETTING_KEY,
        DISABLED_CAPABILITIES_SETTING_KEY
    ]);
    return {
        [WORKFLOW_MODE_SETTING_KEY]: current?.[WORKFLOW_MODE_SETTING_KEY]?.value ?? null,
        [ENABLED_CAPABILITIES_SETTING_KEY]: current?.[ENABLED_CAPABILITIES_SETTING_KEY]?.value ?? null,
        [DISABLED_CAPABILITIES_SETTING_KEY]: current?.[DISABLED_CAPABILITIES_SETTING_KEY]?.value ?? null
    };
};

// The audit log is diagnostic, not authoritative: a logging failure must
// never roll back or mask an otherwise-successful settings write.
const safelyLogWorkflowModeAudit = async ({ settingsData, beforeValues, actorUser }) => {
    try {
        await applyWorkflowModeAuditLog({ settingsData, beforeValues, actorUser });
    } catch (error) {
        logger.warn('[WorkflowModeAudit] failed to record workflow mode change log', {
            error: error?.message
        });
    }
};

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

const assertEnabledCapabilitiesAuthorization = ({ settingsData, actorUser }) => {
    if (!Object.prototype.hasOwnProperty.call(settingsData, ENABLED_CAPABILITIES_SETTING_KEY)) {
        return;
    }

    const requested = settingsData[ENABLED_CAPABILITIES_SETTING_KEY];
    if (!Array.isArray(requested) || requested.some((entry) => !ALL_WORKFLOW_CAPABILITIES.includes(String(entry || '').trim()))) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `ops_enabled_capabilities must be an array containing only: ${ALL_WORKFLOW_CAPABILITIES.join(', ')}`,
            { statusCode: 422 }
        );
    }

    if (actorUser?.is_master_admin !== true) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only master admin can update ops_enabled_capabilities',
            { statusCode: 403 }
        );
    }

    settingsData[ENABLED_CAPABILITIES_SETTING_KEY] = normalizeEnabledCapabilities(requested);
};

// Phase 16 (issue #178): the subtractive counterpart to
// assertEnabledCapabilitiesAuthorization - same allowlist, same master-admin
// gate, same shape.
const assertDisabledCapabilitiesAuthorization = ({ settingsData, actorUser }) => {
    if (!Object.prototype.hasOwnProperty.call(settingsData, DISABLED_CAPABILITIES_SETTING_KEY)) {
        return;
    }

    const requested = settingsData[DISABLED_CAPABILITIES_SETTING_KEY];
    if (!Array.isArray(requested) || requested.some((entry) => !ALL_WORKFLOW_CAPABILITIES.includes(String(entry || '').trim()))) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `ops_disabled_capabilities must be an array containing only: ${ALL_WORKFLOW_CAPABILITIES.join(', ')}`,
            { statusCode: 422 }
        );
    }

    if (actorUser?.is_master_admin !== true) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only master admin can update ops_disabled_capabilities',
            { statusCode: 403 }
        );
    }

    settingsData[DISABLED_CAPABILITIES_SETTING_KEY] = normalizeDisabledCapabilities(requested);
};

// Phase 16 (issue #178): once a write can touch mode, the enabled overlay,
// or the disabled overlay, the *combined* result must still be a buildable
// selection - disabling `catalog` while `pos` (which requires it) stays
// enabled must reject, not silently persist a store that can never serve a
// POS request. Resolves whichever of the three keys this write doesn't
// touch from the tenant's current settings, so a single-key PATCH is
// validated against the tenant's real resulting state, not just the delta.
const assertEffectiveModuleSelectionIsBuildable = async ({ settingsRepository, settingsData }) => {
    const touchesMode = Object.prototype.hasOwnProperty.call(settingsData, WORKFLOW_MODE_SETTING_KEY);
    const touchesEnabled = Object.prototype.hasOwnProperty.call(settingsData, ENABLED_CAPABILITIES_SETTING_KEY);
    const touchesDisabled = Object.prototype.hasOwnProperty.call(settingsData, DISABLED_CAPABILITIES_SETTING_KEY);
    if (!touchesMode && !touchesEnabled && !touchesDisabled) return;
    if (typeof settingsRepository?.getSettingsByKeys !== 'function') return;

    const current = await settingsRepository.getSettingsByKeys([
        WORKFLOW_MODE_SETTING_KEY,
        ENABLED_CAPABILITIES_SETTING_KEY,
        DISABLED_CAPABILITIES_SETTING_KEY
    ]);

    const effectiveMode = touchesMode
        ? settingsData[WORKFLOW_MODE_SETTING_KEY]
        : (current?.[WORKFLOW_MODE_SETTING_KEY]?.value ?? DEFAULT_WORKFLOW_MODE);
    const effectiveEnabled = touchesEnabled
        ? settingsData[ENABLED_CAPABILITIES_SETTING_KEY]
        : (current?.[ENABLED_CAPABILITIES_SETTING_KEY]?.value ?? []);
    const effectiveDisabled = touchesDisabled
        ? settingsData[DISABLED_CAPABILITIES_SETTING_KEY]
        : (current?.[DISABLED_CAPABILITIES_SETTING_KEY]?.value ?? []);

    // issue #178 Phase 22: a capability requested in both overlays at once is
    // a contradictory write, not an ambiguous one - resolveEffectiveCapabilities'
    // subtraction-wins ordering makes it harmless (the capability simply
    // isn't granted), but silently resolving it hides what is very likely a
    // curation mistake. Reject explicitly rather than accept-and-ignore.
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

// Phase 9 Axis 4 delegation switch - mirrors
// assertEnabledCapabilitiesAuthorization's shape exactly (master-admin
// gated, validated against a fixed value set) rather than the ungoverned
// multi_location_inventory_enabled flag.
const assertInventoryAuthorityAuthorization = ({ settingsData, actorUser }) => {
    if (!Object.prototype.hasOwnProperty.call(settingsData, INVENTORY_AUTHORITY_SETTING_KEY)) {
        return;
    }

    const requested = settingsData[INVENTORY_AUTHORITY_SETTING_KEY];
    if (!INVENTORY_AUTHORITY_VALUES.includes(String(requested || '').trim().toLowerCase())) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `inventory_authority must be one of: ${INVENTORY_AUTHORITY_VALUES.join(', ')}`,
            { statusCode: 422 }
        );
    }

    if (actorUser?.is_master_admin !== true) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only master admin can update inventory_authority',
            { statusCode: 403 }
        );
    }

    settingsData[INVENTORY_AUTHORITY_SETTING_KEY] = normalizeInventoryAuthority(requested);
};

// Issue #178 Phase 12 switch, wired Phase 19 - mirrors
// assertEnabledCapabilitiesAuthorization's/assertInventoryAuthorityAuthorization's
// shape (master-admin gated). Turning this on for a tenant makes
// requireWorkflowCapability gate on resolveStoreProfile.js's resolution
// instead of the registries directly - see that file's own doc comment.
const assertStoreProfileReadFlagAuthorization = ({ settingsData, actorUser }) => {
    if (!Object.prototype.hasOwnProperty.call(settingsData, STORE_PROFILE_READ_SETTING_KEY)) {
        return;
    }

    if (actorUser?.is_master_admin !== true) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Only master admin can update ops_store_profile_read',
            { statusCode: 403 }
        );
    }

    settingsData[STORE_PROFILE_READ_SETTING_KEY] = normalizeStoreProfileReadFlag(settingsData[STORE_PROFILE_READ_SETTING_KEY]);
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
            assertStoreProfileNotClientWritten({ settingsData });
            assertWorkflowModeAuthorization({ settingsData, actorUser });
            assertEnabledCapabilitiesAuthorization({ settingsData, actorUser });
            assertDisabledCapabilitiesAuthorization({ settingsData, actorUser });
            await assertEffectiveModuleSelectionIsBuildable({ settingsRepository, settingsData });
            assertInventoryAuthorityAuthorization({ settingsData, actorUser });
            assertStoreProfileReadFlagAuthorization({ settingsData, actorUser });
            assertPosSettingsAccessPinAuthorization({ settingsData, actorUser });
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

            const currentPinHashSetting = (
                Object.prototype.hasOwnProperty.call(settingsData, 'pos_settings_access_pin')
                || Object.prototype.hasOwnProperty.call(settingsData, 'clear_pos_settings_access_pin')
                    ? await settingsRepository.getSettingsByKeys([POS_SETTINGS_ACCESS_PIN_HASH_KEY])
                    : {}
            );
            settingsData = await resolvePosSettingsAccessPinPatch({
                settingsData,
                currentHash: currentPinHashSetting?.[POS_SETTINGS_ACCESS_PIN_HASH_KEY]?.value || ''
            });

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

            const auditBeforeValues = await resolveWorkflowModeAuditBeforeValues({
                settingsRepository,
                settingsData
            });

            settingsData = await applyStoreProfileShadowWrite({ settingsRepository, settingsData });

            const result = await settingsRepository.updateSettings(settingsData);
            await clearCapabilityCachesIfTouched(settingsData);
            await cleanupOmittedStorefrontGalleryAssets({
                omittedPaths: omittedStorefrontGalleryPaths,
                storefrontAssetStorage
            });
            await safelyLogWorkflowModeAudit({ settingsData, beforeValues: auditBeforeValues, actorUser });
            return ok({
                ...result,
                pending_review_keys: posMetadataReview.pendingReviewKeys
            });
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to update settings'));
        }
    };
};
