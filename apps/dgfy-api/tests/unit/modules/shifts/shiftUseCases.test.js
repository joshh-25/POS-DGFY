import { jest } from '@jest/globals';
import {
    buildOpenShiftUseCase,
    buildCloseShiftUseCase,
    buildRecordNoSalePopUseCase,
    buildListShiftsUseCase,
    computeExpectedCash
} from '../../../../src/modules/shifts/usecases/shiftUseCases.js';
import { DuplicateOpenShiftError, ShiftNotFoundError, ShiftNotOpenError } from '../../../../src/modules/shifts/repositories/shiftRepository.js';

// Exercises 08-05-PLAN.md Task 1's <behavior> block at the usecase level
// (mirrors tests/unit/modules/businesses/locationUseCases.test.js's
// mocked-repository convention): open, the duplicate-open 409 mapping,
// close-time reconciliation math (expected == opening float this phase,
// signed variance), and no-sale-pop event logging. The repository itself is
// a mocked plain object here — its real DB-transactional behavior (the
// generated-column unique-index catch, the shared transaction) is
// shiftRepository.js's own concern, not re-tested against a real DB in this
// unit suite.

const makeShiftRow = (overrides = {}) => ({
    id: 1,
    business_id: 'biz-1',
    terminal_id: 10,
    cashier_account_id: 5,
    cashier_dgfy_account_id: null,
    status: 'open',
    opening_float_amount: 1000,
    expected_cash_amount: null,
    closing_cash_amount: null,
    cash_variance_amount: null,
    opened_at: new Date('2026-07-12T08:00:00Z'),
    closed_at: null,
    created_at: new Date('2026-07-12T08:00:00Z'),
    updated_at: new Date('2026-07-12T08:00:00Z'),
    ...overrides
});

const makeBusiness = (overrides = {}) => ({
    id: 'biz-1',
    business_handle: 'acme-store',
    legal_name: 'Acme Inc.',
    display_name: 'Acme Store',
    status: 'active',
    ...overrides
});

const makeMembership = (overrides = {}) => ({
    id: 1,
    account_id: 'acct-1',
    business_id: 'biz-1',
    role: 'member',
    status: 'active',
    ...overrides
});

const baseShiftRepository = (overrides = {}) => ({
    openShift: jest.fn().mockResolvedValue(makeShiftRow()),
    closeShift: jest.fn().mockImplementation(async (businessId, shiftId, { closingCashAmount, expectedCashAmount, cashVarianceAmount }) => makeShiftRow({
        status: 'closed',
        closing_cash_amount: closingCashAmount,
        expected_cash_amount: expectedCashAmount,
        cash_variance_amount: cashVarianceAmount,
        closed_at: new Date('2026-07-12T16:00:00Z')
    })),
    recordNoSalePop: jest.fn().mockResolvedValue({
        id: 1,
        business_id: 'biz-1',
        shift_id: 1,
        event_type: 'no_sale_pop',
        amount: null,
        reason: 'test pop',
        actor_staff_account_id: 5,
        created_at: new Date('2026-07-12T09:00:00Z')
    }),
    findById: jest.fn().mockResolvedValue(makeShiftRow()),
    findAll: jest.fn().mockResolvedValue([makeShiftRow()]),
    ...overrides
});

const baseBusinessRepository = (overrides = {}) => ({
    findById: jest.fn().mockResolvedValue(makeBusiness()),
    getMembership: jest.fn().mockResolvedValue(makeMembership()),
    ...overrides
});

describe('computeExpectedCash (reconciliation formula shape, D-10)', () => {
    it('expected cash equals the opening float when all Phase-9 inputs are 0/omitted', () => {
        expect(computeExpectedCash({ openingFloatAmount: 1000 })).toBe(1000);
    });

    it('anticipates Phase-9 sales/refunds/pay-in/pay-out inputs without restructuring', () => {
        const expected = computeExpectedCash({
            openingFloatAmount: 1000,
            salesCash: 500,
            refundsCash: 50,
            payIns: 20,
            payOuts: 10
        });
        // 1000 + 500 - 50 + 20 - 10 = 1460
        expect(expected).toBe(1460);
    });
});

describe('buildOpenShiftUseCase', () => {
    it('opens a shift with a declared opening_float_amount', async () => {
        const repository = baseShiftRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildOpenShiftUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            terminalId: 10,
            cashierAccountId: 5,
            openingFloatAmount: 1000
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.openShift).toHaveBeenCalledWith('biz-1', expect.objectContaining({
            terminalId: 10,
            cashierAccountId: 5,
            openingFloatAmount: 1000
        }));
        expect(result.data.shift.status).toBe('open');
    });

    it('rejects missing terminalId/cashierAccountId/openingFloatAmount', async () => {
        const repository = baseShiftRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildOpenShiftUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.openShift).not.toHaveBeenCalled();
    });

    it('rejects a requester with no active membership as 403', async () => {
        const repository = baseShiftRepository();
        const businessRepository = baseBusinessRepository({ getMembership: jest.fn().mockResolvedValue(null) });
        const useCase = buildOpenShiftUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            terminalId: 10,
            cashierAccountId: 5,
            openingFloatAmount: 1000
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.error.statusCode).toBe(403);
    });

    // T-08-05-01 / must_haves: a second open for the same (terminal_id,
    // cashier_account_id) is rejected as a clean 409 DomainError — the raw
    // DB unique-index violation is caught and mapped by the repository
    // (shiftRepository.js), never surfaced as an unhandled 500.
    it('maps a duplicate-open-shift repository error to a clean 409 conflict', async () => {
        const repository = baseShiftRepository({
            openShift: jest.fn().mockRejectedValue(new DuplicateOpenShiftError())
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildOpenShiftUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            terminalId: 10,
            cashierAccountId: 5,
            openingFloatAmount: 1000
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(result.data).toBeNull();
    });
});

