import { jest } from '@jest/globals';
import {
    BookingRepository,
    BookingAlreadyCancelledError
} from '../../../../src/modules/booking/repositories/bookingRepository.js';

// Exercises 08-12-PLAN.md Task 1's CR-02 gap-closure at the repository
// level (mirrors tests/unit/modules/compliance/
// complianceModeStateRepository.test.js's mocked-tenantConnector
// convention — no live MySQL): cancelBooking()'s guard read
// (Booking.findByPk) must request a row lock (`lock: transaction.LOCK.UPDATE`)
// so two concurrent cancels of the SAME booking serialize; the second sees
// status === 'cancelled' and throws BookingAlreadyCancelledError WITHOUT a
// second slots_remaining + 1 increment (no double-release of branch
// capacity).

const makeBookingRow = (overrides = {}) => {
    const row = {
        id: 1,
        business_id: 'biz-1',
        product_id: 10,
        branch_id: 20,
        customer_account_id: null,
        slot_start: new Date('2026-07-13T09:00:00Z'),
        slot_end: null,
        status: 'booked',
        availment_id: null,
        cancelled_at: null,
        created_at: new Date('2026-07-12T00:00:00Z'),
        updated_at: new Date('2026-07-12T00:00:00Z'),
        ...overrides
    };
    row.get = ({ plain } = {}) => (plain ? { ...row } : row);
    row.update = jest.fn(async (patch) => {
        Object.assign(row, patch);
        return row;
    });
    return row;
};

/**
 * @param {{findByPkImpl?, transactionImpl?}} [overrides]
 */
function makeModels({ findByPkImpl, transactionImpl } = {}) {
    const Booking = {
        findByPk: jest.fn(findByPkImpl || (async () => makeBookingRow())),
        sequelize: {
            literal: jest.fn((expr) => `LITERAL(${expr})`),
            transaction: jest.fn(transactionImpl || (async (callback) => callback({
                LOCK: { UPDATE: 'UPDATE' }
            })))
        }
    };
    const BookingCapacity = {
        update: jest.fn(async () => [1])
    };
    return { Booking, BookingCapacity };
}

const makeTenantConnector = (models) => ({ getModels: jest.fn(() => models) });

const makeRegistryRepository = (overrides = {}) => ({
    findByBusinessId: jest.fn(async () => ({
        database_name: 'dgfy_business_test',
        status: 'active',
        verified_at: new Date('2026-07-01T00:00:00Z')
    })),
    ...overrides
});

describe('CR-02: cancelBooking serializes its guard read with a row lock', () => {
    it('first cancel of an OPEN booking requests a row lock, releases capacity exactly once, and sets status cancelled', async () => {
        const openRow = makeBookingRow({ status: 'booked' });
        const models = makeModels({ findByPkImpl: async () => openRow });
        const repository = new BookingRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.cancelBooking('biz-1', 1);

        expect(models.Booking.findByPk).toHaveBeenCalledTimes(1);
        const [[, options]] = models.Booking.findByPk.mock.calls;
        expect(options).toEqual(expect.objectContaining({ lock: 'UPDATE' }));
        expect(options.lock).toBeTruthy();

        expect(models.BookingCapacity.update).toHaveBeenCalledTimes(1);
        expect(openRow.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'cancelled' }),
            expect.anything()
        );
        expect(result.status).toBe('cancelled');
    });

    it('second cancel of an ALREADY-CANCELLED booking throws BookingAlreadyCancelledError and does not re-increment capacity', async () => {
        const cancelledRow = makeBookingRow({ status: 'cancelled', cancelled_at: new Date() });
        const models = makeModels({ findByPkImpl: async () => cancelledRow });
        const repository = new BookingRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await expect(repository.cancelBooking('biz-1', 1)).rejects.toBeInstanceOf(BookingAlreadyCancelledError);

        expect(models.BookingCapacity.update).not.toHaveBeenCalled();
    });
});
