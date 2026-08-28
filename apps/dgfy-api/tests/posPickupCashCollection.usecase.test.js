import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import crypto from 'node:crypto';
import dbStore from '../src/utils/dbStore.js';

let buildCollectCashPickupOrderUseCase;
let buildUpdateOnlineOrderStatusUseCase;

beforeAll(async () => {
    const module = await import('../src/modules/pos/usecases/posUseCases.js');
    buildCollectCashPickupOrderUseCase = module.buildCollectCashPickupOrderUseCase;
    buildUpdateOnlineOrderStatusUseCase = module.buildUpdateOnlineOrderStatusUseCase;
});

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (payload) => crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const buildRepository = (seed = {}) => {
    const order = {
        pos_transaction_id: 44,
        order_source: 'online_store',
        order_method: 'pickup',
        payment_type: 'cash',
        payment_timing: 'on_pickup',
        payment_status: 'unpaid',
        fulfillment_status: 'ready_for_pickup',
        total_amount: 150,
        location_id: 7,
        updated_at: new Date('2026-08-28T00:00:00.000Z'),
        ...seed
    };
    const replays = new Map();
    const audit = [];
    return {
        order,
        audit,
        operationReplays: replays,
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
    return dbStore.run({ tenantId: 'pickup-test', sequelize }, callback);
};

describe('POS cash pickup collection', () => {
    it('collects cash once, stores payment evidence, and returns a deterministic replay', async () => {
        const repository = buildRepository();
        const useCase = buildCollectCashPickupOrderUseCase({ posRepository: repository });
        const payload = { terminal_id: 'COUNTER-01', cash_received: 200, idempotency_key: 'pickup-cash-001' };
        const first = await run(() => useCase({ posTransactionId: 44, payload, user: { user_id: 12 } }));
        expect(first.success).toBe(true);
        expect(repository.order).toMatchObject({ payment_status: 'paid', cash_received: 200, change_amount: 50, payment_collected_by: 12, payment_collected_shift_id: 9, payment_collected_terminal_id: 'COUNTER-01', cashier_id: 12, shift_id: 9 });
        expect(repository.audit).toHaveLength(1);

        const replay = await run(() => useCase({ posTransactionId: 44, payload, user: { user_id: 12 } }));
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(repository.audit).toHaveLength(1);
    });

    it('preserves legacy web replay hashes when expected-state fields are absent', async () => {
        const cashRepository = buildRepository();
        const collectCash = buildCollectCashPickupOrderUseCase({ posRepository: cashRepository });
        const cashPayload = { terminal_id: 'COUNTER-01', cash_received: 200, idempotency_key: 'pickup-cash-legacy-hash' };

        const cashResult = await run(() => collectCash({
            posTransactionId: 44,
            payload: cashPayload,
            user: { user_id: 12 }
        }));

        expect(cashResult.success).toBe(true);
        expect([...cashRepository.operationReplays.values()][0].request_hash).toBe(hashPayload({
            pos_transaction_id: 44,
            terminal_id: 'COUNTER-01',
            cash_received: 200
        }));

        const statusRepository = buildRepository({ fulfillment_status: 'confirmed' });
        const updateStatus = buildUpdateOnlineOrderStatusUseCase({ posRepository: statusRepository });
        const statusResult = await run(() => updateStatus({
            posTransactionId: 44,
            payload: { fulfillment_status: 'preparing', idempotency_key: 'pickup-status-legacy-hash' },
            user: { user_id: 12 }
        }));

        expect(statusResult.success).toBe(true);
        expect([...statusRepository.operationReplays.values()][0].request_hash).toBe(hashPayload({
            pos_transaction_id: 44,
            fulfillment_status: 'preparing'
        }));
    });

    it('rejects insufficient cash and unpaid pickup completion', async () => {
        const repository = buildRepository();
        const collectCash = buildCollectCashPickupOrderUseCase({ posRepository: repository });
        const collection = await run(() => collectCash({
            posTransactionId: 44,
            payload: { terminal_id: 'COUNTER-01', cash_received: 149, idempotency_key: 'pickup-cash-002' },
            user: { user_id: 12 }
        }));
        expect(collection.success).toBe(false);
        expect(repository.order.payment_status).toBe('unpaid');

        const updateStatus = buildUpdateOnlineOrderStatusUseCase({ posRepository: repository });
        const completion = await run(() => updateStatus({
            posTransactionId: 44,
            payload: { fulfillment_status: 'completed', idempotency_key: 'pickup-status-001' },
            user: { user_id: 12 }
        }));
        expect(completion.success).toBe(false);
        expect(completion.error.message).toMatch(/must be paid/i);
    });

    it.each([
        [{ order_method: 'delivery' }, /only for pickup/i],
        [{ payment_type: 'gcash' }, /only for cash/i],
        [{ payment_status: 'paid' }, /already been paid/i],
        [{ fulfillment_status: 'preparing' }, /only when the pickup order is ready/i]
    ])('rejects ineligible collection state %#', async (seed, expectedMessage) => {
        const repository = buildRepository(seed);
        const useCase = buildCollectCashPickupOrderUseCase({ posRepository: repository });
        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: { terminal_id: 'COUNTER-01', cash_received: 200, idempotency_key: `pickup-cash-invalid-${Math.random()}` },
            user: { user_id: 12 }
        }));
        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(expectedMessage);
        expect(repository.audit).toHaveLength(0);
    });

    it('rejects a closed shift without changing the order', async () => {
        const repository = buildRepository();
        repository.findOpenTerminalShift = async () => null;
        const useCase = buildCollectCashPickupOrderUseCase({ posRepository: repository });
        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: { terminal_id: 'COUNTER-01', cash_received: 200, idempotency_key: 'pickup-cash-closed-shift' },
            user: { user_id: 12 }
        }));
        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/shift is closed/i);
        expect(repository.order.payment_status).toBe('unpaid');
    });

    it('rejects stale offline status and cash actions before mutating payment or fulfillment', async () => {
        const repository = buildRepository();
        const expected = {
            expected_status: 'ready_for_pickup',
            expected_payment_status: 'unpaid',
            expected_server_version: '2026-08-27T23:59:59.000Z'
        };
        const collectCash = buildCollectCashPickupOrderUseCase({ posRepository: repository });
        const cashResult = await run(() => collectCash({
            posTransactionId: 44,
            payload: { terminal_id: 'COUNTER-01', cash_received: 200, idempotency_key: 'pickup-cash-stale', ...expected },
            user: { user_id: 12 }
        }));
        expect(cashResult.success).toBe(false);
        expect(cashResult.error.details.reason_code).toBe('MOBILE_ORDER_VERSION_CONFLICT');
        expect(repository.order.payment_status).toBe('unpaid');

        const updateStatus = buildUpdateOnlineOrderStatusUseCase({ posRepository: repository });
        const statusResult = await run(() => updateStatus({
            posTransactionId: 44,
            payload: { fulfillment_status: 'completed', idempotency_key: 'pickup-status-stale', ...expected },
            user: { user_id: 12 }
        }));
        expect(statusResult.success).toBe(false);
        expect(statusResult.error.details.reason_code).toBe('MOBILE_ORDER_VERSION_CONFLICT');
        expect(repository.order.fulfillment_status).toBe('ready_for_pickup');
    });
});
