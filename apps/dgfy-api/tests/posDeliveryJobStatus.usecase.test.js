import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildUpdateDeliveryJobStatusUseCase } from '../src/modules/pos/usecases/posUseCases.js';

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const buildRepository = (seed = {}) => {
    const deliveryJob = {
        delivery_job_id: 17,
        pos_transaction_id: 44,
        provider: 'manual',
        status: 'pending_dispatch',
        ...seed.deliveryJob
    };
    const order = {
        pos_transaction_id: 44,
        order_source: 'online_store',
        order_method: 'delivery',
        fulfillment_status: 'out_for_delivery',
        location_id: 7,
        deliveryJob,
        ...seed
    };
    const replays = new Map();
    const audit = [];
    return {
        order,
        deliveryJob,
        audit,
        async findOperationReplayByKey({ operationKey, idempotencyKey }) {
            return replays.get(`${operationKey}:${idempotencyKey}`) || null;
        },
        async createOperationReplay(payload) {
            replays.set(`${payload.operation_key}:${payload.idempotency_key}`, payload);
            return payload;
        },
        async getOrderByIdForLifecycle() {
            return { ...order, deliveryJob: { ...deliveryJob } };
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
        },
        async updateDeliveryJobByOrderId(_id, payload) {
            Object.assign(deliveryJob, payload);
            Object.assign(order.deliveryJob, payload);
            return { ...deliveryJob };
        },
        async createAuditLog(payload) {
            audit.push(payload);
            return payload;
        }
    };
};

const run = (callback) => {
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    return dbStore.run({ tenantId: 'delivery-job-test', sequelize }, callback);
};

const updateStatus = (repository, status, idempotencyKey = null) => {
    const useCase = buildUpdateDeliveryJobStatusUseCase({ posRepository: repository });
    return run(() => useCase({
        posTransactionId: 44,
        payload: { status, ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) },
        user: { user_id: 12 },
        auditContext: { ipAddress: '127.0.0.1', userAgent: 'test-agent' }
    }));
};

describe('POS manual delivery job status', () => {
    it('advances the manual delivery lifecycle and records an idempotent replay', async () => {
        const repository = buildRepository({
            deliveryJob: {
                status: 'assigned',
                delivery_personnel_id: 21,
                assigned_by: 12,
                assigned_shift_id: 9,
                assigned_at: new Date('2026-08-08T10:00:00.000Z')
            }
        });

        const first = await updateStatus(repository, 'picked_up', 'delivery-job-001');
        const replay = await updateStatus(repository, 'picked_up', 'delivery-job-001');

        expect(first.success).toBe(true);
        expect(first.data.delivery_job).toMatchObject({ status: 'picked_up' });
        expect(first.data.order).toMatchObject({ shift_id: 9 });
        expect(first.data.status_transition).toMatchObject({
            current_status: 'assigned',
            requested_status: 'picked_up',
            outcome: 'processed'
        });
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(repository.audit).toHaveLength(1);
        expect(repository.audit[0].changes).toMatchObject({
            event: 'delivery_job_status_changed',
            previous_status: 'assigned',
            status: 'picked_up',
            shift_id: 9
        });
    });

    it('requires the guarded lifecycle order and timestamps pickup and delivery', async () => {
        const repository = buildRepository({
            deliveryJob: {
                status: 'assigned',
                delivery_personnel_id: 21,
                assigned_by: 12,
                assigned_shift_id: 9,
                assigned_at: new Date('2026-08-08T10:00:00.000Z')
            }
        });

        const pickedUp = await updateStatus(repository, 'picked_up');
        expect(pickedUp.success).toBe(true);
        expect(pickedUp.data.delivery_job).toMatchObject({ status: 'picked_up' });
        expect(pickedUp.data.delivery_job.picked_up_at).toEqual(expect.any(Date));

        const delivered = await updateStatus(repository, 'delivered');

        expect(repository.deliveryJob).toMatchObject({ status: 'delivered' });
        expect(repository.deliveryJob.picked_up_at).toEqual(expect.any(Date));
        expect(delivered.success).toBe(true);
        expect(repository.deliveryJob).toMatchObject({ status: 'delivered' });
        expect(repository.deliveryJob.delivered_at).toEqual(expect.any(Date));
        expect(repository.audit).toHaveLength(2);
    });

    it('rejects skipping a manual delivery lifecycle state without mutating the job', async () => {
        const repository = buildRepository({
            deliveryJob: {
                delivery_personnel_id: 21,
                assigned_by: 12,
                assigned_shift_id: 9,
                assigned_at: new Date('2026-08-08T10:00:00.000Z')
            }
        });

        const result = await updateStatus(repository, 'delivered');

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/invalid delivery job transition/i);
        expect(result.error.details.delivery_job).toMatchObject({
            reason_code: 'DELIVERY_JOB_STATUS_TRANSITION_INVALID',
            current_status: 'pending_dispatch',
            requested_status: 'delivered',
            allowed_next_statuses: ['assigned']
        });
        expect(repository.deliveryJob.status).toBe('pending_dispatch');
        expect(repository.audit).toHaveLength(0);
    });

    it('rejects delivery job actions before the order is out for delivery', async () => {
        const repository = buildRepository({ fulfillment_status: 'preparing' });

        const result = await updateStatus(repository, 'assigned');

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/only when the order is out for delivery/i);
        expect(result.error.details.reason_code).toBe('DELIVERY_ORDER_OUT_FOR_DELIVERY_REQUIRED');
        expect(repository.deliveryJob.status).toBe('pending_dispatch');
    });

    it('keeps provider-owned delivery jobs read-only in POS', async () => {
        const repository = buildRepository({
            deliveryJob: {
                provider: 'provider_x',
                status: 'assigned'
            }
        });

        const result = await updateStatus(repository, 'picked_up');

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('MANUAL_DELIVERY_JOB_REQUIRED');
        expect(repository.deliveryJob.status).toBe('assigned');
        expect(repository.audit).toHaveLength(0);
    });

    it('treats a repeated current status as a safe no-op', async () => {
        const repository = buildRepository({
            deliveryJob: {
                status: 'delivered',
                delivery_personnel_id: 21,
                assigned_by: 12,
                assigned_shift_id: 9,
                assigned_at: new Date('2026-08-08T10:00:00.000Z')
            }
        });

        const result = await updateStatus(repository, 'delivered');

        expect(result.success).toBe(true);
        expect(result.data.status_transition.outcome).toBe('no_change');
        expect(repository.audit).toHaveLength(0);
    });

    it('allows lifecycle transitions when assignment evidence uses a third-party courier name', async () => {
        const repository = buildRepository({
            deliveryJob: {
                status: 'assigned',
                delivery_personnel_id: null,
                delivery_personnel_name: 'Juan Dela Cruz',
                assigned_by: 12,
                assigned_shift_id: 9,
                assigned_at: new Date('2026-08-08T10:00:00.000Z')
            }
        });

        const result = await updateStatus(repository, 'picked_up');

        expect(result.success).toBe(true);
        expect(repository.deliveryJob.status).toBe('picked_up');
    });
});
