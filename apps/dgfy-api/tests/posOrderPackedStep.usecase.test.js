import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildUpdateOnlineOrderStatusUseCase } from '../src/modules/pos/usecases/posUseCases.js';

// Phase 211 (#1180). Retail-only, additive "packed" fulfillment step. `preparing` keeps both of
// its existing onward edges (`ready_for_pickup`, `out_for_delivery`) and gains `packed`; `packed`
// itself offers exactly the same two onward edges. The server-side gate is deliberately
// workflow-mode-agnostic (the retail-only surfacing is UI-only, see PHASE_211_PLAN.md section 1.3
// and the compliance declaration's Residual Risk #1) -- these tests exercise the use case directly,
// with no workflow-mode input at all, matching that reality.

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const buildRepository = (seed = {}) => {
    const order = {
        pos_transaction_id: 77,
        order_source: 'online_store',
        order_method: 'delivery',
        fulfillment_status: 'preparing',
        location_id: 7,
        cashier_id: 12,
        accepted_by: 3,
        accepted_at: new Date('2026-09-01T10:00:00Z'),
        rejected_by: null,
        rejected_at: null,
        packed_by: null,
        packed_at: null,
        updated_at: new Date('2026-09-01T10:00:00Z'),
        ...seed
    };
    const replays = new Map();
    return {
        order,
        async findOperationReplayByKey({ operationKey, idempotencyKey }) {
            return replays.get(`${operationKey}:${idempotencyKey}`) || null;
        },
        async createOperationReplay(payload) {
            replays.set(`${payload.operation_key}:${payload.idempotency_key}`, payload);
            return payload;
        },
        async getOrderByIdForLifecycle() {
            return { ...order };
        },
        async findOpenTerminalShift() {
            return {
                pos_terminal_shift_id: 9,
                terminal_id: 'COUNTER-01',
                cashier_id: 12,
                location_id: 7,
                status: 'open'
            };
        },
        async updateOrderById(_id, payload) {
            Object.assign(order, payload);
            return { ...order };
        }
    };
};

const run = (callback) => {
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    return dbStore.run({ tenantId: 'order-packed-step-test', sequelize }, callback);
};

const updateStatus = (repository, { fulfillmentStatus, idempotencyKey, userId = 12 }) => {
    const useCase = buildUpdateOnlineOrderStatusUseCase({ posRepository: repository });
    return run(() => useCase({
        posTransactionId: repository.order.pos_transaction_id,
        payload: {
            fulfillment_status: fulfillmentStatus,
            idempotency_key: idempotencyKey
        },
        user: { user_id: userId }
    }));
};

describe('preparing -> packed online order status (Phase 211, #1180)', () => {
    it('persists packed_at/packed_by and does not touch accepted_*/rejected_*', async () => {
        const repository = buildRepository({ fulfillment_status: 'preparing' });

        const result = await updateStatus(repository, {
            fulfillmentStatus: 'packed',
            idempotencyKey: 'pack-1'
        });

        expect(result.success).toBe(true);
        expect(repository.order.fulfillment_status).toBe('packed');
        expect(repository.order.packed_by).toBe(12);
        expect(repository.order.packed_at).toBeInstanceOf(Date);
        expect(repository.order.accepted_by).toBe(3);
        expect(repository.order.accepted_at).toEqual(new Date('2026-09-01T10:00:00Z'));
        expect(repository.order.rejected_by).toBeNull();
        expect(repository.order.rejected_at).toBeNull();
    });

    it('packed -> out_for_delivery succeeds (delivery order)', async () => {
        const repository = buildRepository({ fulfillment_status: 'packed', order_method: 'delivery' });

        const result = await updateStatus(repository, {
            fulfillmentStatus: 'out_for_delivery',
            idempotencyKey: 'pack-2'
        });

        expect(result.success).toBe(true);
        expect(repository.order.fulfillment_status).toBe('out_for_delivery');
    });

    it('packed -> ready_for_pickup succeeds (pickup order)', async () => {
        const repository = buildRepository({ fulfillment_status: 'packed', order_method: 'pickup' });

        const result = await updateStatus(repository, {
            fulfillmentStatus: 'ready_for_pickup',
            idempotencyKey: 'pack-3'
        });

        expect(result.success).toBe(true);
        expect(repository.order.fulfillment_status).toBe('ready_for_pickup');
    });

    it('packed -> completed 409s with ORDER_STATUS_TRANSITION_INVALID', async () => {
        const repository = buildRepository({ fulfillment_status: 'packed' });

        const result = await updateStatus(repository, {
            fulfillmentStatus: 'completed',
            idempotencyKey: 'pack-4'
        });

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(409);
        expect(result.error?.details?.order_lifecycle?.reason_code).toBe('ORDER_STATUS_TRANSITION_INVALID');
    });

    it('preparing -> out_for_delivery still succeeds unchanged (F&B non-regression pin)', async () => {
        const repository = buildRepository({ fulfillment_status: 'preparing', order_method: 'delivery' });

        const result = await updateStatus(repository, {
            fulfillmentStatus: 'out_for_delivery',
            idempotencyKey: 'pack-5'
        });

        expect(result.success).toBe(true);
        expect(repository.order.fulfillment_status).toBe('out_for_delivery');
        // An order that never enters `packed` behaves byte-identically to before this phase.
        expect(repository.order.packed_by).toBeNull();
        expect(repository.order.packed_at).toBeNull();
    });

    it('a repeat packed -> packed PATCH is a no-op and does not restamp packed_at', async () => {
        const originalPackedAt = new Date('2026-09-01T09:00:00Z');
        const repository = buildRepository({
            fulfillment_status: 'packed',
            packed_by: 12,
            packed_at: originalPackedAt
        });

        const result = await updateStatus(repository, {
            fulfillmentStatus: 'packed',
            idempotencyKey: 'pack-6'
        });

        expect(result.success).toBe(true);
        expect(repository.order.packed_at).toEqual(originalPackedAt);
    });
});
