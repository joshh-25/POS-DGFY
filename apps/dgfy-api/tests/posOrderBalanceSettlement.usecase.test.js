import { describe, expect, it } from '@jest/globals';
import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildRecordOrderBalancePaymentUseCase } from '../src/modules/pos/usecases/posUseCases.js';

// Phase 148 (#825). Before this, a downpayment order (partially_paid, nonzero balance_due) had no
// way to reach `paid` at all: collect-cash requires payment_status === 'unpaid' and
// cash_received >= total_amount, and both guards are correct for the plain-COD path they protect.
// This suite pins the second, disjoint path -- and specifically that the guards ADR 0063 clause 6
// and ADR 0069 clause 2 require actually fail closed rather than merely existing.

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
        payment_type: 'cash',
        payment_timing: 'on_delivery',
        payment_status: 'partially_paid',
        fulfillment_status: 'out_for_delivery',
        total_amount: 1000,
        amount_paid: 200,
        balance_due: 800,
        location_id: 7,
        ...seed
    };
    const replays = new Map();
    const audit = [];
    const ledger = [];
    return {
        order,
        audit,
        ledger,
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
        async createAuditLog(payload) { audit.push(payload); return payload; },
        async findOrderPaymentEntryByKind(_id, kind) {
            return kind === 'downpayment' ? { pos_order_payment_id: 501, kind: 'downpayment' } : null;
        },
        async createOrderPaymentEntry(payload) {
            ledger.push(payload);
            return 600 + ledger.length;
        }
    };
};

const run = (callback) => {
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    return dbStore.run({ tenantId: 'balance-settlement-test', sequelize }, callback);
};

const cashPayload = (overrides = {}) => ({
    terminal_id: 'COUNTER-01',
    payment_method: 'cash',
    cash_received: 1000,
    idempotency_key: 'balance-cash-001',
    ...overrides
});

