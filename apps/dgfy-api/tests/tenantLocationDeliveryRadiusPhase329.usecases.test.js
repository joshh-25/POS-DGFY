import { jest } from '@jest/globals';
import {
    buildCreateTenantLocationUseCase,
    buildUpdateTenantLocationUseCase
} from '../src/modules/tenantLocations/usecases/tenantLocationUseCases.js';
import { validateCreateTenantLocation, validateUpdateTenantLocation } from '../src/validators/tenantLocationValidator.js';

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
    location_id: 7,
    name: 'Main Branch',
    address_line: '123 Main Street',
    latitude: 14.5995,
    longitude: 120.9842,
    delivery_radius_km: 5,
    is_active: true,
    is_open: true,
    is_primary_storefront: true,
    current_wait_time_minutes: 15,
    allow_out_of_stock_sales: false,
    supports_delivery: true,
    supports_pickup: true,
    supports_dine_in: true,
    ...overrides
});

const createRepository = ({ transaction, created, existing = null, updated = null } = {}) => ({
    beginTransaction: jest.fn().mockResolvedValue(transaction),
    findByName: jest.fn().mockResolvedValue(null),
    findActivePrimary: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockImplementation(async () => existing || created || updated),
    create: jest.fn().mockResolvedValue(created),
    updateById: jest.fn().mockResolvedValue(updated),
    clearPrimaryFlags: jest.fn().mockResolvedValue(undefined)
});

const runValidation = (middleware, body) => {
    const response = {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
    const next = jest.fn();
    const request = { body };
    middleware(request, response, next);
    return { request, response, next };
};

describe('Phase 329 tenant-location delivery radius persistence', () => {
    it('accepts an explicit zero at the request boundary and defaults only an omitted value', () => {
        const basePayload = {
            name: 'Main Branch',
            address_line: '123 Main Street',
            latitude: 14.5995,
            longitude: 120.9842
        };
        const zeroValidation = runValidation(validateCreateTenantLocation, {
            ...basePayload,
            delivery_radius_km: 0
        });
        const defaultValidation = runValidation(validateCreateTenantLocation, basePayload);
        const updateValidation = runValidation(validateUpdateTenantLocation, { delivery_radius_km: 0 });

        expect(zeroValidation.next).toHaveBeenCalledTimes(1);
        expect(zeroValidation.request.validatedData.delivery_radius_km).toBe(0);
        expect(defaultValidation.request.validatedData.delivery_radius_km).toBe(5);
        expect(updateValidation.next).toHaveBeenCalledTimes(1);
        expect(updateValidation.request.validatedData.delivery_radius_km).toBe(0);
    });

    it('persists an explicit zero radius on create and defaults an omitted radius to five', async () => {
        const transaction = createTransactionMock();
        const created = baseLocation({ delivery_radius_km: 0 });
        const repository = createRepository({ transaction, created });
        const useCase = buildCreateTenantLocationUseCase({ tenantLocationRepository: repository });

        const zeroResult = await useCase({
            payload: {
                name: created.name,
                address_line: created.address_line,
                latitude: created.latitude,
                longitude: created.longitude,
                delivery_radius_km: 0
            }
        });

        expect(zeroResult.success).toBe(true);
        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({ delivery_radius_km: 0 }),
            expect.any(Object)
        );

        const defaultTransaction = createTransactionMock();
        const defaultCreated = baseLocation({ delivery_radius_km: 5 });
        const defaultRepository = createRepository({ transaction: defaultTransaction, created: defaultCreated });
        const defaultUseCase = buildCreateTenantLocationUseCase({ tenantLocationRepository: defaultRepository });

        const defaultResult = await defaultUseCase({
            payload: {
                name: defaultCreated.name,
                address_line: defaultCreated.address_line,
                latitude: defaultCreated.latitude,
                longitude: defaultCreated.longitude
            }
        });

        expect(defaultResult.success).toBe(true);
        expect(defaultRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ delivery_radius_km: 5 }),
            expect.any(Object)
        );
    });

    it('persists an explicit zero radius on update instead of restoring the five-kilometer default', async () => {
        const transaction = createTransactionMock();
        const existing = baseLocation({ delivery_radius_km: 5 });
        const updated = baseLocation({ delivery_radius_km: 0 });
        const repository = createRepository({ transaction, existing, updated });
        repository.findById
            .mockResolvedValueOnce(existing)
            .mockResolvedValueOnce(updated);
        const useCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository: repository });

        const result = await useCase({
            locationId: existing.location_id,
            payload: { delivery_radius_km: 0 }
        });

        expect(result.success).toBe(true);
        expect(repository.updateById).toHaveBeenCalledWith(
            existing.location_id,
            expect.objectContaining({ delivery_radius_km: 0 }),
            expect.any(Object)
        );
    });
});
