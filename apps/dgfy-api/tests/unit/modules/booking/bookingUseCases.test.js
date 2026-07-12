import { jest } from '@jest/globals';
import {
    buildCreateBookingUseCase,
    buildCancelBookingUseCase,
    buildListBookingsUseCase
} from '../../../../src/modules/booking/usecases/bookingUseCases.js';

const makeProduct = (overrides = {}) => ({
    id: 1,
    name: 'Haircut',
    category: 'service',
    inventory_mode: 'non_stock',
    folder_id: null,
    is_bookable: true,
    slot_duration_minutes: 30,
    concurrent_capacity: 1,
    base_price: 300,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
});

const makeBooking = (overrides = {}) => ({
    id: 1,
    business_id: 'biz-1',
    product_id: 1,
    branch_id: 10,
    customer_account_id: null,
    slot_start: new Date('2026-08-01T10:00:00Z'),
    slot_end: new Date('2026-08-01T10:30:00Z'),
    status: 'booked',
    availment_id: null,
    cancelled_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
});

const makeMembership = (overrides = {}) => ({
    id: 1,
    account_id: 'acct-1',
    business_id: 'biz-1',
    role: 'owner',
    status: 'active',
    ...overrides
});

const baseBookingRepository = (overrides = {}) => ({
    createBooking: jest.fn().mockResolvedValue(makeBooking()),
    findById: jest.fn().mockResolvedValue(makeBooking()),
    findAll: jest.fn().mockResolvedValue([makeBooking()]),
    cancelBooking: jest.fn().mockResolvedValue(makeBooking({ status: 'cancelled', cancelled_at: new Date() })),
    ...overrides
});

const baseBusinessRepository = (overrides = {}) => ({
    findById: jest.fn().mockResolvedValue({ id: 'biz-1', status: 'active' }),
    getMembership: jest.fn().mockResolvedValue(makeMembership()),
    ...overrides
});

const baseProductRepository = (overrides = {}) => ({
    findById: jest.fn().mockResolvedValue(makeProduct()),
    ...overrides
});

describe('buildCreateBookingUseCase', () => {
    it('creates a booking against a bookable product with slots available', async () => {
        const repository = baseBookingRepository();
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository();
        const useCase = buildCreateBookingUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            productId: 1,
            branchId: 10,
            slotStart: '2026-08-01T10:00:00Z'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.createBooking).toHaveBeenCalledWith('biz-1', expect.objectContaining({
            productId: 1,
            branchId: 10,
            concurrentCapacity: 1
        }));
        expect(result.data.booking.status).toBe('booked');
    });

    it('returns a 409 conflict with no booking row written when branch capacity is full', async () => {
        const capacityFullError = new Error('No booking capacity remaining for this slot.');
        capacityFullError.name = 'BookingCapacityFullError';
        const repository = baseBookingRepository({ createBooking: jest.fn().mockRejectedValue(capacityFullError) });
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository();
        const useCase = buildCreateBookingUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            productId: 1,
            branchId: 10,
            slotStart: '2026-08-01T10:00:00Z'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
    });

    it('rejects booking against a non-bookable product', async () => {
        const repository = baseBookingRepository();
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository({
            findById: jest.fn().mockResolvedValue(makeProduct({ is_bookable: false }))
        });
        const useCase = buildCreateBookingUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            productId: 1,
            branchId: 10,
            slotStart: '2026-08-01T10:00:00Z'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.createBooking).not.toHaveBeenCalled();
    });

    it('rejects a missing slotStart', async () => {
        const repository = baseBookingRepository();
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository();
        const useCase = buildCreateBookingUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            productId: 1,
            branchId: 10
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.createBooking).not.toHaveBeenCalled();
    });

    it('allows a non-staff (consumer) caller to book for themselves, ignoring a spoofed customer_account_id', async () => {
        const repository = baseBookingRepository();
        const businessRepository = baseBusinessRepository({ getMembership: jest.fn().mockResolvedValue(null) });
        const productRepository = baseProductRepository();
        const useCase = buildCreateBookingUseCase({ repository, businessRepository, productRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'consumer-1',
            productId: 1,
            branchId: 10,
            slotStart: '2026-08-01T10:00:00Z',
            customer_account_id: 'someone-else'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.createBooking).toHaveBeenCalledWith('biz-1', expect.objectContaining({
            customerAccountId: 'consumer-1'
        }));
    });

    it('N simultaneous createBooking calls against a capacity-1 slot yield exactly 1 success and N-1 conflictError (no oversell)', async () => {
        let slotsRemaining = 1;
        const repository = baseBookingRepository({
            createBooking: jest.fn().mockImplementation(async () => {
                if (slotsRemaining < 1) {
                    const err = new Error('No booking capacity remaining for this slot.');
                    err.name = 'BookingCapacityFullError';
                    throw err;
                }
                slotsRemaining -= 1;
                return makeBooking();
            })
        });
        const businessRepository = baseBusinessRepository();
        const productRepository = baseProductRepository();
        const useCase = buildCreateBookingUseCase({ repository, businessRepository, productRepository });

        const concurrentRequests = 5;
        const results = await Promise.all(Array.from({ length: concurrentRequests }, () => useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            productId: 1,
            branchId: 10,
            slotStart: '2026-08-01T10:00:00Z'
        })));

        const successes = results.filter((result) => result.isSuccess);
        const conflicts = results.filter((result) => !result.isSuccess && result.error.code === 'CONFLICT');

        expect(successes).toHaveLength(1);
        expect(conflicts).toHaveLength(concurrentRequests - 1);
    });
});