describe('buildCloseShiftUseCase', () => {
    it('closes a shift where expected cash equals the opening float (all Phase-9 inputs 0 this phase)', async () => {
        const repository = baseShiftRepository({
            findById: jest.fn().mockResolvedValue(makeShiftRow({ opening_float_amount: 1000 }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCloseShiftUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            shiftId: 1,
            closingCashAmount: 1000
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.closeShift).toHaveBeenCalledWith('biz-1', 1, expect.objectContaining({
            closingCashAmount: 1000,
            expectedCashAmount: 1000,
            cashVarianceAmount: 0
        }));
        expect(result.data.shift.cash_variance_amount).toBe(0);
        expect(result.data.shift.status).toBe('closed');
    });

    it('computes a signed positive variance when closing cash exceeds expected cash', async () => {
        const repository = baseShiftRepository({
            findById: jest.fn().mockResolvedValue(makeShiftRow({ opening_float_amount: 1000 }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCloseShiftUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            shiftId: 1,
            closingCashAmount: 1050
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.closeShift).toHaveBeenCalledWith('biz-1', 1, expect.objectContaining({
            expectedCashAmount: 1000,
            cashVarianceAmount: 50
        }));
    });

    it('computes a signed negative variance when closing cash is short of expected cash', async () => {
        const repository = baseShiftRepository({
            findById: jest.fn().mockResolvedValue(makeShiftRow({ opening_float_amount: 1000 }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCloseShiftUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            shiftId: 1,
            closingCashAmount: 950
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.closeShift).toHaveBeenCalledWith('biz-1', 1, expect.objectContaining({
            expectedCashAmount: 1000,
            cashVarianceAmount: -50
        }));
    });

    it('rejects closing a shift that is not found as 404', async () => {
        const repository = baseShiftRepository({ findById: jest.fn().mockResolvedValue(null) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCloseShiftUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            shiftId: 999,
            closingCashAmount: 1000
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(repository.closeShift).not.toHaveBeenCalled();
    });

    it('rejects closing an already-closed shift as 409', async () => {
        const repository = baseShiftRepository({
            findById: jest.fn().mockResolvedValue(makeShiftRow({ status: 'closed' }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCloseShiftUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            shiftId: 1,
            closingCashAmount: 1000
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(repository.closeShift).not.toHaveBeenCalled();
    });

    it('maps a repository ShiftNotOpenError (race between the pre-check and the transaction) to 409', async () => {
        const repository = baseShiftRepository({
            findById: jest.fn().mockResolvedValue(makeShiftRow()),
            closeShift: jest.fn().mockRejectedValue(new ShiftNotOpenError())
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCloseShiftUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            shiftId: 1,
            closingCashAmount: 1000
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
    });
});

describe('buildRecordNoSalePopUseCase', () => {
    it('logs a no-sale drawer pop event against an open shift', async () => {
        const repository = baseShiftRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildRecordNoSalePopUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            shiftId: 1,
            reason: 'test pop',
            actorStaffAccountId: 5
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.recordNoSalePop).toHaveBeenCalledWith('biz-1', 1, expect.objectContaining({
            reason: 'test pop',
            actorStaffAccountId: 5
        }));
        expect(result.data.event.event_type).toBe('no_sale_pop');
    });

    it('maps a repository ShiftNotFoundError to 404', async () => {
        const repository = baseShiftRepository({
            recordNoSalePop: jest.fn().mockRejectedValue(new ShiftNotFoundError())
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildRecordNoSalePopUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            shiftId: 999
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('maps a repository ShiftNotOpenError (closed shift) to 409', async () => {
        const repository = baseShiftRepository({
            recordNoSalePop: jest.fn().mockRejectedValue(new ShiftNotOpenError())
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildRecordNoSalePopUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            shiftId: 1
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
    });
});

describe('buildListShiftsUseCase (D-11 stale-flag-only, never auto-close)', () => {
    it('flags a shift open past the configured staleThresholdMinutes, without closing it', async () => {
        const openedLongAgo = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
        const repository = baseShiftRepository({
            findAll: jest.fn().mockResolvedValue([makeShiftRow({ opened_at: openedLongAgo, status: 'open' })])
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListShiftsUseCase({ repository, businessRepository, staleThresholdMinutes: 10 });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.shifts[0].is_stale).toBe(true);
        expect(result.data.shifts[0].status).toBe('open');
    });

    it('does not flag a shift opened within the configured threshold', async () => {
        const openedRecently = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
        const repository = baseShiftRepository({
            findAll: jest.fn().mockResolvedValue([makeShiftRow({ opened_at: openedRecently, status: 'open' })])
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListShiftsUseCase({ repository, businessRepository, staleThresholdMinutes: 10 });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.shifts[0].is_stale).toBe(false);
    });

    it('never flags a closed shift as stale, regardless of age', async () => {
        const openedLongAgo = new Date(Date.now() - 1000 * 60 * 60 * 24);
        const repository = baseShiftRepository({
            findAll: jest.fn().mockResolvedValue([makeShiftRow({ opened_at: openedLongAgo, status: 'closed' })])
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListShiftsUseCase({ repository, businessRepository, staleThresholdMinutes: 10 });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.shifts[0].is_stale).toBe(false);
        expect(result.data.shifts[0].status).toBe('closed');
    });
});
