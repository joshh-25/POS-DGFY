import { jest } from '@jest/globals';
import {
    buildCreateTenantLocationUseCase,
    buildUpdateTenantLocationUseCase
} from '../src/modules/tenantLocations/usecases/tenantLocationUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

// #1093: a storefront location with neither delivery nor pickup enabled has no way to receive
// online orders at all -- but only when the store is actually in transaction mode (a dine-in-only
// restaurant expresses "no online orders" via customer_access_mode: 'catalog', not by disabling
// both of these). Mirrors storeUsecases.applicationResult.test.js's own
// registeredTransactionSettings fixture, adapted to the wrapped { value } shape
// tenantLocationRepository.getCustomerAccessModeSettings() already returns (parsed, not raw rows).
const transactionModeSettings = () => ({
    customer_access_mode: { value: 'transaction' },
    tenant_onboarding_progress: {
        value: {
            step_payloads: {
                business_classification: {
                    legitimacy: { registration_status: 'registered' }
                }
            }
        }
    }
});

const catalogModeSettings = () => ({
    customer_access_mode: { value: 'catalog' }
});

const createTransactionMock = () => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = true; }),
        rollback: jest.fn(async () => { transaction.finished = true; }),
        LOCK: { UPDATE: 'UPDATE' }
    };
    return transaction;
};

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
    ...overrides
});

