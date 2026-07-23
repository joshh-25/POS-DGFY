import { jest } from '@jest/globals';
import {
    STAGE_SEQUENCES,
    buildListIncomingOrdersUseCase,
    buildProgressStageUseCase,
    buildAssignCourierUseCase,
    buildMarkPayoutUseCase
} from '../../../../src/modules/fulfillment/usecases/fulfillmentUseCases.js';

// Mirrors tests/unit/modules/inventory/recordSale.test.js's
// mockBusinessRepository shape (findById/getMembership) and
// tests/unit/modules/inventory/inventoryMovementUseCases.test.js's
// self-contained mock-repository style — dependencies are hand-rolled
// jest.fn() objects matching each repository's public method surface, not
// real repository instances (repository-level behavior is covered by
// fulfillmentRepositories.test.js).

const makeBusinessRepository = ({ active = true } = {}) => ({
    findById: jest.fn(async () => ({ id: 'biz-1' })),
    getMembership: jest.fn(async () => (active ? { status: 'active' } : null))
});

const makeAvailment = (overrides = {}) => ({
    id: 20,
    business_id: 'biz-1',
    fulfillment_mode: 'delivery',
    fulfillment_status: 'placed',
    ...overrides
});

describe('STAGE_SEQUENCES (D-12/D-13/D-14)', () => {
    it('defines pickup/dine_in as placed->confirmed->preparing->ready->completed', () => {
        expect(STAGE_SEQUENCES.pickup).toEqual(['placed', 'confirmed', 'preparing', 'ready', 'completed']);
        expect(STAGE_SEQUENCES.dine_in).toEqual(['placed', 'confirmed', 'preparing', 'ready', 'completed']);
    });

    it('defines delivery as placed->confirmed->preparing->out_for_delivery->completed', () => {
        expect(STAGE_SEQUENCES.delivery).toEqual(['placed', 'confirmed', 'preparing', 'out_for_delivery', 'completed']);
    });

    it('is frozen (app-logic only, never mutated at runtime)', () => {
        expect(Object.isFrozen(STAGE_SEQUENCES)).toBe(true);
    });
});

