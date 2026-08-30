import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapTenantLocationUseCaseError } from './tenantLocationUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';
import {
    isCustomerAccessModesEnabled,
    resolveAccessPolicyFromSettings
} from '../../shared/utils/customerAccessPolicy.js';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const toNullableDayCount = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const parseExpectedUpdateTimestamp = (payload = {}) => {
    const raw = payload.last_known_updated_at ?? payload.expected_updated_at ?? null;
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
};

const normalizePayload = (payload = {}) => ({
    name: String(payload.name || '').trim(),
    address_line: String(payload.address_line || '').trim(),
    latitude: Number(payload.latitude),
    longitude: Number(payload.longitude),
    delivery_radius_km: Number(payload.delivery_radius_km ?? 5),
    is_open: payload.is_open !== false,
    is_active: payload.is_active !== false,
    is_primary_storefront: payload.is_primary_storefront === true,
    operating_hours: payload.operating_hours ?? null,
    current_wait_time_minutes: Number(payload.current_wait_time_minutes ?? 15),
    allow_out_of_stock_sales: payload.allow_out_of_stock_sales === true,
    supports_delivery: payload.supports_delivery !== false,
    supports_pickup: payload.supports_pickup !== false,
    supports_dine_in: payload.supports_dine_in !== false,
    scheduling_enabled: payload.scheduling_enabled !== false,
    immediate_fulfillment_enabled: payload.immediate_fulfillment_enabled !== false,
    fulfillment_lead_time_min_days: toNullableDayCount(payload.fulfillment_lead_time_min_days),
    fulfillment_lead_time_max_days: toNullableDayCount(payload.fulfillment_lead_time_max_days)
});

const assertPrimaryStateValid = (payload) => {
    if (payload.is_primary_storefront === true && payload.is_active === false) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Primary storefront location must be active',
            { statusCode: 422 }
        );
    }
};
const assertFulfillmentLeadTimeValid = (payload) => {
    const min = payload.fulfillment_lead_time_min_days;
    const max = payload.fulfillment_lead_time_max_days;
    if (payload.immediate_fulfillment_enabled === false && (min === null || max === null)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED,
            'A fulfillment lead time (minimum and maximum days) is required when immediate fulfillment is disabled for this location.',
            { statusCode: 422 });
    }
    if (min !== null && max !== null && max < min) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED,
            'Fulfillment lead time maximum days must be greater than or equal to minimum days.', { statusCode: 422 });
    }
};

// #1093: mirrors storeUseCases.js's own currentTenantAccessContext() -- reading tenant-context
// metadata off dbStore's AsyncLocalStorage (not a model), the same precedent already established
// there for the identical isCustomerAccessModesEnabled() call.
const currentTenantAccessContext = () => {
    const store = dbStore.getStore?.() || {};
    return {
        tenantId: store.tenantId,
        tenantToken: store.tenantToken,
        tenantName: store.tenantName
    };
};

// The storefront reads tenant locations live first; discovery is a fallback. A mirror failure
// must therefore not roll back a committed merchant location write (#1218).
const syncDiscoveryIndexBestEffort = async ({ syncStorefrontDiscoveryIndexForTenant, logger }) => {
    if (typeof syncStorefrontDiscoveryIndexForTenant !== 'function') return;
    const { tenantId } = currentTenantAccessContext();
    if (!tenantId) return;
    try {
        await syncStorefrontDiscoveryIndexForTenant({ tenantId });
    } catch (error) {
        logger?.warn?.('[TenantLocations] Storefront discovery index sync failed', {
            tenantId, error: error?.message || 'unknown_error'
        });
    }
};