describe('POS downpayment balance settlement', () => {
    it('settles a cash balance, computes change off balance_due, and replays safely', async () => {
        const repository = buildRepository();
        const useCase = buildRecordOrderBalancePaymentUseCase({ posRepository: repository });

        const first = await run(() => useCase({ posTransactionId: 77, payload: cashPayload(), user: { user_id: 12 } }));

        expect(first.success).toBe(true);
        expect(repository.order).toMatchObject({
            payment_status: 'paid',
            amount_paid: 1000,
            balance_due: 0,
            cash_received: 1000,
            // 1000 tendered against an 800 BALANCE (not the 1000 order total) leaves 200 change.
            // Computing this off total_amount -- collect-cash's basis -- would produce 0 and
            // silently short the customer.
            change_amount: 200,
            payment_collected_by: 12,
            payment_collected_shift_id: 9,
            payment_collected_terminal_id: 'COUNTER-01'
        });
        expect(repository.ledger).toHaveLength(1);
        expect(repository.audit).toHaveLength(1);

        const replay = await run(() => useCase({ posTransactionId: 77, payload: cashPayload(), user: { user_id: 12 } }));

        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        // #825's own verification line: "balance recording idempotent under duplicate submit".
        // Exactly one ledger row and one audit row, not two.
        expect(repository.ledger).toHaveLength(1);
        expect(repository.audit).toHaveLength(1);
    });

    it('records the balance settled, never the cash tendered, on the ledger row', async () => {
        const repository = buildRepository();
        const useCase = buildRecordOrderBalancePaymentUseCase({ posRepository: repository });

        await run(() => useCase({ posTransactionId: 77, payload: cashPayload(), user: { user_id: 12 } }));

        expect(repository.ledger[0]).toMatchObject({
            kind: 'balance',
            status: 'successful',
            // 800, not the 1000 handed over -- change is not revenue.
            amount: 800,
            paymentMethod: 'cash',
            paymentProvider: null,
            providerEventId: null,
            recordedBy: 12,
            // ADR 0069 clause 4b: the balance row links back to the downpayment row it completes.
            relatedPosOrderPaymentId: 501
        });
    });

    it.each(['gcash', 'maya', 'card', 'bank_transfer'])(
        'settles an attested merchant-owned %s balance for the exact amount',
        async (method) => {
            const repository = buildRepository();
            const useCase = buildRecordOrderBalancePaymentUseCase({ posRepository: repository });

            const result = await run(() => useCase({
                posTransactionId: 77,
                payload: {
                    terminal_id: 'COUNTER-01',
                    payment_method: method,
                    amount: 800,
                    manual_payment_received: true,
                    payment_reference: 'REF-123',
                    idempotency_key: `balance-${method}-001`
                },
                user: { user_id: 12 }
            }));

            expect(result.success).toBe(true);
            expect(repository.order.payment_status).toBe('paid');
            expect(repository.order.balance_due).toBe(0);
            // ADR 0063 clause 5 [binding]: a merchant-owned settlement must never claim cash
            // changed hands. These stay untouched rather than being backfilled to look like cash.
            expect(repository.order.cash_received).toBeUndefined();
            expect(repository.order.change_amount).toBeUndefined();
            expect(repository.ledger[0]).toMatchObject({
                kind: 'balance',
                paymentMethod: method,
                // ADR 0063 clause 4 [binding] -- and clause 12: never a PayMongo-owned flow.
                paymentProvider: 'merchant_owned',
                providerEventId: null,
                paymentReference: 'REF-123'
            });
            expect(repository.ledger[0].paymentProvider).not.toBe('paymongo');
        }
    );

    it('fails closed when a merchant-owned method arrives without an explicit confirmation', async () => {
        const repository = buildRepository();
        const useCase = buildRecordOrderBalancePaymentUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 77,
            payload: {
                terminal_id: 'COUNTER-01',
                payment_method: 'gcash',
                amount: 800,
                idempotency_key: 'balance-gcash-unconfirmed'
            },
            user: { user_id: 12 }
        }));

        // ADR 0063 clause 6 [binding]: selecting a digital method alone is insufficient, and a
        // missing confirmation fails closed. The validator also blocks this; the use case must not
        // rely on the validator being the only gate.
        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('BALANCE_SETTLEMENT_CONFIRMATION_REQUIRED');
        expect(repository.order.payment_status).toBe('partially_paid');
        expect(repository.ledger).toHaveLength(0);
    });

    it('rejects a merchant-owned settlement that is not the exact remaining balance', async () => {
        const repository = buildRepository();
        const useCase = buildRecordOrderBalancePaymentUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 77,
            payload: {
                terminal_id: 'COUNTER-01',
                payment_method: 'gcash',
                amount: 500,
                manual_payment_received: true,
                idempotency_key: 'balance-gcash-partial'
            },
            user: { user_id: 12 }
        }));

        // v1 settles the full remaining balance in one action (#825); no change is possible on a
        // digital tender, so a mismatch is a stale client, not a partial payment.
        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('BALANCE_SETTLEMENT_AMOUNT_MISMATCH');
        expect(repository.order.payment_status).toBe('partially_paid');
    });

    it.each([
        // The disjoint-domain guard: `unpaid` belongs to collect-cash and must not be absorbed here.
        [{ payment_status: 'unpaid', amount_paid: 0, balance_due: 0 }, 'BALANCE_SETTLEMENT_NOT_PARTIALLY_PAID'],
        [{ payment_status: 'paid', balance_due: 0 }, 'BALANCE_SETTLEMENT_NOT_PARTIALLY_PAID'],
        [{ fulfillment_status: 'preparing' }, 'BALANCE_SETTLEMENT_FULFILLMENT_NOT_READY'],
        [{ balance_due: 0 }, 'BALANCE_SETTLEMENT_NO_BALANCE_DUE']
    ])('rejects an ineligible order state %#', async (seed, expectedReasonCode) => {
        const repository = buildRepository(seed);
        const useCase = buildRecordOrderBalancePaymentUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 77,
            payload: cashPayload({ idempotency_key: `balance-invalid-${expectedReasonCode}-${seed.fulfillment_status || seed.payment_status || 'x'}` }),
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe(expectedReasonCode);
        expect(repository.ledger).toHaveLength(0);
        expect(repository.audit).toHaveLength(0);
    });

    it('rejects an unsupported settlement method', async () => {
        const repository = buildRepository();
        const useCase = buildRecordOrderBalancePaymentUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 77,
            payload: cashPayload({ payment_method: 'qrph', idempotency_key: 'balance-qrph' }),
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('BALANCE_SETTLEMENT_METHOD_UNSUPPORTED');
    });

    it('rejects cash that does not cover the remaining balance', async () => {
        const repository = buildRepository();
        const useCase = buildRecordOrderBalancePaymentUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 77,
            payload: cashPayload({ cash_received: 799, idempotency_key: 'balance-cash-short' }),
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('BALANCE_SETTLEMENT_CASH_SHORT');
        expect(repository.order.payment_status).toBe('partially_paid');
        expect(repository.ledger).toHaveLength(0);
    });

    it('rejects settlement when the cashier has no open shift', async () => {
        const repository = buildRepository();
        repository.findOpenTerminalShift = async () => null;
        const useCase = buildRecordOrderBalancePaymentUseCase({ posRepository: repository });

        const result = await run(() => useCase({
            posTransactionId: 77,
            payload: cashPayload({ idempotency_key: 'balance-closed-shift' }),
            user: { user_id: 12 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/shift is closed/i);
        expect(repository.order.payment_status).toBe('partially_paid');
        expect(repository.ledger).toHaveLength(0);
    });
});