describe('buildCancelBookingUseCase', () => {
    it('cancels a booking by staff/owner and releases the slot', async () => {
        const repository = baseBookingRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildCancelBookingUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', bookingId: 1, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(repository.cancelBooking).toHaveBeenCalledWith('biz-1', 1);
        expect(result.data.booking.status).toBe('cancelled');
    });

    it("cancels a booking by the booking's own consumer account", async () => {
        const repository = baseBookingRepository({
            findById: jest.fn().mockResolvedValue(makeBooking({ customer_account_id: 'consumer-1' }))
        });
        const businessRepository = baseBusinessRepository({ getMembership: jest.fn().mockResolvedValue(null) });
        const useCase = buildCancelBookingUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', bookingId: 1, requestingAccountId: 'consumer-1' });

        expect(result.isSuccess).toBe(true);
        expect(repository.cancelBooking).toHaveBeenCalledWith('biz-1', 1);
    });

    it('rejects cancel by an unrelated stranger account', async () => {
        const repository = baseBookingRepository({
            findById: jest.fn().mockResolvedValue(makeBooking({ customer_account_id: 'consumer-1' }))
        });
        const businessRepository = baseBusinessRepository({ getMembership: jest.fn().mockResolvedValue(null) });
        const useCase = buildCancelBookingUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', bookingId: 1, requestingAccountId: 'stranger-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.error.statusCode).toBe(403);
        expect(repository.cancelBooking).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND for a missing booking', async () => {
        const repository = baseBookingRepository({ findById: jest.fn().mockResolvedValue(null) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCancelBookingUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', bookingId: 99, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(repository.cancelBooking).not.toHaveBeenCalled();
    });

    it('rejects cancelling an already-cancelled booking (no double slot release)', async () => {
        const repository = baseBookingRepository({
            findById: jest.fn().mockResolvedValue(makeBooking({ status: 'cancelled' }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCancelBookingUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', bookingId: 1, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.cancelBooking).not.toHaveBeenCalled();
    });
});

describe('buildListBookingsUseCase', () => {
    it('returns bookings for a member', async () => {
        const repository = baseBookingRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildListBookingsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.bookings).toHaveLength(1);
    });

    it('rejects a non-member requester', async () => {
        const repository = baseBookingRepository();
        const businessRepository = baseBusinessRepository({ getMembership: jest.fn().mockResolvedValue(null) });
        const useCase = buildListBookingsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'stranger-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
    });
});