describe('buildListIncomingOrdersUseCase (FUL-01, D-08)', () => {
    it('delegates to availmentReadRepository.findIncomingAvailments with businessId + filters and returns its rows', async () => {
        const rows = [makeAvailment({ id: 21 }), makeAvailment({ id: 22, fulfillment_mode: 'pickup' })];
        const availmentReadRepository = { findIncomingAvailments: jest.fn(async () => rows) };
        const businessRepository = makeBusinessRepository();
        const useCase = buildListIncomingOrdersUseCase({ availmentReadRepository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            branchId: 7,
            fulfillmentMode: 'delivery'
        });

        expect(availmentReadRepository.findIncomingAvailments).toHaveBeenCalledWith('biz-1', {
            branchId: 7,
            fulfillmentMode: 'delivery'
        });
        expect(result.isSuccess).toBe(true);
        expect(result.data.orders).toEqual(rows);
    });

    it('returns forbidden (403) for a non-active-member requester', async () => {
        const availmentReadRepository = { findIncomingAvailments: jest.fn() };
        const businessRepository = makeBusinessRepository({ active: false });
        const useCase = buildListIncomingOrdersUseCase({ availmentReadRepository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.statusCode).toBe(403);
        expect(availmentReadRepository.findIncomingAvailments).not.toHaveBeenCalled();
    });
});

describe('buildProgressStageUseCase (FUL-02, D-15 app-logic sequence validation)', () => {
    // A fake transaction token — asserts both writes share the SAME object
    // (CR-02 fix, 11-REVIEW.md) without needing a real Sequelize connection.
    const FAKE_TRANSACTION = { id: 'tx-1' };

    const makeDeps = ({ availment = makeAvailment(), active = true } = {}) => {
        const stageEventRepository = { create: jest.fn(async (businessId, input) => ({ id: 1, ...input })) };
        const availmentRepository = {
            findById: jest.fn(async () => availment),
            updateFulfillmentState: jest.fn(async () => 1),
            runInTransaction: jest.fn(async (businessId, fn) => fn(FAKE_TRANSACTION))
        };
        const businessRepository = makeBusinessRepository({ active });
        const useCase = buildProgressStageUseCase({ stageEventRepository, availmentRepository, businessRepository });
        return {
            stageEventRepository, availmentRepository, businessRepository, useCase, FAKE_TRANSACTION
        };
    };

    it('accepts the legal successor stage for delivery (placed -> confirmed)', async () => {
        const { useCase, stageEventRepository, availmentRepository, FAKE_TRANSACTION } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'delivery', fulfillment_status: 'placed' })
        });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 20 });

        expect(result.isSuccess).toBe(true);
        expect(result.data.fulfillmentStatus).toBe('confirmed');
        expect(availmentRepository.runInTransaction).toHaveBeenCalledWith('biz-1', expect.any(Function));
        expect(stageEventRepository.create).toHaveBeenCalledWith('biz-1', expect.objectContaining({
            availmentId: 20,
            fulfillmentMode: 'delivery',
            fulfillmentStatus: 'confirmed',
            isForced: false
        }), { transaction: FAKE_TRANSACTION });
        expect(availmentRepository.updateFulfillmentState).toHaveBeenCalledWith('biz-1', 20, {
            fulfillmentStatus: 'confirmed',
            fulfillmentStage: 'confirmed'
        }, { transaction: FAKE_TRANSACTION });
    });

    it('CR-02: writes the ledger row and the cache sync atomically — a failed cache-sync rolls back the whole progression, not just half of it', async () => {
        // No outer transaction is opened via availmentRepository.runInTransaction
        // in this test — instead it directly invokes the callback with a fake
        // transaction, mirroring what a real sequelize.transaction(fn) does:
        // if `fn` rejects, the caller sees that rejection and nothing commits.
        const stageEventRepository = { create: jest.fn(async (businessId, input) => ({ id: 1, ...input })) };
        const updateFailure = new Error('simulated cache-sync failure');
        const availmentRepository = {
            findById: jest.fn(async () => makeAvailment({ fulfillment_mode: 'delivery', fulfillment_status: 'placed' })),
            updateFulfillmentState: jest.fn(async () => { throw updateFailure; }),
            runInTransaction: jest.fn(async (businessId, fn) => fn(FAKE_TRANSACTION))
        };
        const businessRepository = makeBusinessRepository();
        const useCase = buildProgressStageUseCase({ stageEventRepository, availmentRepository, businessRepository });

        await expect(useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 20 }))
            .rejects.toThrow('simulated cache-sync failure');

        // The ledger write and the cache-sync write both received the SAME
        // transaction object — proving they were composed as one atomic
        // unit (runInTransaction), not two independent calls.
        expect(stageEventRepository.create).toHaveBeenCalledWith('biz-1', expect.anything(), { transaction: FAKE_TRANSACTION });
        expect(availmentRepository.updateFulfillmentState).toHaveBeenCalledWith('biz-1', 20, expect.anything(), { transaction: FAKE_TRANSACTION });
    });

    it('accepts the legal successor stage for pickup (preparing -> ready)', async () => {
        const { useCase } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'pickup', fulfillment_status: 'preparing' })
        });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 20 });

        expect(result.isSuccess).toBe(true);
        expect(result.data.fulfillmentStatus).toBe('ready');
    });

    it('accepts the legal successor stage for dine_in (confirmed -> preparing)', async () => {
        const { useCase } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'dine_in', fulfillment_status: 'confirmed' })
        });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 20 });

        expect(result.isSuccess).toBe(true);
        expect(result.data.fulfillmentStatus).toBe('preparing');
    });

    it('rejects an illegal/skipped transition with a 409 conflict (delivery placed -> out_for_delivery is not requested but skip is inferred from sequence, e.g. attempting to skip preparing)', async () => {
        // The usecase always computes the NEXT legal stage server-side (it
        // does not accept a client-supplied target stage), so "skip" is
        // exercised by a stage that has no legal successor because the mode
        // does not include it (pickup has no out_for_delivery stage at all).
        const { useCase } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'pickup', fulfillment_status: 'ready' })
        });
        // ready -> completed IS legal for pickup; use dine_in completed (terminal) instead to force a genuine conflict.
        const { useCase: terminalUseCase } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'dine_in', fulfillment_status: 'completed' })
        });

        const legalResult = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 20 });
        expect(legalResult.isSuccess).toBe(true);
        expect(legalResult.data.fulfillmentStatus).toBe('completed');

        const terminalResult = await terminalUseCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 20 });
        expect(terminalResult.isSuccess).toBe(false);
        expect(terminalResult.error.code).toBe('CONFLICT');
        expect(terminalResult.statusCode).toBe(409);
    });

    it('rejects progressing an already-completed availment (D-07 immutability)', async () => {
        const { useCase, stageEventRepository } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'delivery', fulfillment_status: 'completed' })
        });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 20 });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(stageEventRepository.create).not.toHaveBeenCalled();
    });

    it('force-completes a delivery order from out_for_delivery with is_forced=true + reason (D-10)', async () => {
        const { useCase, stageEventRepository } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'delivery', fulfillment_status: 'out_for_delivery' })
        });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            force: true,
            reason: 'Customer confirmed receipt by phone.'
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.isForced).toBe(true);
        expect(result.data.fulfillmentStatus).toBe('completed');
        expect(stageEventRepository.create).toHaveBeenCalledWith('biz-1', expect.objectContaining({
            isForced: true,
            reason: 'Customer confirmed receipt by phone.',
            fulfillmentStatus: 'completed'
        }), expect.objectContaining({ transaction: expect.anything() }));
    });

    it('rejects a force-complete for a non-delivery mode', async () => {
        const { useCase } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'pickup', fulfillment_status: 'ready' })
        });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            force: true,
            reason: 'attempt'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
    });

    it('rejects a force-complete for a delivery order not currently out_for_delivery', async () => {
        const { useCase } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'delivery', fulfillment_status: 'preparing' })
        });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            force: true,
            reason: 'attempt'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
    });

    it('requires a reason when force=true', async () => {
        const { useCase } = makeDeps({
            availment: makeAvailment({ fulfillment_mode: 'delivery', fulfillment_status: 'out_for_delivery' })
        });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            force: true
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns forbidden (403) for a non-active-member requester', async () => {
        const { useCase, stageEventRepository } = makeDeps({ active: false });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 20 });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(stageEventRepository.create).not.toHaveBeenCalled();
    });

    it('returns not found (404) when the availment does not exist', async () => {
        const stageEventRepository = { create: jest.fn() };
        const availmentRepository = { findById: jest.fn(async () => null), updateFulfillmentState: jest.fn() };
        const businessRepository = makeBusinessRepository();
        const useCase = buildProgressStageUseCase({ stageEventRepository, availmentRepository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 999 });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });
});

