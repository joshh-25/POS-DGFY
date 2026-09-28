import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';

let buildCollectCashDineInOrderUseCase;

beforeAll(async () => {
    const module = await import('../src/modules/pos/usecases/posUseCases.js');
    buildCollectCashDineInOrderUseCase = module.buildCollectCashDineInOrderUseCase;
});

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const buildRepository = (seed = {}) => {
    const order = {
        pos_transaction_id: 44,
        order_source: 'online_store',
        order_method: 'dine_in',
        payment_type: 'cash',
        payment_timing: 'on_dine_in',
        payment_status: 'unpaid',
        fulfillment_status: 'ready_for_pickup',
        total_amount: 150,
        scheduled_for: new Date('2026-09-24T09:00:00.000Z'),
        location_id: 7,
        ...seed
    };
    const replays = new Map();
    const audit = [];
    return {
        order,
        audit,
        async findOperationReplayByKey({ operationKey, idempotencyKey }) {
            return replays.get(`${operationKey}:${idempotencyKey}`) || null;
        },
        async createOperationReplay(payload) {
            replays.set(`${payload.operation_key}:${payload.idempotency_key}`, payload);
            return payload;
        },
        async getOrderByIdForLifecycle() { return { ...order }; },
        async findOpenTerminalShift({ terminalId, cashierId, locationId }) {
            return {
                pos_terminal_shift_id: 9,
                terminal_id: terminalId,
                cashier_id: cashierId,
                location_id: locationId,
                status: 'open'
            };
        },
        async updateOrderById(_id, payload) { Object.assign(order, payload); return { ...order }; },
        async createAuditLog(payload) { audit.push(payload); return payload; }
    };
};

const run = (callback) => {
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    return dbStore.run({ tenantId: 'dine-in-cash-test', sequelize }, callback);
};

describe('POS dine-in cash collection', () => {
    it('settles the existing order even when its scheduled serve time has passed, and replays safely', async () => {
        const repository = buildRepository();
        const useCase = buildCollectCashDineInOrderUseCase({ posRepository: repository });
        const payload = {
            terminal_id: 'COUNTER-01',
            cash_received: 200,
            idempotency_key: 'dine-in-cash-001'
        };

        const first = await run(() => useCase({
            posTransactionId: 44,
            payload,
            user: { user_id: 12 }
        }));

        expect(first.success).toBe(true);
        expect(repository.order).toMatchObject({
            order_method: 'dine_in',
            fulfillment_status: 'ready_for_pickup',
            payment_status: 'paid',
            cash_received: 200,
            change_amount: 50,
            payment_collected_by: 12,
            payment_collected_shift_id: 9,
            payment_collected_terminal_id: 'COUNTER-01',
            cashier_id: 12,
            shift_id: 9
        });
        expect(repository.audit).toHaveLength(1);
        expect(repository.audit[0].changes.event).toBe('dine_in_cash_collected');

        const replay = await run(() => useCase({ posTransactionId: 44, payload, user: { user_id: 12 } }));

        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(repository.audit).toHaveLength(1);
    });

    it.each([
        [{ order_method: 'pickup' }, /only for dine-in/i],
        [{ payment_type: 'gcash' }, /only for cash dine-in/i],
        [{ payment_timing: 'upfront' }, /payment timing must be on_dine_in/i],
        [{ payment_status: 'paid' }, /already been paid/i],
        [{ fulfillment_status: 'preparing' }, /only when the dine-in order is ready to serve/i]
    ])('rejects an ineligible order state %# without changing it', async (seed, expectedMessage) => {
        const repository = buildRepository(seed);
        const useCase = buildCollectCashDineInOrderUseCase({ posRepository: repository });
        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: {
                terminal_id: 'COUNTER-01',
                cash_received: 200,
                idempotency_key: `dine-in-invalid-${Math.random()}`
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(expectedMessage);
        expect(repository.order.payment_status).toBe(seed.payment_status || 'unpaid');
        expect(repository.audit).toHaveLength(0);
    });

    it('requires full payment and an open shift without advancing fulfillment', async () => {
        const insufficientCashRepository = buildRepository();
        const collectInsufficientCash = buildCollectCashDineInOrderUseCase({ posRepository: insufficientCashRepository });
        const insufficientCash = await run(() => collectInsufficientCash({
            posTransactionId: 44,
            payload: { terminal_id: 'COUNTER-01', cash_received: 149, idempotency_key: 'dine-in-cash-short' },
            user: { user_id: 12 }
        }));
        expect(insufficientCash.success).toBe(false);
        expect(insufficientCashRepository.order.payment_status).toBe('unpaid');

        const closedShiftRepository = buildRepository();
        closedShiftRepository.findOpenTerminalShift = async () => null;
        const collectClosedShift = buildCollectCashDineInOrderUseCase({ posRepository: closedShiftRepository });
        const closedShift = await run(() => collectClosedShift({
            posTransactionId: 44,
            payload: { terminal_id: 'COUNTER-01', cash_received: 200, idempotency_key: 'dine-in-cash-closed' },
            user: { user_id: 12 }
        }));
        expect(closedShift.success).toBe(false);
        expect(closedShiftRepository.order.payment_status).toBe('unpaid');
        expect(closedShiftRepository.order.fulfillment_status).toBe('ready_for_pickup');
    });
});
