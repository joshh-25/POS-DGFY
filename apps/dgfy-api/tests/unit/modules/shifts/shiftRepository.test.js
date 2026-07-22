import { jest } from '@jest/globals';
import {
    ShiftRepository,
    ShiftNotOpenError
} from '../../../../src/modules/shifts/repositories/shiftRepository.js';

// Exercises 08-12-PLAN.md Task 2's CR-03 gap-closure at the repository
// level (mirrors tests/unit/modules/compliance/
// complianceModeStateRepository.test.js's mocked-tenantConnector
// convention — no live MySQL): closeShift()'s guard read (Shift.findOne)
// must request a row lock (`lock: transaction.LOCK.UPDATE`) so two
// concurrent closes of the SAME shift serialize; the second sees
// status !== 'open' and is rejected with ShiftNotOpenError, writing NO
// second 'close' cash_drawer_event and losing no reconciliation update.

const makeShiftRow = (overrides = {}) => {
    const row = {
        id: 1,
        business_id: 'biz-1',
        terminal_id: 5,
        cashier_account_id: 'staff-1',
        cashier_dgfy_account_id: null,
        status: 'open',
        opening_float_amount: 1000,
        expected_cash_amount: null,
        closing_cash_amount: null,
        cash_variance_amount: null,
        opened_at: new Date('2026-07-13T08:00:00Z'),
        closed_at: null,
        created_at: new Date('2026-07-13T08:00:00Z'),
        updated_at: new Date('2026-07-13T08:00:00Z'),
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
 * @param {{findOneImpl?, transactionImpl?}} [overrides]
 */
function makeModels({ findOneImpl, transactionImpl } = {}) {
    const Shift = {
        findOne: jest.fn(findOneImpl || (async () => makeShiftRow())),
        sequelize: {
            transaction: jest.fn(transactionImpl || (async (callback) => callback({
                LOCK: { UPDATE: 'UPDATE' }
            })))
        }
    };
    return { Shift };
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

const makeCashDrawerEventRepository = (overrides = {}) => ({
    create: jest.fn(async () => ({ id: 99 })),
    ...overrides
});

describe('CR-03: closeShift serializes its guard read with a row lock', () => {
    it('first close of an OPEN shift requests a row lock, sets status closed, and writes exactly one close event', async () => {
        const openShift = makeShiftRow({ status: 'open' });
        const models = makeModels({ findOneImpl: async () => openShift });
        const cashDrawerEventRepository = makeCashDrawerEventRepository();
        const repository = new ShiftRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository(),
            cashDrawerEventRepository
        });

        const result = await repository.closeShift('biz-1', 1, {
            closingCashAmount: 1500,
            expectedCashAmount: 1500,
            cashVarianceAmount: 0
        });

        expect(models.Shift.findOne).toHaveBeenCalledTimes(1);
        const [[options]] = models.Shift.findOne.mock.calls;
        expect(options).toEqual(expect.objectContaining({ lock: 'UPDATE' }));
        expect(options.lock).toBeTruthy();

        expect(openShift.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'closed' }),
            expect.anything()
        );
        expect(cashDrawerEventRepository.create).toHaveBeenCalledTimes(1);
        expect(cashDrawerEventRepository.create).toHaveBeenCalledWith(
            'biz-1',
            expect.objectContaining({ eventType: 'close' }),
            expect.anything()
        );
        expect(result.status).toBe('closed');
    });

    it('second close of an ALREADY-CLOSED shift throws ShiftNotOpenError and writes no duplicate close event', async () => {
        const closedShift = makeShiftRow({ status: 'closed', closed_at: new Date() });
        const models = makeModels({ findOneImpl: async () => closedShift });
        const cashDrawerEventRepository = makeCashDrawerEventRepository();
        const repository = new ShiftRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository(),
            cashDrawerEventRepository
        });

        await expect(repository.closeShift('biz-1', 1, {
            closingCashAmount: 1500,
            expectedCashAmount: 1500,
            cashVarianceAmount: 0
        })).rejects.toBeInstanceOf(ShiftNotOpenError);

        expect(cashDrawerEventRepository.create).not.toHaveBeenCalled();
    });
});
