import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapTenantLocationUseCaseError } from './tenantLocationUseCaseError.js';

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
    supports_dine_in: payload.supports_dine_in !== false
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

export const buildCreateTenantLocationUseCase = ({ tenantLocationRepository }) => {
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

export const buildUpdateTenantLocationUseCase = ({ tenantLocationRepository }) => {
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

export const buildDeactivateTenantLocationUseCase = ({ tenantLocationRepository }) => {
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

export const buildDeleteTenantLocationUseCase = ({ tenantLocationRepository }) => {
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