describe('buildAssignCourierUseCase (FUL-03, D-01/D-04)', () => {
    it('supersedes the prior active assignment and inserts a new active row', async () => {
        const courierAssignmentRepository = {
            findActiveForAvailment: jest.fn(async () => ({ id: 5 })),
            markSuperseded: jest.fn(async () => 1),
            create: jest.fn(async (businessId, input) => ({ id: 6, ...input }))
        };
        const businessRepository = makeBusinessRepository();
        const useCase = buildAssignCourierUseCase({ courierAssignmentRepository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            courierName: 'Juan Dela Cruz',
            courierContact: '09171234567',
            payoutAmount: 150
        });

        expect(courierAssignmentRepository.markSuperseded).toHaveBeenCalledWith('biz-1', 5);
        expect(courierAssignmentRepository.create).toHaveBeenCalledWith('biz-1', expect.objectContaining({
            availmentId: 20,
            courierName: 'Juan Dela Cruz'
        }));
        expect(result.isSuccess).toBe(true);
        expect(result.data.assignment.id).toBe(6);
    });

    it('inserts a first assignment with no supersede when there is no prior active row', async () => {
        const courierAssignmentRepository = {
            findActiveForAvailment: jest.fn(async () => null),
            markSuperseded: jest.fn(),
            create: jest.fn(async (businessId, input) => ({ id: 6, ...input }))
        };
        const businessRepository = makeBusinessRepository();
        const useCase = buildAssignCourierUseCase({ courierAssignmentRepository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            courierName: 'Juan Dela Cruz'
        });

        expect(courierAssignmentRepository.markSuperseded).not.toHaveBeenCalled();
        expect(result.isSuccess).toBe(true);
    });

    it('rejects a negative payout_amount (V5)', async () => {
        const courierAssignmentRepository = {
            findActiveForAvailment: jest.fn(),
            markSuperseded: jest.fn(),
            create: jest.fn()
        };
        const businessRepository = makeBusinessRepository();
        const useCase = buildAssignCourierUseCase({ courierAssignmentRepository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            courierName: 'Juan Dela Cruz',
            payoutAmount: -50
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(courierAssignmentRepository.create).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric payout_amount', async () => {
        const courierAssignmentRepository = {
            findActiveForAvailment: jest.fn(),
            markSuperseded: jest.fn(),
            create: jest.fn()
        };
        const businessRepository = makeBusinessRepository();
        const useCase = buildAssignCourierUseCase({ courierAssignmentRepository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            courierName: 'Juan Dela Cruz',
            payoutAmount: 'not-a-number'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects an empty courier_name', async () => {
        const courierAssignmentRepository = {
            findActiveForAvailment: jest.fn(),
            markSuperseded: jest.fn(),
            create: jest.fn()
        };
        const businessRepository = makeBusinessRepository();
        const useCase = buildAssignCourierUseCase({ courierAssignmentRepository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            courierName: '   '
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns forbidden (403) for a non-active-member requester', async () => {
        const courierAssignmentRepository = {
            findActiveForAvailment: jest.fn(),
            markSuperseded: jest.fn(),
            create: jest.fn()
        };
        const businessRepository = makeBusinessRepository({ active: false });
        const useCase = buildAssignCourierUseCase({ courierAssignmentRepository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            availmentId: 20,
            courierName: 'Juan Dela Cruz'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(courierAssignmentRepository.create).not.toHaveBeenCalled();
    });
});

describe('buildMarkPayoutUseCase (FUL-03, D-02)', () => {
    it('flips payout_status owed -> paid with paid_at', async () => {
        const courierAssignmentRepository = { updatePayout: jest.fn(async () => 1) };
        const businessRepository = makeBusinessRepository();
        const useCase = buildMarkPayoutUseCase({ courierAssignmentRepository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', assignmentId: 5 });

        expect(courierAssignmentRepository.updatePayout).toHaveBeenCalledWith('biz-1', 5, expect.objectContaining({
            payoutStatus: 'paid',
            paidAt: expect.any(Date)
        }));
        expect(result.isSuccess).toBe(true);
        expect(result.data.payoutStatus).toBe('paid');
    });

    it('returns not found (404) when the assignment does not exist', async () => {
        const courierAssignmentRepository = { updatePayout: jest.fn(async () => 0) };
        const businessRepository = makeBusinessRepository();
        const useCase = buildMarkPayoutUseCase({ courierAssignmentRepository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', assignmentId: 999 });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns forbidden (403) for a non-active-member requester', async () => {
        const courierAssignmentRepository = { updatePayout: jest.fn() };
        const businessRepository = makeBusinessRepository({ active: false });
        const useCase = buildMarkPayoutUseCase({ courierAssignmentRepository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', assignmentId: 5 });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(courierAssignmentRepository.updatePayout).not.toHaveBeenCalled();
    });
});

describe('TenantDatabaseUnavailableError mapping', () => {
    it('maps a "missing" reason to a 404 NO_TENANT_DATABASE result for listIncomingOrders', async () => {
        const error = new Error('missing');
        error.name = 'TenantDatabaseUnavailableError';
        error.reason = 'missing';
        const availmentReadRepository = { findIncomingAvailments: jest.fn(async () => { throw error; }) };
        const businessRepository = makeBusinessRepository();
        const useCase = buildListIncomingOrdersUseCase({ availmentReadRepository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.details.error_code).toBe('NO_TENANT_DATABASE');
        expect(result.statusCode).toBe(404);
    });

    it('maps an "unreachable" reason to a 503 result for progressStage', async () => {
        const error = new Error('unreachable');
        error.name = 'TenantDatabaseUnavailableError';
        error.reason = 'unreachable';
        const stageEventRepository = { create: jest.fn() };
        const availmentRepository = { findById: jest.fn(async () => { throw error; }), updateFulfillmentState: jest.fn() };
        const businessRepository = makeBusinessRepository();
        const useCase = buildProgressStageUseCase({ stageEventRepository, availmentRepository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', availmentId: 20 });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(503);
    });
});
