import { jest } from '@jest/globals';
import {
    buildCreateTenantLocationUseCase,
    buildUpdateTenantLocationUseCase,
    buildDeactivateTenantLocationUseCase
} from '../src/modules/tenantLocations/usecases/tenantLocationUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const createTransactionMock = () => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = true; }),
        rollback: jest.fn(async () => { transaction.finished = true; }),
        LOCK: { UPDATE: 'UPDATE' }
    };
    return transaction;
};

describe('tenantLocation use-cases primary storefront behavior', () => {
    it('auto-assigns first active location as primary storefront pin', async () => {
        const transaction = createTransactionMock();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findByName: jest.fn().mockResolvedValue(null),
            findActivePrimary: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
                location_id: 5,
                name: 'Main',
                is_active: true,
                is_primary_storefront: true
            }),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined),
            findById: jest.fn().mockResolvedValue({
                location_id: 5,
                name: 'Main',
                is_active: true,
                is_primary_storefront: true
            })
        };

        const useCase = buildCreateTenantLocationUseCase({
            tenantLocationRepository: repository
        });

        const result = await useCase({
            payload: {
                name: 'Main',
                address_line: 'Iloilo City',
                latitude: 10.7,
                longitude: 122.5
            }
        });

        expect(result.success).toBe(true);
        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({ is_primary_storefront: true }),
            expect.any(Object)
        );
        expect(repository.clearPrimaryFlags).toHaveBeenCalledWith(
            expect.objectContaining({ excludeLocationId: 5 })
        );
    });

    it('promotes updated location to primary and demotes others', async () => {
        const transaction = createTransactionMock();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest
                .fn()
                .mockResolvedValueOnce({
                    location_id: 11,
                    name: 'Branch 2',
                    address_line: 'Lapaz',
                    latitude: 10.7,
                    longitude: 122.5,
                    is_active: true,
                    is_open: true,
                    is_primary_storefront: false,
                    delivery_radius_km: 5,
                    current_wait_time_minutes: 15,
                    allow_out_of_stock_sales: false,
                    supports_delivery: true,
                    supports_pickup: true,
                    supports_dine_in: true
                })
                .mockResolvedValueOnce({
                    location_id: 11,
                    is_active: true,
                    is_primary_storefront: true
                }),
            findByName: jest.fn().mockResolvedValue(null),
            updateById: jest.fn().mockResolvedValue({
                location_id: 11,
                is_active: true,
                is_primary_storefront: true
            }),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined)
        };

        const useCase = buildUpdateTenantLocationUseCase({
            tenantLocationRepository: repository
        });

        const result = await useCase({
            locationId: 11,
            payload: {
                is_primary_storefront: true
            }
        });

        expect(result.success).toBe(true);
        expect(repository.clearPrimaryFlags).toHaveBeenCalledWith(
            expect.objectContaining({ excludeLocationId: 11 })
        );
    });

    it('promotes fallback active location when deactivating primary', async () => {
        const transaction = createTransactionMock();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest
                .fn()
                .mockResolvedValueOnce({
                    location_id: 2,
                    is_active: true,
                    is_primary_storefront: true
                })
                .mockResolvedValueOnce({
                    location_id: 2,
                    is_active: false,
                    is_primary_storefront: false
                }),
            deactivateById: jest.fn().mockResolvedValue({
                location_id: 2,
                is_active: false,
                is_primary_storefront: false
            }),
            findActivePrimary: jest.fn().mockResolvedValue(null),
            findPrimaryFallbackCandidate: jest.fn().mockResolvedValue({
                location_id: 7,
                is_active: true
            }),
            clearPrimaryFlags: jest.fn().mockResolvedValue(undefined),
            setPrimaryFlagById: jest.fn().mockResolvedValue({
                location_id: 7,
                is_primary_storefront: true
            })
        };

        const useCase = buildDeactivateTenantLocationUseCase({
            tenantLocationRepository: repository
        });

        const result = await useCase({ locationId: 2 });

        expect(result.success).toBe(true);
        expect(repository.findPrimaryFallbackCandidate).toHaveBeenCalled();
        expect(repository.setPrimaryFlagById).toHaveBeenCalledWith(7, expect.any(Object));
    });

    it('rejects invalid primary state when location is inactive', async () => {
        const transaction = createTransactionMock();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn().mockResolvedValue({
                location_id: 13,
                name: 'Branch',
                address_line: 'Address',
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
                supports_dine_in: true
            })
        };

        const useCase = buildUpdateTenantLocationUseCase({
            tenantLocationRepository: repository
        });

        const result = await useCase({
            locationId: 13,
            payload: {
                is_active: false,
                is_primary_storefront: true
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(422);
    });

    it('returns conflict when optimistic concurrency timestamp is stale', async () => {
        const transaction = createTransactionMock();
        const repository = {
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findById: jest.fn().mockResolvedValue({
                location_id: 21,
                name: 'Main',
                address_line: 'Iloilo',
                latitude: 10.7,
                longitude: 122.5,
                delivery_radius_km: 5,
                is_open: true,
                is_active: true,
                is_primary_storefront: true,
                current_wait_time_minutes: 15,
                allow_out_of_stock_sales: false,
                supports_delivery: true,
                supports_pickup: true,
                supports_dine_in: true,
                updated_at: '2026-03-31T01:00:00.000Z'
            })
        };

        const useCase = buildUpdateTenantLocationUseCase({
            tenantLocationRepository: repository
        });

        const result = await useCase({
            locationId: 21,
            payload: {
                name: 'Main Updated',
                last_known_updated_at: '2026-03-31T00:30:00.000Z'
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
        expect(result.error.statusCode).toBe(409);
    });
});
