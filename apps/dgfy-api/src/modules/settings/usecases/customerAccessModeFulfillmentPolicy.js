import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    CUSTOMER_ACCESS_SETTING_KEYS,
    isCustomerAccessModesEnabled,
    resolveAccessPolicyFromSettings
} from '../../shared/utils/customerAccessPolicy.js';
import dbStore from '../../../utils/dbStore.js';

const CUSTOMER_ACCESS_MODE_KEY = 'customer_access_mode';

// Mirrors tenantLocationUseCases.js's currentTenantAccessContext() -- reading tenant-context
// metadata off dbStore's AsyncLocalStorage (not a model), the same precedent storeUseCases.js
// already established for the identical isCustomerAccessModesEnabled() call.
const currentTenantAccessContext = () => {
    const store = dbStore.getStore?.() || {};
    return {
        tenantId: store.tenantId,
        tenantToken: store.tenantToken,
        tenantName: store.tenantName
    };
};

const isLocationUnfulfillable = (location) => (
    location?.supports_delivery === false && location?.supports_pickup === false
);

// #1093 follow-up (PR #1096 review, RF-1). Pure, I/O-free: every write path that can move
// customer_access_mode toward 'transaction' fetches its own "resulting locations" list its own
// way (tenantLocationRepository here, a direct TenantLocation query in
// updateTenantCapabilitiesUseCase.js's platform-admin path, since that file already runs inside
// its own tenant-scoped transaction and has no reason to take on a second repository dependency)
// and calls this one shared check, so the actual invariant -- and its wording -- only exists once.
export const assertNoUnfulfillableLocationForTransactionMode = ({
    effectiveCustomerAccessMode,
    locations = []
}) => {
    if (effectiveCustomerAccessMode !== 'transaction') return;

    const unfulfillable = (Array.isArray(locations) ? locations : []).find(isLocationUnfulfillable);
    if (!unfulfillable) return;

    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `Location "${unfulfillable.name || unfulfillable.location_id}" has neither delivery nor `
            + 'pickup enabled -- fix that location\'s fulfillment methods before switching '
            + 'Customer Access Mode to Transaction.',
        {
            statusCode: 422,
            details: {
                reason_code: 'FULFILLMENT_METHOD_UNAVAILABLE',
                location_id: unfulfillable.location_id
            }
        }
    );
};

// tenantLocationUseCases.js's own guard only stops a location-level write from CREATING a store
// with no fulfillment method -- it has no way to stop the other direction: a settings write that
// flips customer_access_mode to 'transaction' while a location already sits at both-off (a
// legitimate prior state under Catalog Only). This closes that direction for the tenant-facing
// settings write paths (updateSettingsUseCase.js's bulk PUT /settings, and
// updateSettingByKeyUseCase.js's single-key PUT /settings/:key).
//
// platform_max_customer_access_mode, the only other resolveAccessPolicyFromSettings input a
// tenant could otherwise move, is already unconditionally blocked from both of those paths
// (assertTenantSettingsDoNotMutatePlatformAccessCeiling / the single-key 403 on
// PLATFORM_MAX_CUSTOMER_ACCESS_MODE_KEY) -- customer_access_mode is the only lever a tenant
// write can actually pull here, so this is a no-op (no repository call at all) unless the write
// actually touches it.
export const assertFulfillmentMethodAvailableForAccessModeTransition = async ({
    settingsData,
    settingsRepository,
    tenantLocationRepository
}) => {
    if (!Object.prototype.hasOwnProperty.call(settingsData, CUSTOMER_ACCESS_MODE_KEY)) return;
    if (typeof tenantLocationRepository?.listLocations !== 'function') return;

    const currentSettings = typeof settingsRepository?.getSettingsByKeys === 'function'
        ? await settingsRepository.getSettingsByKeys(CUSTOMER_ACCESS_SETTING_KEYS)
        : {};
    const mergedSettings = {
        ...currentSettings,
        [CUSTOMER_ACCESS_MODE_KEY]: { value: settingsData[CUSTOMER_ACCESS_MODE_KEY] }
    };
    const accessPolicy = resolveAccessPolicyFromSettings(mergedSettings, {
        featureEnabled: isCustomerAccessModesEnabled(currentTenantAccessContext())
    });
    if (accessPolicy.effective_customer_access_mode !== 'transaction') return;

    const locations = await tenantLocationRepository.listLocations({ includeInactive: false });
    assertNoUnfulfillableLocationForTransactionMode({
        effectiveCustomerAccessMode: accessPolicy.effective_customer_access_mode,
        locations
    });
};
