import { jest } from '@jest/globals';
import {
    buildCreateTenantLocationUseCase,
    buildUpdateTenantLocationUseCase
} from '../src/modules/tenantLocations/usecases/tenantLocationUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import dbStore from '../src/utils/dbStore.js';

// #1218: per-location delivery timing policy -- disable scheduling, suppress NOW, require a
// merchant-set lead time. Modelled on tenantLocationFulfillmentMethodGuard.usecases.test.js's
// own harness shape (explicit per-test repository mocks, findById mocked once per read in the
// use case's own read/refresh sequence) rather than inventing a different style.

const createTransactionMock = () => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = true; }),
        rollback: jest.fn(async () => { transaction.finished = true; }),
        LOCK: { UPDATE: 'UPDATE' }
    };
    return transaction;
};

// Both delivery and pickup stay enabled throughout this file so assertFulfillmentMethodAvailable
// (#1093) never trips and getCustomerAccessModeSettings never needs to be mocked -- these tests
// are exclusively about the #1218 timing-policy assertion layered immediately after it.
const baseLocation = (overrides = {}) => ({
    location_id: 41,
    name: 'Surebiz Branch',
    address_line: 'Iloilo City',
    latitude: 10.7,
    longitude: 122.5,
    is_active: true,
    is_open: true,
    is_primary_storefront: true,
    delivery_radius_km: 5,
    current_wait_time_minutes: 15,
    allow_out_of_stock_sales: false,
    supports_delivery: true,
    supports_pickup: true,
    supports_dine_in: false,
    scheduling_enabled: true,
    immediate_fulfillment_enabled: true,
    fulfillment_lead_time_min_days: null,
    fulfillment_lead_time_max_days: null,
    ...overrides
});

