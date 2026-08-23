import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildUpdateOnlineOrderStatusUseCase } from '../src/modules/pos/usecases/posUseCases.js';

// Phase 148 (#825). Completion now follows the money, not the label: an order may not complete
// while it still owes a balance. Before this phase, `payment_status === 'paid'` and "fully settled"
// were the same thing by construction, because nothing could settle a downpayment balance at all.
//
// The second thing this suite exists for is the discriminator in assertDeliveryCompletionReadiness.
// A merchant-owned digital balance settlement legitimately has no cash_received/change_amount
// (ADR 0063 clause 5 [binding]: never claim cash changed hands), so the COD evidence check had to
// learn to tell a settled-downpayment order from a plain COD one. It does that on amount_paid > 0.
// That is a subtle load-bearing condition, so both sides of it are pinned here -- the plain-COD
// path especially, since silently relaxing it would weaken a live production guard.

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const DELIVERED_JOB = {
    provider: 'manual',
    status: 'delivered',
    delivery_personnel_id: 21,
    assigned_by: 12,
    assigned_shift_id: 9,
    assigned_at: '2026-08-07T03:00:00.000Z'
};

const buildRepository = (seed = {}) => {
    const order = {
        pos_transaction_id: 44,
        order_source: 'online_store',
        order_method: 'delivery',
        payment_type: 'cash',
        payment_timing: 'on_delivery',
        payment_status: 'partially_paid',
        amount_paid: 200,
        balance_due: 800,
        total_amount: 1000,
        cash_received: null,
        change_amount: null,
        payment_collected_at: null,
        payment_collected_by: null,
        payment_collected_shift_id: null,
        payment_collected_terminal_id: null,
        fulfillment_status: 'out_for_delivery',
        location_id: 7,
        deliveryJob: { ...DELIVERED_JOB },
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

const complete = (repository) => {
    const useCase = buildUpdateOnlineOrderStatusUseCase({
        posRepository: repository,
        inventoryCommandService: null,
        activityRecorder: jest.fn().mockResolvedValue(null)
    });
    return run(() => useCase({
        posTransactionId: 44,
        payload: { fulfillment_status: 'completed' },
        user: { user_id: 12 }
    }));
};

// The order shape buildRecordOrderBalancePaymentUseCase leaves behind, per settlement method.
const settledByCash = {
    payment_status: 'paid',
    amount_paid: 1000,
    balance_due: 0,
    cash_received: 1000,
    change_amount: 200,
    payment_collected_at: '2026-08-23T04:00:00.000Z',
    payment_collected_by: 12,
    payment_collected_shift_id: 9,
    payment_collected_terminal_id: 'COUNTER-01'
};
const settledByMerchantOwned = {
    ...settledByCash,
    cash_received: null,
    change_amount: null
};

describe('POS online order completion balance gate', () => {
    it('blocks delivery completion while a balance is outstanding', async () => {
        const repository = buildRepository();

        const result = await complete(repository);

        expect(result.success).toBe(false);
        expect(result.error.details.order_lifecycle).toMatchObject({
            reason_code: 'DELIVERY_BALANCE_DUE_OUTSTANDING',
            balance_due: 800,
            payment_status: 'partially_paid'
        });
        expect(repository.updateOrderById).not.toHaveBeenCalled();
    });

    it('blocks pickup completion while a balance is outstanding', async () => {
        const repository = buildRepository({
            order_method: 'pickup',
            payment_timing: 'on_pickup',
            fulfillment_status: 'ready_for_pickup',
            deliveryJob: null
        });

        const result = await complete(repository);

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('PICKUP_BALANCE_DUE_OUTSTANDING');
        expect(repository.updateOrderById).not.toHaveBeenCalled();
    });

    it('distinguishes an outstanding balance from an unpaid order on pickup', async () => {
        // Two different operational situations -- "collect the balance" vs. "collect payment" --
        // and the terminal must be able to tell them apart from the reason_code alone.
        const repository = buildRepository({
            order_method: 'pickup',
            payment_timing: 'on_pickup',
            fulfillment_status: 'ready_for_pickup',
            payment_status: 'unpaid',
            amount_paid: 0,
            balance_due: 0,
            deliveryJob: null
        });

        const result = await complete(repository);

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('PICKUP_PAYMENT_REQUIRED');
    });

    it('completes a delivery order settled with cash', async () => {
        const repository = buildRepository(settledByCash);

        const result = await complete(repository);

        expect(result.success).toBe(true);
        expect(repository.order.fulfillment_status).toBe('completed');
    });

    it('completes a delivery order settled with a merchant-owned method that has no cash evidence', async () => {
        // The whole reason the evidence check needed the amount_paid discriminator. Without it,
        // this order -- fully paid, fully attributed to a cashier/shift/terminal -- would be stuck
        // forever for the sole reason that no cash changed hands.
        const repository = buildRepository(settledByMerchantOwned);

        const result = await complete(repository);

        expect(result.success).toBe(true);
        expect(repository.order.fulfillment_status).toBe('completed');
    });

    it('still requires cash evidence on a plain COD delivery that never had a downpayment', async () => {
        // The discriminator pin. A plain COD order leaves amount_paid at its 0 default, so it must
        // keep the original, stricter rule -- payment_status alone is not enough for it, and this
        // test fails loudly if the discriminator is ever widened into "attribution is sufficient".
        const repository = buildRepository({
            payment_status: 'paid',
            amount_paid: 0,
            balance_due: 0,
            cash_received: null,
            change_amount: null,
            payment_collected_at: '2026-08-23T04:00:00.000Z',
            payment_collected_by: 12,
            payment_collected_shift_id: 9,
            payment_collected_terminal_id: 'COUNTER-01'
        });

        const result = await complete(repository);

        expect(result.success).toBe(false);
        expect(result.error.details.order_lifecycle.reason_code).toBe('DELIVERY_COD_PAYMENT_REQUIRED');
        expect(repository.updateOrderById).not.toHaveBeenCalled();
    });
});