// #1093 (per-store delivery/pickup toggle). A location with neither delivery nor
// pickup enabled has no way to receive online orders at all -- but only when the store is
// actually in transaction mode; a dine-in-only restaurant expresses "no online orders" via
// customer_access_mode: 'catalog', not by disabling both of these (see ADR 0017; the storefront
// checkout axis is delivery/pickup only, never dine_in -- packages/shared-constants/src/
// orderMethods.js's STOREFRONT_FULFILLMENT_ORDER_METHODS).
//
// Only rejects a TRANSITION into a *reachable* both-off state -- an inactive location is never
// reachable by storefront checkout at all, so it's exempt regardless of its supports_* values
// (clause 1 below). A tenant whose location was ALREADY active and both-off before this guard
// landed must still be able to save an unrelated field on it without getting newly blocked
// (clause 2) -- but only "unrelated" in the narrow sense of "was already active and already
// both-off"; activating a previously-inactive both-off location is itself the transition into a
// reachable-but-unfulfillable state and must go through the check (#1093 review, RF-2 -- the
// settings-side guards in customerAccessModeFulfillmentPolicy.js only ever query active
// locations, so an inactive both-off location can otherwise slip through both directions of this
// invariant by switching customer_access_mode to transaction while inactive, then activating).
// A tenant already sitting at active-both-off in transaction mode (pre-dating this guard, clause
// 2) has its storefront checkout degrade gracefully instead (checkoutRules.js's
// `no_fulfillment_method` block reason).
const assertFulfillmentMethodAvailable = async ({ tenantLocationRepository, previous = null, next }) => {
    const nextBothOff = next.supports_delivery === false && next.supports_pickup === false;
    if (!nextBothOff) return;
    if (next.is_active !== true) return; // clause 1: not reachable, regardless of prior state

    const wasAlreadyActiveAndBothOff = previous
        ? previous.is_active === true
            && previous.supports_delivery === false
            && previous.supports_pickup === false
        : false;
    if (wasAlreadyActiveAndBothOff) return; // clause 2: genuinely unrelated edit, not a new activation

    const settings = await tenantLocationRepository.getCustomerAccessModeSettings();
    const accessPolicy = resolveAccessPolicyFromSettings(settings, {
        featureEnabled: isCustomerAccessModesEnabled(currentTenantAccessContext())
    });
    if (accessPolicy.effective_customer_access_mode !== 'transaction') return;

    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'At least one of delivery or pickup must stay enabled while this store accepts online orders (Transaction mode). To stop taking online orders instead, switch Customer Access Mode to Catalog Only.',
        { statusCode: 422 }
    );
};

const ensureSingleActivePrimary = async ({
    repository,
    preferredLocationId = null,
    transaction = null
}) => {
    const activePrimary = await repository.findActivePrimary({
        transaction,
        lock: true
    });
    if (activePrimary) {
        await repository.clearPrimaryFlags({
            excludeLocationId: activePrimary.location_id,
            transaction
        });
        return activePrimary;
    }

    let candidate = null;
    if (preferredLocationId) {
        const preferred = await repository.findById(preferredLocationId, { transaction });
        if (preferred?.is_active === true) {
            candidate = preferred;
        }
    }

    if (!candidate) {
        candidate = await repository.findPrimaryFallbackCandidate({ transaction });
    }
    if (!candidate) return null;

    await repository.clearPrimaryFlags({
        excludeLocationId: candidate.location_id,
        transaction
    });
    await repository.setPrimaryFlagById(candidate.location_id, { transaction });
    return candidate;
};

const ensureNameNotTaken = async ({ repository, name, excludeLocationId = null }) => {
    const duplicate = await repository.findByName(name, { excludeLocationId });
    if (duplicate) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `Location name already exists: ${name}`,
            { statusCode: 409 }
        );
    }
};

export const buildListTenantLocationsUseCase = ({ tenantLocationRepository }) => {
    return async ({ includeInactive = true } = {}) => {
        try {
            const locations = await tenantLocationRepository.listLocations({ includeInactive: includeInactive !== false });
            return ok(locations);
        } catch (error) {
            return fail(mapTenantLocationUseCaseError(error, 'Failed to list tenant locations'));
        }
    };
};

