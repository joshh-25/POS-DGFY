import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildCollectCashDineInOrderUseCase } from '../src/modules/pos/usecases/posUseCases.js';

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const buildRepository = (seed = {}) => {
    const order = {
        pos_transaction_id: 45,
        order_source: 'online_store',
        order_method: 'dine_in',
        payment_type: 'cash',
        payment_timing: 'on_dine_in',
        payment_status: 'unpaid',
        fulfillment_status: 'ready_for_pickup',
        total_amount: 130,
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
            return { pos_terminal_shift_id: 9, terminal_id: terminalId, cashier_id: cashierId, location_id: locationId, status: 'open' };
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
    it('collects scheduled dine-in cash once and replays safely', async () => {
        const repository = buildRepository();
        const useCase = buildCollectCashDineInOrderUseCase({ posRepository: repository });
        const payload = { terminal_id: 'COUNTER-01', cash_received: 200, idempotency_key: 'dine-in-cash-001' };

        const first = await run(() => useCase({ posTransactionId: 45, payload, user: { user_id: 12 } }));

        expect(first.success).toBe(true);
        expect(repository.order).toMatchObject({
            payment_status: 'paid',
            cash_received: 200,
            change_amount: 70,
            payment_collected_by: 12,
            payment_collected_shift_id: 9,
            payment_collected_terminal_id: 'COUNTER-01',
            cashier_id: 12,
            shift_id: 9
        });
        expect(repository.audit).toHaveLength(1);
        expect(repository.audit[0].changes).toMatchObject({
            event: 'dine-in_cash_collected',
            payment_timing: 'on_dine_in'
        });

        const replay = await run(() => useCase({ posTransactionId: 45, payload, user: { user_id: 12 } }));

        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(repository.audit).toHaveLength(1);
    });

    it.each([
        [{ order_method: 'pickup' }, /only for dine-in/i],
        [{ payment_timing: 'on_pickup' }, /payment timing/i],
        [{ payment_status: 'paid' }, /already been paid/i],
        [{ fulfillment_status: 'preparing' }, /ready to serve/i]
    ])('rejects an ineligible dine-in cash state %#', async (seed, expectedMessage) => {
        const repository = buildRepository(seed);
        const useCase = buildCollectCashDineInOrderUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 45,
            payload: { terminal_id: 'COUNTER-01', cash_received: 200, idempotency_key: `dine-in-cash-invalid-${Math.random()}` },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(expectedMessage);
        expect(repository.audit).toHaveLength(0);
    });

    it('rejects insufficient cash without changing payment state', async () => {
        const repository = buildRepository();
        const useCase = buildCollectCashDineInOrderUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 45,
            payload: { terminal_id: 'COUNTER-01', cash_received: 129, idempotency_key: 'dine-in-cash-short' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/cover the dine-in order total/i);
        expect(repository.order.payment_status).toBe('unpaid');
        expect(repository.audit).toHaveLength(0);
    });
});