describe('tenant location delivery timing policy (#1218)', () => {
    // 1. create with immediate_fulfillment_enabled: false and no lead time -> 422
    it('rejects creating a location with immediate fulfillment disabled and no lead time', async () => {
        const transaction = createTransactionMock();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findByName: jest.fn().mockResolvedValue(null),
            findActivePrimary: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            getCustomerAccessModeSettings: jest.fn().mockRejectedValue(new Error('should not be called'))
        };

        const useCase = buildCreateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            payload: {
                name: 'New Branch',
                address_line: 'Iloilo City',
                latitude: 10.7,
                longitude: 122.5,
                immediate_fulfillment_enabled: false
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
        expect(repository.create).not.toHaveBeenCalled();
    });

    // 2. update (partial PUT of only { immediate_fulfillment_enabled: false }) against a row with
    // no lead time -> 422
    it('rejects a partial update disabling immediate fulfillment against a row with no lead time', async () => {
        const transaction = createTransactionMock();
        const existing = baseLocation();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn().mockResolvedValue(existing),
            updateById: jest.fn(),
            getCustomerAccessModeSettings: jest.fn().mockRejectedValue(new Error('should not be called'))
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { immediate_fulfillment_enabled: false }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
        expect(repository.updateById).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
    });

    // 3. same partial PUT against a row that already has a valid lead time -> succeeds. This is
    // the case Joi cannot express (it never sees the persisted row) and the whole reason the
    // assertion lives in the use case, against the *merged* payload.
    it('accepts a partial update disabling immediate fulfillment against a row with an existing valid lead time', async () => {
        const transaction = createTransactionMock();
        const existing = baseLocation({ fulfillment_lead_time_min_days: 3, fulfillment_lead_time_max_days: 7 });
        const updated = baseLocation({
            immediate_fulfillment_enabled: false,
            fulfillment_lead_time_min_days: 3,
            fulfillment_lead_time_max_days: 7
        });
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn()
                .mockResolvedValueOnce(existing)
                .mockResolvedValueOnce(updated),
            findByName: jest.fn().mockResolvedValue(null),
            updateById: jest.fn().mockResolvedValue(updated),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined)
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { immediate_fulfillment_enabled: false }
        });

        expect(result.success).toBe(true);
        expect(repository.updateById).toHaveBeenCalledWith(
            41,
            expect.objectContaining({
                immediate_fulfillment_enabled: false,
                fulfillment_lead_time_min_days: 3,
                fulfillment_lead_time_max_days: 7
            }),
            expect.any(Object)
        );
    });

    // 4. max < min -> 422, both while immediate fulfillment is enabled and while disabled.
    it('rejects an inverted lead-time range while immediate fulfillment stays enabled', async () => {
        const transaction = createTransactionMock();
        const existing = baseLocation();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn().mockResolvedValue(existing),
            updateById: jest.fn()
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { fulfillment_lead_time_min_days: 8, fulfillment_lead_time_max_days: 2 }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(repository.updateById).not.toHaveBeenCalled();
    });

    it('rejects an inverted lead-time range while immediate fulfillment is disabled', async () => {
        const transaction = createTransactionMock();
        const existing = baseLocation();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn().mockResolvedValue(existing),
            updateById: jest.fn()
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: {
                immediate_fulfillment_enabled: false,
                fulfillment_lead_time_min_days: 8,
                fulfillment_lead_time_max_days: 2
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(repository.updateById).not.toHaveBeenCalled();
    });

    // 5. min === max -> succeeds
    it('accepts a lead-time range where min equals max', async () => {
        const transaction = createTransactionMock();
        const existing = baseLocation();
        const updated = baseLocation({
            immediate_fulfillment_enabled: false,
            fulfillment_lead_time_min_days: 3,
            fulfillment_lead_time_max_days: 3
        });
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn()
                .mockResolvedValueOnce(existing)
                .mockResolvedValueOnce(updated),
            findByName: jest.fn().mockResolvedValue(null),
            updateById: jest.fn().mockResolvedValue(updated),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined)
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: {
                immediate_fulfillment_enabled: false,
                fulfillment_lead_time_min_days: 3,
                fulfillment_lead_time_max_days: 3
            }
        });

        expect(result.success).toBe(true);
        expect(repository.updateById).toHaveBeenCalledWith(
            41,
            expect.objectContaining({ fulfillment_lead_time_min_days: 3, fulfillment_lead_time_max_days: 3 }),
            expect.any(Object)
        );
    });

    // 6. defaults: a create payload omitting all four fields persists scheduling_enabled: true,
    // immediate_fulfillment_enabled: true, both lead times null.
    it('defaults a create payload omitting all four fields to enabled/enabled/null/null', async () => {
        const transaction = createTransactionMock();
        const created = baseLocation();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findByName: jest.fn().mockResolvedValue(null),
            findActivePrimary: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(created),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined),
            findById: jest.fn().mockResolvedValue(created)
        };

        const useCase = buildCreateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            payload: {
                name: 'New Branch',
                address_line: 'Iloilo City',
                latitude: 10.7,
                longitude: 122.5
            }
        });

        expect(result.success).toBe(true);
        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                scheduling_enabled: true,
                immediate_fulfillment_enabled: true,
                fulfillment_lead_time_min_days: null,
                fulfillment_lead_time_max_days: null
            }),
            expect.any(Object)
        );
    });

    // 7. reactivateTenantLocation's shape (PUT with only { is_active: true }) against a
    // both-defaults row -> succeeds. Regression pin against over-eager validation: the guard
    // must not fire just because the merged row's booleans are still at their defaults.
    it('accepts a reactivate-shaped PUT ({ is_active: true } only) against a both-defaults row', async () => {
        const transaction = createTransactionMock();
        const existing = baseLocation({ is_active: false, is_primary_storefront: false });
        const updated = baseLocation({ is_active: true, is_primary_storefront: false });
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            // First call is the transaction-locked read; every call after (ensureSingleActive-
            // Primary's "preferred" re-read, then the post-commit refresh) sees the updated row.
            findById: jest.fn()
                .mockResolvedValueOnce(existing)
                .mockResolvedValue(updated),
            findByName: jest.fn().mockResolvedValue(null),
            updateById: jest.fn().mockResolvedValue(updated),
            findActivePrimary: jest.fn().mockResolvedValue(null),
            findPrimaryFallbackCandidate: jest.fn().mockResolvedValue(updated),
            setPrimaryFlagById: jest.fn().mockResolvedValue(undefined),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined)
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { is_active: true }
        });

        expect(result.success).toBe(true);
        expect(repository.updateById).toHaveBeenCalledWith(
            41,
            expect.objectContaining({
                scheduling_enabled: true,
                immediate_fulfillment_enabled: true,
                fulfillment_lead_time_min_days: null,
                fulfillment_lead_time_max_days: null
            }),
            expect.any(Object)
        );
    });

    // 8. a successful create/update calls the injected syncStorefrontDiscoveryIndexForTenant
    // exactly once, after commit; a throwing stub does not fail the use case (best-effort, §5.2b).
    describe('discovery-index sync trigger', () => {
        it('calls the injected sync exactly once, after transaction.commit(), on a successful update', async () => {
            const transaction = createTransactionMock();
            const existing = baseLocation();
            const updated = baseLocation({ current_wait_time_minutes: 20 });
            const repository = {
                beginTransaction: jest.fn().mockResolvedValue(transaction),
                findById: jest.fn()
                    .mockResolvedValueOnce(existing)
                    .mockResolvedValueOnce(updated),
                findByName: jest.fn().mockResolvedValue(null),
                updateById: jest.fn().mockResolvedValue(updated),
                clearPrimaryFlags: jest.fn().mockResolvedValue(undefined)
            };

            const callOrder = [];
            transaction.commit.mockImplementation(async () => {
                transaction.finished = true;
                callOrder.push('commit');
            });
            const syncStorefrontDiscoveryIndexForTenant = jest.fn(async () => {
                callOrder.push('sync');
            });

            const useCase = buildUpdateTenantLocationUseCase({
                tenantLocationRepository: repository,
                syncStorefrontDiscoveryIndexForTenant
            });
            const result = await dbStore.run({ tenantId: 41 }, () => useCase({
                locationId: 41,
                payload: { current_wait_time_minutes: 20 }
            }));

            expect(result.success).toBe(true);
            expect(syncStorefrontDiscoveryIndexForTenant).toHaveBeenCalledTimes(1);
            expect(callOrder).toEqual(['commit', 'sync']);
        });

        it('does not fail the update when the injected sync throws (best-effort)', async () => {
            const transaction = createTransactionMock();
            const existing = baseLocation();
            const updated = baseLocation({ current_wait_time_minutes: 20 });
            const repository = {
                beginTransaction: jest.fn().mockResolvedValue(transaction),
                findById: jest.fn()
                    .mockResolvedValueOnce(existing)
                    .mockResolvedValueOnce(updated),
                findByName: jest.fn().mockResolvedValue(null),
                updateById: jest.fn().mockResolvedValue(updated),
                clearPrimaryFlags: jest.fn().mockResolvedValue(undefined)
            };
            const syncStorefrontDiscoveryIndexForTenant = jest.fn().mockRejectedValue(new Error('landlord db unreachable'));
            const logger = { warn: jest.fn() };

            const useCase = buildUpdateTenantLocationUseCase({
                tenantLocationRepository: repository,
                syncStorefrontDiscoveryIndexForTenant,
                logger
            });
            const result = await dbStore.run({ tenantId: 41 }, () => useCase({
                locationId: 41,
                payload: { current_wait_time_minutes: 20 }
            }));

            expect(result.success).toBe(true);
            expect(syncStorefrontDiscoveryIndexForTenant).toHaveBeenCalledTimes(1);
        });

        it('calls the injected sync exactly once, after commit, on a successful create', async () => {
            const transaction = createTransactionMock();
            const created = baseLocation();
            const repository = {
                beginTransaction: jest.fn().mockResolvedValue(transaction),
                findByName: jest.fn().mockResolvedValue(null),
                findActivePrimary: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue(created),
                clearPrimaryFlags: jest.fn().mockResolvedValue(undefined),
                findById: jest.fn().mockResolvedValue(created)
            };

            const callOrder = [];
            transaction.commit.mockImplementation(async () => {
                transaction.finished = true;
                callOrder.push('commit');
            });
            const syncStorefrontDiscoveryIndexForTenant = jest.fn(async () => {
                callOrder.push('sync');
            });

            const useCase = buildCreateTenantLocationUseCase({
                tenantLocationRepository: repository,
                syncStorefrontDiscoveryIndexForTenant
            });
            const result = await dbStore.run({ tenantId: 41 }, () => useCase({
                payload: {
                    name: 'New Branch',
                    address_line: 'Iloilo City',
                    latitude: 10.7,
                    longitude: 122.5
                }
            }));

            expect(result.success).toBe(true);
            expect(syncStorefrontDiscoveryIndexForTenant).toHaveBeenCalledTimes(1);
            expect(callOrder).toEqual(['commit', 'sync']);
        });
    });
});