export const buildCreateTenantLocationUseCase = ({ tenantLocationRepository, syncStorefrontDiscoveryIndexForTenant = null, logger = null }) => {
    return async ({ payload }) => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const normalized = normalizePayload(payload);
            assertPrimaryStateValid(normalized);
            assertFulfillmentLeadTimeValid(normalized);
            await assertFulfillmentMethodAvailable({
                tenantLocationRepository,
                previous: null,
                next: normalized
            });
            await ensureNameNotTaken({
                repository: tenantLocationRepository,
                name: normalized.name
            });

            const transaction = await tenantLocationRepository.beginTransaction();
            try {
                const currentPrimary = await tenantLocationRepository.findActivePrimary({
                    transaction,
                    lock: true
                });
                const shouldSetPrimary = normalized.is_active === true
                    && (normalized.is_primary_storefront === true || !currentPrimary);

                const created = await tenantLocationRepository.create({
                    ...normalized,
                    is_primary_storefront: shouldSetPrimary
                }, { transaction });

                if (shouldSetPrimary) {
                    await tenantLocationRepository.clearPrimaryFlags({
                        excludeLocationId: created.location_id,
                        transaction
                    });
                } else {
                    await ensureSingleActivePrimary({
                        repository: tenantLocationRepository,
                        transaction
                    });
                }

                await transaction.commit();
                const refreshed = await tenantLocationRepository.findById(created.location_id);
                await syncDiscoveryIndexBestEffort({ syncStorefrontDiscoveryIndexForTenant, logger });
                return ok(refreshed || created);
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            return fail(mapTenantLocationUseCaseError(error, 'Failed to create tenant location'));
        }
    };
};