describe('tenantLocation fulfillment-method guard (#1093)', () => {
    const originalCustomerAccessFlag = process.env.CUSTOMER_ACCESS_MODES_ENABLED;

    beforeEach(() => {
        process.env.CUSTOMER_ACCESS_MODES_ENABLED = 'true';
    });

    afterEach(() => {
        if (originalCustomerAccessFlag === undefined) {
            delete process.env.CUSTOMER_ACCESS_MODES_ENABLED;
        } else {
            process.env.CUSTOMER_ACCESS_MODES_ENABLED = originalCustomerAccessFlag;
        }
    });

    it('rejects an update that switches both delivery and pickup off in transaction mode', async () => {
        const transaction = createTransactionMock();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn().mockResolvedValue(baseLocation()),
            updateById: jest.fn(),
            getCustomerAccessModeSettings: jest.fn().mockResolvedValue(transactionModeSettings())
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { supports_delivery: false, supports_pickup: false }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.message).toMatch(/Catalog Only/);
        expect(repository.updateById).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
    });

    it('allows switching to delivery-only (Surebiz)', async () => {
        const transaction = createTransactionMock();
        const updated = baseLocation({ supports_pickup: false });
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn()
                .mockResolvedValueOnce(baseLocation())
                .mockResolvedValueOnce(updated),
            findByName: jest.fn().mockResolvedValue(null),
            updateById: jest.fn().mockResolvedValue(updated),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined),
            getCustomerAccessModeSettings: jest.fn().mockResolvedValue(transactionModeSettings())
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { supports_pickup: false }
        });

        expect(result.success).toBe(true);
        expect(repository.updateById).toHaveBeenCalledWith(
            41,
            expect.objectContaining({ supports_delivery: true, supports_pickup: false }),
            expect.any(Object)
        );
    });

    it('allows both-off in Catalog Only mode (a dine-in-only restaurant)', async () => {
        const transaction = createTransactionMock();
        const updated = baseLocation({ supports_delivery: false, supports_pickup: false, supports_dine_in: true });
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn()
                .mockResolvedValueOnce(baseLocation({ supports_dine_in: true }))
                .mockResolvedValueOnce(updated),
            findByName: jest.fn().mockResolvedValue(null),
            updateById: jest.fn().mockResolvedValue(updated),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined),
            getCustomerAccessModeSettings: jest.fn().mockResolvedValue(catalogModeSettings())
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { supports_delivery: false, supports_pickup: false }
        });

        expect(result.success).toBe(true);
        expect(repository.updateById).toHaveBeenCalledWith(
            41,
            expect.objectContaining({ supports_delivery: false, supports_pickup: false }),
            expect.any(Object)
        );
    });

    it('allows an unrelated edit to a location already sitting at both-off (pre-dates this guard)', async () => {
        const transaction = createTransactionMock();
        const alreadyBothOff = baseLocation({
            supports_delivery: false,
            supports_pickup: false,
            name: 'Legacy Branch'
        });
        const renamed = { ...alreadyBothOff, name: 'Legacy Branch (Renamed)' };
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn()
                .mockResolvedValueOnce(alreadyBothOff)
                .mockResolvedValueOnce(renamed),
            findByName: jest.fn().mockResolvedValue(null),
            updateById: jest.fn().mockResolvedValue(renamed),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined),
            // Not called at all -- the previous-state short-circuit means the guard never needs to
            // resolve the access policy for an already-both-off location.
            getCustomerAccessModeSettings: jest.fn().mockRejectedValue(new Error('should not be called'))
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { name: 'Legacy Branch (Renamed)' }
        });

        expect(result.success).toBe(true);
        expect(repository.getCustomerAccessModeSettings).not.toHaveBeenCalled();
    });

    // #1093 review, RF-2: the settings-side guards (customerAccessModeFulfillmentPolicy.js) only
    // ever query ACTIVE locations, so an inactive both-off location can otherwise slip through
    // both directions of this invariant -- switch to Catalog, disable both methods on an inactive
    // location (allowed, unreachable), switch back to Transaction (allowed, the settings guard
    // never sees an inactive row), then activate that same location while it's still both-off.
    // The old previousBothOff check saw "both true before, both true after" and treated the
    // activation as an unrelated edit. It must instead be treated as the transition into a
    // reachable-but-unfulfillable state.
    it('rejects activating a previously-inactive both-off location while in transaction mode', async () => {
        const transaction = createTransactionMock();
        const inactiveBothOff = baseLocation({
            is_active: false,
            supports_delivery: false,
            supports_pickup: false,
            name: 'Dormant Branch'
        });
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn().mockResolvedValue(inactiveBothOff),
            updateById: jest.fn(),
            getCustomerAccessModeSettings: jest.fn().mockResolvedValue(transactionModeSettings())
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { is_active: true }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(repository.updateById).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
    });

    it('allows an unrelated edit to a location that stays inactive and both-off', async () => {
        const transaction = createTransactionMock();
        const inactiveBothOff = baseLocation({
            is_active: false,
            is_primary_storefront: false,
            supports_delivery: false,
            supports_pickup: false,
            name: 'Dormant Branch'
        });
        const renamed = { ...inactiveBothOff, name: 'Dormant Branch (Renamed)' };
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn()
                .mockResolvedValueOnce(inactiveBothOff)
                .mockResolvedValueOnce(renamed),
            findByName: jest.fn().mockResolvedValue(null),
            updateById: jest.fn().mockResolvedValue(renamed),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined),
            // Stays inactive, so the use case's post-write branch calls ensureSingleActivePrimary
            // instead of clearPrimaryFlags -- unrelated to this guard, just required plumbing.
            findActivePrimary: jest.fn().mockResolvedValue(null),
            findPrimaryFallbackCandidate: jest.fn().mockResolvedValue(null),
            // Not called -- next.is_active !== true short-circuits before any settings lookup.
            getCustomerAccessModeSettings: jest.fn().mockRejectedValue(new Error('should not be called'))
        };

        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            locationId: 41,
            payload: { name: 'Dormant Branch (Renamed)' }
        });

        expect(result.success).toBe(true);
        expect(repository.getCustomerAccessModeSettings).not.toHaveBeenCalled();
    });

    it('rejects creating a new location with both methods off in transaction mode', async () => {
        const transaction = createTransactionMock();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findByName: jest.fn().mockResolvedValue(null),
            findActivePrimary: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            getCustomerAccessModeSettings: jest.fn().mockResolvedValue(transactionModeSettings())
        };

        const useCase = buildCreateTenantLocationUseCase({ tenantLocationRepository: repository });
        const result = await useCase({
            payload: {
                name: 'New Branch',
                address_line: 'Iloilo City',
                latitude: 10.7,
                longitude: 122.5,
                supports_delivery: false,
                supports_pickup: false
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(repository.create).not.toHaveBeenCalled();
    });
});
