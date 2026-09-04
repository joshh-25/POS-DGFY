import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
    buildAssignDeliveryPersonnelUseCase,
    buildListActiveDeliveryPersonnelUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const buildAssignmentRepository = (seed = {}) => {
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
        ...seed.order
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
        async findActiveDeliveryPersonnelById() {
            return {
                delivery_personnel_id: 21,
                display_name: 'Branch Rider',
                phone: '09170000000',
                location_id: 7,
                is_active: true
            };
        },
        async assignDeliveryPersonnelToJob(_id, payload) {
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
    return dbStore.run({ tenantId: 'delivery-assignment-test', sequelize }, callback);
};

describe('POS delivery personnel assignment', () => {
    it('lists active personnel inside the authorized location scope', async () => {
        const repository = {
            async listActiveDeliveryPersonnel() {
                return [{ delivery_personnel_id: 21, display_name: 'Branch Rider', location_id: 7, is_active: true }];
            }
        };
        const useCase = buildListActiveDeliveryPersonnelUseCase({
            posRepository: repository,
            resolveLocationScope: jest.fn(async () => ({ location_id: 7 }))
        });

        const result = await useCase({
            query: { location_id: 7 },
            user: { user_id: 12 }
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            location_id: 7,
            delivery_personnel: [{ delivery_personnel_id: 21, display_name: 'Branch Rider', location_id: 7, is_active: true }]
        });
    });

    it('assigns personnel, records shift accountability, and replays safely', async () => {
        const repository = buildAssignmentRepository({
            deliveryJob: { delivery_personnel_id: 21 }
        });
        const useCase = buildAssignDeliveryPersonnelUseCase({ posRepository: repository });
        const payload = {
            delivery_personnel_id: 21,
            idempotency_key: 'delivery-assignment-001'
        };

        const first = await run(() => useCase({
            posTransactionId: 44,
            payload,
            user: { user_id: 12 },
            auditContext: { ipAddress: '127.0.0.1', userAgent: 'test-agent' }
        }));
        const replay = await run(() => useCase({
            posTransactionId: 44,
            payload,
            user: { user_id: 12 }
        }));

        expect(first.success).toBe(true);
        expect(first.data.delivery_job).toMatchObject({
            status: 'assigned',
            delivery_personnel_id: 21,
            assigned_by: 12,
            assigned_shift_id: 9
        });
        expect(first.data.order).toMatchObject({ shift_id: 9 });
        expect(first.data.assignment).toMatchObject({
            assigned_by: 12,
            assigned_shift_id: 9,
            delivery_personnel: { delivery_personnel_id: 21 }
        });
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(repository.audit).toHaveLength(1);
        expect(repository.audit[0].changes).toMatchObject({
            event: 'delivery_personnel_assigned',
            assigned_shift_id: 9,
            delivery_personnel_id: 21
        });
    });

    it('assigns an unregistered third-party courier name without a registry lookup', async () => {
        const repository = buildAssignmentRepository({ deliveryJob: { delivery_personnel_id: 21 } });
        repository.findActiveDeliveryPersonnelById = jest.fn();
        const useCase = buildAssignDeliveryPersonnelUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: {
                delivery_personnel_name: '  Juan Dela Cruz  ',
                idempotency_key: 'delivery-assignment-001-third-party'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(repository.findActiveDeliveryPersonnelById).not.toHaveBeenCalled();
        expect(result.data.delivery_job).toMatchObject({
            status: 'assigned',
            delivery_personnel_id: null,
            delivery_personnel_name: 'Juan Dela Cruz',
            assigned_by: 12,
            assigned_shift_id: 9
        });
        expect(result.data.assignment).toMatchObject({
            delivery_personnel_name: 'Juan Dela Cruz',
            delivery_personnel: {
                display_name: 'Juan Dela Cruz',
                is_third_party: true
            }
        });
        expect(repository.audit[0].changes).toMatchObject({
            delivery_personnel_id: null,
            delivery_personnel_name: 'Juan Dela Cruz'
        });
    });

    it('rejects an assignment without exactly one personnel identifier or name', async () => {
        const repository = buildAssignmentRepository();
        const useCase = buildAssignDeliveryPersonnelUseCase({ posRepository: repository });

        const missing = await run(() => useCase({
            posTransactionId: 44,
            payload: { idempotency_key: 'delivery-assignment-missing' },
            user: { user_id: 12 }
        }));
        const both = await run(() => useCase({
            posTransactionId: 44,
            payload: {
                delivery_personnel_id: 21,
                delivery_personnel_name: 'Juan Dela Cruz',
                idempotency_key: 'delivery-assignment-both'
            },
            user: { user_id: 12 }
        }));

        expect(missing.success).toBe(false);
        expect(missing.error.code).toBe('VALIDATION_FAILED');
        expect(both.success).toBe(false);
        expect(both.error.code).toBe('VALIDATION_FAILED');
    });

    it('blocks lifecycle status changes when assignment evidence is missing', async () => {
        const repository = buildAssignmentRepository();
        const useCase = (await import('../src/modules/pos/usecases/posUseCases.js')).buildUpdateDeliveryJobStatusUseCase({
            posRepository: repository
        });

        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: { status: 'picked_up' },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_ASSIGNMENT_REQUIRED');
        expect(repository.deliveryJob.status).toBe('pending_dispatch');
    });

    it('rejects assignment before the order is out for delivery', async () => {
        const repository = buildAssignmentRepository({
            order: { fulfillment_status: 'preparing' }
        });
        const useCase = buildAssignDeliveryPersonnelUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: {
                delivery_personnel_id: 21,
                idempotency_key: 'delivery-assignment-002'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('DELIVERY_ORDER_OUT_FOR_DELIVERY_REQUIRED');
        expect(repository.deliveryJob.status).toBe('pending_dispatch');
        expect(repository.audit).toHaveLength(0);
    });

    it('rejects assignment for provider-owned delivery jobs', async () => {
        const repository = buildAssignmentRepository({
            deliveryJob: { provider: 'provider_x' }
        });
        const useCase = buildAssignDeliveryPersonnelUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: {
                delivery_personnel_id: 21,
                idempotency_key: 'delivery-assignment-003'
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('MANUAL_DELIVERY_JOB_REQUIRED');
        expect(repository.deliveryJob.status).toBe('pending_dispatch');
        expect(repository.audit).toHaveLength(0);
    });

    it('rejects idempotency-key reuse with a different assignment payload', async () => {
        const repository = buildAssignmentRepository();
        const useCase = buildAssignDeliveryPersonnelUseCase({ posRepository: repository });
        const idempotencyKey = 'delivery-assignment-004';

        const first = await run(() => useCase({
            posTransactionId: 44,
            payload: { delivery_personnel_id: 21, idempotency_key: idempotencyKey },
            user: { user_id: 12 }
        }));
        const conflict = await run(() => useCase({
            posTransactionId: 44,
            payload: { delivery_personnel_id: 22, idempotency_key: idempotencyKey },
            user: { user_id: 12 }
        }));

        expect(first.success).toBe(true);
        expect(conflict.success).toBe(false);
        expect(conflict.error.details.idempotency).toMatchObject({
            outcome: 'conflict',
            idempotent_replay: true
        });
        expect(repository.deliveryJob.delivery_personnel_id).toBe(21);
        expect(repository.audit).toHaveLength(1);
    });
});