export const buildUpdateTenantLocationUseCase = ({ tenantLocationRepository, syncStorefrontDiscoveryIndexForTenant = null, logger = null }) => {
    return async ({ locationId, payload }) => {
        const normalizedId = parsePositiveInt(locationId);
        if (!normalizedId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'locationId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const expectedUpdatedAt = parseExpectedUpdateTimestamp(payload);
            const transaction = await tenantLocationRepository.beginTransaction();
            try {
                const existing = await tenantLocationRepository.findById(normalizedId, {
                    transaction,
                    lock: true
                });
                if (!existing) {
                    throw new DomainError(
                        DomainErrorCode.RESOURCE_NOT_FOUND,
                        `Tenant location not found: ${normalizedId}`,
                        { statusCode: 404 }
                    );
                }

                if (expectedUpdatedAt) {
                    const currentUpdatedAt = new Date(existing.updated_at).toISOString();
                    if (currentUpdatedAt !== expectedUpdatedAt) {
                        throw new DomainError(
                            DomainErrorCode.CONFLICT,
                            'Location was updated by another session. Please refresh and try again.',
                            {
                                statusCode: 409,
                                details: {
                                    expected_updated_at: expectedUpdatedAt,
                                    current_updated_at: currentUpdatedAt
                                }
                            }
                        );
                    }
                }

                const merged = normalizePayload({ ...existing, ...payload });
                assertPrimaryStateValid(merged);
                assertFulfillmentLeadTimeValid(merged);
                await assertFulfillmentMethodAvailable({
                    tenantLocationRepository,
                    previous: existing,
                    next: merged
                });
                if (merged.name && merged.name !== existing.name) {
                    await ensureNameNotTaken({
                        repository: tenantLocationRepository,
                        name: merged.name,
                        excludeLocationId: normalizedId
                    });
                }

                const updated = await tenantLocationRepository.updateById(normalizedId, merged, {
                    transaction,
                    lock: true
                });
                if (!updated) {
                    throw new DomainError(
                        DomainErrorCode.RESOURCE_NOT_FOUND,
                        `Tenant location not found: ${normalizedId}`,
                        { statusCode: 404 }
                    );
                }

                if (updated.is_active === true && updated.is_primary_storefront === true) {
                    await tenantLocationRepository.clearPrimaryFlags({
                        excludeLocationId: normalizedId,
                        transaction
                    });
                } else {
                    await ensureSingleActivePrimary({
                        repository: tenantLocationRepository,
                        preferredLocationId: updated.is_active === true ? updated.location_id : null,
                        transaction
                    });
                }

                await transaction.commit();
                const refreshed = await tenantLocationRepository.findById(normalizedId);
                await syncDiscoveryIndexBestEffort({ syncStorefrontDiscoveryIndexForTenant, logger });
                return ok(refreshed || updated);
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            return fail(mapTenantLocationUseCaseError(error, 'Failed to update tenant location'));
        }
    };
};

export const buildDeactivateTenantLocationUseCase = ({ tenantLocationRepository, syncStorefrontDiscoveryIndexForTenant = null, logger = null }) => {
    return async ({ locationId }) => {
        const normalizedId = parsePositiveInt(locationId);
        if (!normalizedId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'locationId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        try {
            const existing = await tenantLocationRepository.findById(normalizedId);
            if (!existing) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Tenant location not found: ${normalizedId}`,
                    { statusCode: 404 }
                ));
            }

            const transaction = await tenantLocationRepository.beginTransaction();
            try {
                const deactivated = await tenantLocationRepository.deactivateById(normalizedId, {
                    transaction,
                    lock: true
                });

                if (existing.is_primary_storefront === true) {
                    await ensureSingleActivePrimary({
                        repository: tenantLocationRepository,
                        transaction
                    });
                }

                await transaction.commit();
                const refreshed = await tenantLocationRepository.findById(normalizedId);
                await syncDiscoveryIndexBestEffort({ syncStorefrontDiscoveryIndexForTenant, logger });
                return ok(refreshed || deactivated);
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            return fail(mapTenantLocationUseCaseError(error, 'Failed to deactivate tenant location'));
        }
    };
};

export const buildDeleteTenantLocationUseCase = ({ tenantLocationRepository, syncStorefrontDiscoveryIndexForTenant = null, logger = null }) => {
    return async ({ locationId }) => {
        const normalizedId = parsePositiveInt(locationId);
        if (!normalizedId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'locationId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        try {
            const transaction = await tenantLocationRepository.beginTransaction();
            try {
                const existing = await tenantLocationRepository.findById(normalizedId, {
                    transaction,
                    lock: true
                });
                if (!existing) {
                    throw new DomainError(
                        DomainErrorCode.RESOURCE_NOT_FOUND,
                        `Tenant location not found: ${normalizedId}`,
                        { statusCode: 404 }
                    );
                }

                if (existing.is_active === true) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Deactivate this location before permanently deleting its pin.',
                        { statusCode: 409 }
                    );
                }

                const referenceCounts = await tenantLocationRepository.countOperationalReferences(normalizedId, {
                    transaction
                });
                if (Number(referenceCounts?.total || 0) > 0) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Location has operational history and cannot be permanently deleted. Deactivate it instead.',
                        {
                            statusCode: 409,
                            details: {
                                reference_counts: referenceCounts
                            }
                        }
                    );
                }

                const deleted = await tenantLocationRepository.deleteById(normalizedId, {
                    transaction,
                    lock: true
                });

                if (existing.is_primary_storefront === true) {
                    await ensureSingleActivePrimary({
                        repository: tenantLocationRepository,
                        transaction
                    });
                }

                await transaction.commit();
                await syncDiscoveryIndexBestEffort({ syncStorefrontDiscoveryIndexForTenant, logger });
                return ok({
                    location_id: normalizedId,
                    deleted: true,
                    previous: deleted || existing
                });
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                throw error;
            }
        } catch (error) {
            return fail(mapTenantLocationUseCaseError(error, 'Failed to delete tenant location'));
        }
    };
};
