import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildUpdateOnlineOrderStatusUseCase } from '../src/modules/pos/usecases/posUseCases.js';

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
        order_method: 'delivery',
        payment_type: 'cash',
        payment_timing: 'on_delivery',
        payment_status: 'paid',
        cash_received: 200,
        change_amount: 50,
        payment_collected_at: '2026-08-07T04:00:00.000Z',
        payment_collected_by: 12,
        payment_collected_shift_id: 9,
        payment_collected_terminal_id: 'COUNTER-01',
        fulfillment_status: 'out_for_delivery',
        total_amount: 150,
        location_id: 7,
        deliveryJob: {
            provider: 'manual',
            status: 'delivered',
            delivery_personnel_id: 21,
            assigned_by: 12,
            assigned_shift_id: 9,
            assigned_at: '2026-08-07T03:00:00.000Z'
        },
        lines: [],
        ...seed
    };

    return {
        order,
        findOpenTerminalShift: jest.fn().mockResolvedValue({
            pos_terminal_shift_id: 9,
            terminal_id: 'COUNTER-01',
            cashier_id: 12,
            location_id: 7,
            status: 'open'
        }),
        getOrderByIdForLifecycle: jest.fn(async () => ({ ...order })),
        updateOrderById: jest.fn(async (_id, payload) => {
            Object.assign(order, payload);
            return { ...order };
        })
    };
};

const run = (callback) => {
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    return dbStore.run({ sequelize }, callback);
};

const complete = (repository, inventoryCommandService = null) => {
    const useCase = buildUpdateOnlineOrderStatusUseCase({
        posRepository: repository,
        inventoryCommandService,
        activityRecorder: jest.fn().mockResolvedValue(null)
    });

    return run(() => useCase({
        posTransactionId: 44,
        payload: { fulfillment_status: 'completed' },
        user: { user_id: 12 }
    }));
};

describe('POS delivery completion guard', () => {
    it('completes a COD delivery only after delivery and server cash evidence exist', async () => {
        const repository = buildRepository();

        const result = await complete(repository);

        expect(result.success).toBe(true);
        expect(repository.order.fulfillment_status).toBe('completed');
        expect(repository.updateOrderById).toHaveBeenCalledWith(
            44,
            { fulfillment_status: 'completed', cashier_id: 12 },
            expect.objectContaining({ lock: true })
        );
    });

    it('blocks COD completion when delivery payment evidence is missing', async () => {
        const repository = buildRepository({
            payment_status: 'unpaid',
            cash_received: null,
            change_amount: null,
            payment_collected_at: null,
            payment_collected_by: null,
            payment_collected_shift_id: null,
            payment_collected_terminal_id: null
        });
        const inventoryCommandService = {
            issueStockForOnlineFulfillment: jest.fn()
        };

        const result = await complete(repository, inventoryCommandService);

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/COD delivery orders must have server-recorded cash payment/i);
        expect(result.error.details.order_lifecycle.reason_code).toBe('DELIVERY_COD_PAYMENT_REQUIRED');
        expect(repository.updateOrderById).not.toHaveBeenCalled();
        expect(inventoryCommandService.issueStockForOnlineFulfillment).not.toHaveBeenCalled();
    });

    it('blocks completion when the delivery job is not delivered', async () => {
        const repository = buildRepository({
            deliveryJob: { status: 'out_for_delivery' }
        });
        const inventoryCommandService = {
            issueStockForOnlineFulfillment: jest.fn()
        };

        const result = await complete(repository, inventoryCommandService);

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/only after the delivery job is marked delivered/i);
        expect(result.error.details.order_lifecycle).toMatchObject({
            reason_code: 'DELIVERY_JOB_NOT_DELIVERED',
            delivery_job_status: 'out_for_delivery'
        });
        expect(repository.updateOrderById).not.toHaveBeenCalled();
        expect(inventoryCommandService.issueStockForOnlineFulfillment).not.toHaveBeenCalled();
    });

    it('blocks manual delivery completion when assignment evidence is missing', async () => {
        const repository = buildRepository({
            deliveryJob: {
                provider: 'manual',
                status: 'delivered',
                delivery_personnel_id: null,
                assigned_by: null,
                assigned_shift_id: null,
                assigned_at: null
            },
            payment_type: 'qrph',
            payment_timing: 'upfront',
            payment_status: 'paid'
        });

        const result = await complete(repository);

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/require a delivery-person assignment before completion/i);
        expect(result.error.details.order_lifecycle.reason_code).toBe('DELIVERY_ASSIGNMENT_REQUIRED');
        expect(repository.updateOrderById).not.toHaveBeenCalled();
    });

    it('requires verified payment for prepaid delivery completion', async () => {
        const repository = buildRepository({
            payment_type: 'qrph',
            payment_timing: 'upfront',
            payment_status: 'unpaid',
            cash_received: null,
            change_amount: null,
            payment_collected_at: null,
            payment_collected_by: null,
            payment_collected_shift_id: null,
            payment_collected_terminal_id: null
        });

        const result = await complete(repository);

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/verified payment before completion/i);
        expect(result.error.details.order_lifecycle.reason_code).toBe('DELIVERY_PAYMENT_REQUIRED');
        expect(repository.updateOrderById).not.toHaveBeenCalled();
    });

    it('completes a prepaid delivery after verified payment and delivery', async () => {
        const repository = buildRepository({
            payment_type: 'qrph',
            payment_timing: 'upfront',
            payment_status: 'paid',
            cash_received: null,
            change_amount: null,
            payment_collected_at: null,
            payment_collected_by: null,
            payment_collected_shift_id: null,
            payment_collected_terminal_id: null
        });

        const result = await complete(repository);

        expect(result.success).toBe(true);
        expect(repository.order.fulfillment_status).toBe('completed');
    });
});
