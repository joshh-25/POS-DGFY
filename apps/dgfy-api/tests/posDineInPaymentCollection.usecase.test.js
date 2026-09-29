import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { validateCollectDineInPayment } from '../src/validators/posValidator.js';

let buildCollectDineInPaymentUseCase;

beforeAll(async () => {
    const module = await import('../src/modules/pos/usecases/posUseCases.js');
    buildCollectDineInPaymentUseCase = module.buildCollectDineInPaymentUseCase;
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
    return dbStore.run({ tenantId: 'dine-in-payment-test', sequelize }, callback);
};

const basePayload = {
    terminal_id: 'COUNTER-01',
    idempotency_key: 'dine-in-payment-001'
};

const runValidator = (body) => {
    const req = { body };
    const res = {
        status: jest.fn(() => res),
        json: jest.fn(() => res)
    };
    const next = jest.fn();
    validateCollectDineInPayment(req, res, next);
    return { req, res, next };
};

describe('POS dine-in payment collection', () => {
    it('validates method-specific payment fields at the API boundary', () => {
        const cash = runValidator({ ...basePayload, payment_method: 'cash', cash_received: 200 });
        expect(cash.next).toHaveBeenCalledTimes(1);
        expect(cash.req.validatedData.payment_method).toBe('cash');

        const gcash = runValidator({ ...basePayload, payment_method: 'gcash', amount: 150, manual_payment_received: true });
        expect(gcash.next).toHaveBeenCalledTimes(1);
        expect(gcash.req.validatedData.amount).toBe(150);

        const employeeCredit = runValidator({
            ...basePayload,
            payment_method: 'employee_credit',
            amount: 150,
            manual_payment_received: true,
            employee_credit: { account_code: 'EMP-0001' }
        });
        expect(employeeCredit.next).toHaveBeenCalledTimes(1);

        const invalidCash = runValidator({ ...basePayload, payment_method: 'cash', amount: 150 });
        expect(invalidCash.next).not.toHaveBeenCalled();
        expect(invalidCash.res.status).toHaveBeenCalledWith(422);
    });

    it.each([
        ['cash', { cash_received: 200 }, { payment_provider: null, cash_received: 200, change_amount: 50 }],
        ['gcash', { amount: 150, manual_payment_received: true }, { payment_provider: 'merchant_owned', cash_received: null, change_amount: null }],
        ['maya', { amount: 150, manual_payment_received: true }, { payment_provider: 'merchant_owned', cash_received: null, change_amount: null }],
        ['card', { amount: 150, manual_payment_received: true }, { payment_provider: 'merchant_owned', cash_received: null, change_amount: null }],
        ['bank_transfer', { amount: 150, manual_payment_received: true }, { payment_provider: 'merchant_owned', cash_received: null, change_amount: null }]
    ])('records %s independently of the Dine-In order method', async (paymentMethod, paymentFields, expectedFields) => {
        const repository = buildRepository();
        const useCase = buildCollectDineInPaymentUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: { ...basePayload, ...paymentFields, payment_method: paymentMethod, idempotency_key: `dine-in-${paymentMethod}-001` },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(repository.order).toMatchObject({
            order_method: 'dine_in',
            payment_type: paymentMethod,
            payment_status: 'paid',
            amount_paid: 150,
            balance_due: 0,
            payment_collected_by: 12,
            payment_collected_shift_id: 9,
            payment_collected_terminal_id: 'COUNTER-01',
            cashier_id: 12,
            shift_id: 9,
            ...expectedFields
        });
        expect(repository.order.payment_breakdown).toEqual([
            { payment_type: paymentMethod, count: 1, amount: 150 }
        ]);
        expect(repository.audit[0].changes).toMatchObject({
            event: 'dine_in_payment_collected',
            payment_method: paymentMethod,
            amount: 150
        });
    });

    it('requires exact non-cash payment, explicit confirmation, and replays idempotently', async () => {
        const repository = buildRepository();
        const useCase = buildCollectDineInPaymentUseCase({ posRepository: repository });

        const missingConfirmation = await run(() => useCase({
            posTransactionId: 44,
            payload: { ...basePayload, payment_method: 'gcash', amount: 150, idempotency_key: 'dine-in-gcash-no-confirm' },
            user: { user_id: 12 }
        }));
        expect(missingConfirmation.success).toBe(false);
        expect(missingConfirmation.error.message).toMatch(/explicit confirmation/i);

        const wrongAmount = await run(() => useCase({
            posTransactionId: 44,
            payload: { ...basePayload, payment_method: 'gcash', amount: 149, manual_payment_received: true, idempotency_key: 'dine-in-gcash-wrong-amount' },
            user: { user_id: 12 }
        }));
        expect(wrongAmount.success).toBe(false);
        expect(wrongAmount.error.message).toMatch(/exact order total/i);
        expect(repository.order.payment_status).toBe('unpaid');

        const payload = { ...basePayload, payment_method: 'gcash', amount: 150, manual_payment_received: true, idempotency_key: 'dine-in-gcash-replay' };
        const first = await run(() => useCase({ posTransactionId: 44, payload, user: { user_id: 12 } }));
        const replay = await run(() => useCase({ posTransactionId: 44, payload, user: { user_id: 12 } }));

        expect(first.success).toBe(true);
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(repository.audit).toHaveLength(1);
    });

    it('settles Employee Credit through the existing employee-credit service', async () => {
        const repository = buildRepository();
        const employeeCreditService = {
            prepareDebit: jest.fn(async () => ({
                accountId: 2,
                userId: 12,
                employeeId: 77,
                employeeName: 'Test Employee',
                maskedAccountCode: 'EMP-****',
                amount: 150,
                outstandingAfter: 350,
                authorizationReference: 'EC-001'
            })),
            finalizeDebit: jest.fn(async () => undefined)
        };
        const useCase = buildCollectDineInPaymentUseCase({ posRepository: repository, employeeCreditService });

        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: {
                ...basePayload,
                payment_method: 'employee_credit',
                amount: 150,
                manual_payment_received: true,
                employee_credit: { account_code: 'EMP-0001' }
            },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(true);
        expect(employeeCreditService.prepareDebit).toHaveBeenCalledWith(expect.objectContaining({ accountCode: 'EMP-0001', amount: 150 }));
        expect(employeeCreditService.finalizeDebit).toHaveBeenCalledWith(expect.objectContaining({ posTransactionId: 44, idempotencyKey: basePayload.idempotency_key }));
        expect(repository.order).toMatchObject({
            payment_type: 'employee_credit',
            employee_credit_account_id: 2,
            employee_credit_employee_id: 77,
            employee_credit_amount: 150,
            employee_credit_authorization_reference: 'EC-001'
        });
    });

    it.each([
        [{ order_method: 'pickup' }, /only for dine-in/i],
        [{ payment_timing: 'upfront' }, /payment timing must be on_dine_in/i],
        [{ payment_status: 'paid' }, /already been paid/i],
        [{ fulfillment_status: 'preparing' }, /only when the dine-in order is ready/i]
    ])('rejects an ineligible order state %# without changing it', async (seed, expectedMessage) => {
        const repository = buildRepository(seed);
        const useCase = buildCollectDineInPaymentUseCase({ posRepository: repository });
        const result = await run(() => useCase({
            posTransactionId: 44,
            payload: { ...basePayload, payment_method: 'gcash', amount: 150, manual_payment_received: true, idempotency_key: `dine-in-invalid-${Math.random()}` },
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(expectedMessage);
        expect(repository.order.payment_status).toBe(seed.payment_status || 'unpaid');
        expect(repository.audit).toHaveLength(0);
    });
});
