import { buildRescheduleServiceBookingUseCase } from '../src/modules/services/usecases/serviceUseCases.js';
import { validateRescheduleServiceBooking } from '../src/validators/serviceValidator.js';
import { jest } from '@jest/globals';

const transaction = () => ({
    finished: false,
    commit: jest.fn(async function commit() {
        this.finished = 'commit';
    }),
    rollback: jest.fn(async function rollback() {
        this.finished = 'rollback';
    })
});

const baseBooking = (overrides = {}) => ({
    booking_id: 1,
    service_item_id: 10,
    status: 'confirmed',
    provider_user_id: 7,
    resource_id: 20,
    location_id: 3,
    quantity: 1,
    start_at: new Date('2030-01-01T10:00:00.000Z'),
    end_at: new Date('2030-01-01T11:00:00.000Z'),
    handoffLegs: [],
    serviceItem: {
        item_id: 10,
        name: 'Consultation',
        serviceDetail: { lead_time_minutes: 0, buffer_before_minutes: 10, buffer_after_minutes: 15 }
    },
    ...overrides
});

const makeRepository = ({ booking = baseBooking(), conflicts = [] } = {}) => {
    const tx = transaction();
    const updateBookingById = jest.fn(async () => booking);
    const getBookingById = jest.fn()
        .mockResolvedValueOnce(booking)
        .mockResolvedValueOnce(booking);
    const findConflictingBookings = jest.fn(async () => conflicts);
    const repository = {
        beginTransaction: jest.fn(async () => tx),
        getBookingById,
        findResourceById: jest.fn(async () => ({
            resource_id: 20,
            location_id: 3,
            is_active: true,
            capacity: 1,
            weekly_availability: {},
            blackout_dates: []
        })),
        listActiveAssignmentsForService: jest.fn(async () => []),
        findConflictingBookings,
        findConflictingHolds: jest.fn(async () => []),
        updateBookingById
    };
    return { repository, tx, updateBookingById, findConflictingBookings };
};

const validateBody = (body) => {
    const req = { body };
    const next = jest.fn();
    const res = { status: jest.fn(() => res), json: jest.fn() };
    validateRescheduleServiceBooking(req, res, next);
    return { req, res, next };
};

describe('buildRescheduleServiceBookingUseCase', () => {
    it('validates that at least one allowed schedule field is supplied and rejects derived fields', () => {
        expect(validateBody({ start_at: '2030-01-02T12:00:00.000Z' }).next).toHaveBeenCalled();
        expect(validateBody({}).res.status).toHaveBeenCalledWith(422);
        expect(validateBody({ end_at: '2030-01-02T13:00:00.000Z' }).res.status).toHaveBeenCalledWith(422);
        expect(validateBody({ status: 'completed' }).res.status).toHaveBeenCalledWith(422);
    });

    it('reschedules a booking while preserving its existing duration and omitted assignments', async () => {
        const { repository, tx, updateBookingById, findConflictingBookings } = makeRepository();
        const useCase = buildRescheduleServiceBookingUseCase({ serviceRepository: repository });
        const nextStart = '2030-01-02T12:00:00.000Z';

        const result = await useCase({ bookingId: 1, payload: { start_at: nextStart } });

        expect(result.success).toBe(true);
        expect(updateBookingById).toHaveBeenCalledWith(1, {
            provider_user_id: 7,
            resource_id: 20,
            start_at: new Date(nextStart),
            end_at: new Date('2030-01-02T13:00:00.000Z')
        }, { transaction: tx, lock: true });
        expect(findConflictingBookings).toHaveBeenCalledWith(expect.objectContaining({
            providerUserId: 7,
            resourceId: 20,
            startAt: new Date('2030-01-02T11:50:00.000Z'),
            endAt: new Date('2030-01-02T13:15:00.000Z')
        }), { transaction: tx, lock: true });
        expect(tx.commit).toHaveBeenCalled();
    });

    it('excludes the booking itself from its conflict query', async () => {
        const { repository, findConflictingBookings } = makeRepository();
        const useCase = buildRescheduleServiceBookingUseCase({ serviceRepository: repository });

        const result = await useCase({ bookingId: 1, payload: { provider_user_id: 8 } });

        expect(result.success).toBe(true);
        expect(findConflictingBookings).toHaveBeenCalledWith(expect.objectContaining({ excludeBookingId: 1 }), expect.anything());
    });

    it('rejects a conflicting slot and rolls the transaction back', async () => {
        const { repository, tx, updateBookingById } = makeRepository({
            conflicts: [{ booking_id: 2, provider_user_id: 7, resource_id: 20, quantity: 1 }]
        });
        const useCase = buildRescheduleServiceBookingUseCase({ serviceRepository: repository });

        const result = await useCase({ bookingId: 1, payload: { start_at: '2030-01-02T12:00:00.000Z' } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(updateBookingById).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    it.each(['in_service', 'completed'])('rejects a booking with status %s', async (status) => {
        const { repository, tx, updateBookingById } = makeRepository({ booking: baseBooking({ status }) });
        const useCase = buildRescheduleServiceBookingUseCase({ serviceRepository: repository });

        const result = await useCase({ bookingId: 1, payload: { start_at: '2030-01-02T12:00:00.000Z' } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(updateBookingById).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('rejects a booking that has handoff legs', async () => {
        const { repository, tx, updateBookingById } = makeRepository({
            booking: baseBooking({ handoffLegs: [{ handoff_leg_id: 5 }] })
        });
        const useCase = buildRescheduleServiceBookingUseCase({ serviceRepository: repository });

        const result = await useCase({ bookingId: 1, payload: { start_at: '2030-01-02T12:00:00.000Z' } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(updateBookingById).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });
});
