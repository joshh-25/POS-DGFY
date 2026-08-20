import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';

const mockAssertComplianceOperationAllowed = jest.fn(async () => ({
    success: true,
    data: { decision: { allowed: true, operation: 'pos.terminal.operation' } }
}));

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    assertComplianceOperationAllowed: mockAssertComplianceOperationAllowed,
    COMPLIANCE_OPERATION: { POS_TERMINAL_OPERATION: 'pos.terminal.operation' }
}));

let buildCashRefundPosTransactionUseCase;

beforeAll(async () => {
    ({ buildCashRefundPosTransactionUseCase } = await import('../src/modules/pos/usecases/cashRefundUseCases.js'));
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const createTransaction = () => {
    const transaction = {
        finished: false,
        LOCK: { UPDATE: 'UPDATE' },
        commit: jest.fn(async () => { transaction.finished = true; }),
        rollback: jest.fn(async () => { transaction.finished = true; })
    };
    return transaction;
};

const buildFixture = ({ transactionOverrides = {}, shiftOverrides = {}, failAdjustment = false } = {}) => {
    const state = {
        transaction: {
            pos_transaction_id: 168,
            invoice_number: 'NFS-000098',
            status: 'voided',
            payment_status: 'paid',
            payment_type: 'cash',
            payment_breakdown: [],
            total_amount: 150,
            cashier_id: 77,
            shift_id: 101,
            terminal_id: 'COUNTER-01',
            location_id: 7,
            ...transactionOverrides
        },
        shift: {
            pos_terminal_shift_id: 107,
            status: 'open',
            cashier_id: 99,
            terminal_id: 'COUNTER-01',
            location_id: 7,
            ...shiftOverrides
        },
        adjustments: [],
        events: [],
        auditLogs: []
    };
    const sequelize = {
        transaction: jest.fn(async () => createTransaction())
    };
    const posRepository = {
        async getTransactionById() {
            return clone(state.transaction);
        },
        async getTerminalShiftById() {
            return clone(state.shift);
        },
        async findPosTransactionAdjustmentByIdempotencyKey(transactionId, idempotencyKey) {
            return clone(state.adjustments.find((entry) => (
                Number(entry.pos_transaction_id) === Number(transactionId)
                && entry.idempotency_key === idempotencyKey
            )) || null);
        },
        async listPosTransactionAdjustmentsForTransaction(transactionId) {
            return clone(state.adjustments.filter((entry) => Number(entry.pos_transaction_id) === Number(transactionId)));
        },
        async createCashDrawerEvent(payload) {
            const event = {
                pos_cash_drawer_event_id: state.events.length + 1,
                ...clone(payload)
            };
            state.events.push(event);
            return clone(event);
        },
        async createPosTransactionAdjustment(payload) {
            if (failAdjustment) throw new Error('adjustment insert failed');
            const adjustment = {
                pos_transaction_adjustment_id: state.adjustments.length + 1,
                ...clone(payload)
            };
            state.adjustments.push(adjustment);
            return clone(adjustment);
        },
        async updateTransactionLifecycle(transactionId, payload) {
            if (Number(transactionId) !== Number(state.transaction.pos_transaction_id)) return null;
            state.transaction = { ...state.transaction, ...clone(payload) };
            return clone(state.transaction);
        },
        async createAuditLog(payload) {
            state.auditLogs.push(clone(payload));
            return clone(payload);
        },
        async getCashDrawerEventById(eventId) {
            return clone(state.events.find((entry) => Number(entry.pos_cash_drawer_event_id) === Number(eventId)) || null);
        }
    };

    return { state, sequelize, posRepository };
};

const runInTenantContext = (sequelize, callback) => dbStore.run({
    tenantId: 'tenant-masu',
    tenantComplianceModeState: 'compliant_pending',
    tenantComplianceModeChoiceRequired: false,
    tenantComplianceProfile: { bir: {}, npc: {} },
    tenantCompliancePolicyVersion: '2026.04.09',
    sequelize
}, callback);

describe('POS walk-in cash refund use case', () => {
    beforeEach(() => {
        mockAssertComplianceOperationAllowed.mockClear();
    });

    it('records one cash_out event, linked adjustment, refunded status, and audit evidence', async () => {
        const fixture = buildFixture();
        const useCase = buildCashRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 168,
            payload: {
                shift_id: 107,
                terminal_id: 'COUNTER-01',
                terminal_location_id: 7,
                reason: 'Customer returned paid item',
                idempotency_key: 'cash-refund-168'
            },
            user: { user_id: 99 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.transaction.payment_status).toBe('refunded');
        expect(result.data.cash_drawer_event).toEqual(expect.objectContaining({
            event_type: 'cash_out',
            amount: 150,
            pos_terminal_shift_id: 107,
            recorded_by: 99
        }));
        expect(result.data.adjustment).toEqual(expect.objectContaining({
            adjustment_type: 'cash_refund',
            status: 'succeeded',
            cash_drawer_event_id: 1,
            actor_shift_id: 107
        }));
        expect(fixture.state.transaction.shift_id).toBe(101);
        expect(fixture.state.shift.pos_terminal_shift_id).toBe(107);
        expect(fixture.state.auditLogs[0]).toEqual(expect.objectContaining({
            event_type: 'pos_cash_refund_completed',
            shift_id: 107
        }));
        expect(mockAssertComplianceOperationAllowed).toHaveBeenCalledTimes(1);
    });

    it('replays the same idempotency key without creating a second cash_out event', async () => {
        const fixture = buildFixture();
        const useCase = buildCashRefundPosTransactionUseCase({ posRepository: fixture.posRepository });
        const request = {
            posTransactionId: 168,
            payload: {
                shift_id: 107,
                terminal_id: 'COUNTER-01',
                terminal_location_id: 7,
                reason: 'Customer returned paid item',
                idempotency_key: 'cash-refund-168'
            },
            user: { user_id: 99 }
        };

        const first = await runInTenantContext(fixture.sequelize, () => useCase(request));
        const second = await runInTenantContext(fixture.sequelize, () => useCase(request));

        expect(first.success).toBe(true);
        expect(second.success).toBe(true);
        expect(second.data.idempotent_replay).toBe(true);
        expect(fixture.state.events).toHaveLength(1);
        expect(fixture.state.adjustments).toHaveLength(1);
    });

    it('rejects non-cash or split tender without drawer or adjustment writes', async () => {
        const fixture = buildFixture({
            transactionOverrides: {
                payment_type: 'card',
                payment_breakdown: [{ payment_type: 'card', amount: 150 }]
            }
        });
        const useCase = buildCashRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 168,
            payload: {
                shift_id: 107,
                reason: 'Card payment needs review',
                idempotency_key: 'cash-refund-card'
            },
            user: { user_id: 99 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(fixture.state.events).toHaveLength(0);
        expect(fixture.state.adjustments).toHaveLength(0);
    });

    it('ignores zero-value checkout payment template rows for a single-tender cash refund', async () => {
        const fixture = buildFixture({
            transactionOverrides: {
                payment_breakdown: [
                    { payment_type: 'cash', count: 1, amount: 150 },
                    { payment_type: 'gcash', count: 0, amount: 0 },
                    { payment_type: 'maya', count: 0, amount: 0 },
                    { payment_type: 'card', count: 0, amount: 0 }
                ]
            }
        });
        const useCase = buildCashRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 168,
            payload: {
                idempotency_key: 'refund-zero-template-rows',
                shift_id: 107,
                terminal_id: 'COUNTER-01',
                reason: 'Customer cash refund'
            },
            user: { user_id: 99 }
        }));

        expect(result.success).toBe(true);
        expect(fixture.state.events).toHaveLength(1);
        expect(fixture.state.adjustments).toHaveLength(1);
    });

    it('does not create a refund for an unpaid void', async () => {
        const fixture = buildFixture({
            transactionOverrides: {
                payment_status: 'unpaid'
            }
        });
        const useCase = buildCashRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 168,
            payload: {
                shift_id: 107,
                reason: 'Unpaid sale was voided',
                idempotency_key: 'cash-refund-unpaid'
            },
            user: { user_id: 99 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(fixture.state.events).toHaveLength(0);
        expect(fixture.state.adjustments).toHaveLength(0);
    });

    it('rejects a closed or foreign refund shift before any cash movement', async () => {
        const closedFixture = buildFixture({ shiftOverrides: { status: 'closed' } });
        const closedUseCase = buildCashRefundPosTransactionUseCase({ posRepository: closedFixture.posRepository });
        const closedResult = await runInTenantContext(closedFixture.sequelize, () => closedUseCase({
            posTransactionId: 168,
            payload: {
                shift_id: 107,
                reason: 'Customer returned paid item',
                idempotency_key: 'cash-refund-closed'
            },
            user: { user_id: 99 }
        }));

        expect(closedResult.success).toBe(false);
        expect(closedResult.error.code).toBe('VALIDATION_FAILED');
        expect(closedFixture.state.events).toHaveLength(0);

        const foreignFixture = buildFixture({ shiftOverrides: { cashier_id: 88 } });
        const foreignUseCase = buildCashRefundPosTransactionUseCase({ posRepository: foreignFixture.posRepository });
        const foreignResult = await runInTenantContext(foreignFixture.sequelize, () => foreignUseCase({
            posTransactionId: 168,
            payload: {
                shift_id: 107,
                reason: 'Customer returned paid item',
                idempotency_key: 'cash-refund-foreign'
            },
            user: { user_id: 99 }
        }));

        expect(foreignResult.success).toBe(false);
        expect(foreignResult.error.code).toBe('AUTHORIZATION_FAILED');
        expect(foreignFixture.state.events).toHaveLength(0);
    });

    it('rejects a second refund request with a different idempotency key', async () => {
        const fixture = buildFixture();
        const useCase = buildCashRefundPosTransactionUseCase({ posRepository: fixture.posRepository });
        const request = {
            posTransactionId: 168,
            payload: {
                shift_id: 107,
                reason: 'Customer returned paid item',
                idempotency_key: 'cash-refund-first'
            },
            user: { user_id: 99 }
        };

        const first = await runInTenantContext(fixture.sequelize, () => useCase(request));
        const second = await runInTenantContext(fixture.sequelize, () => useCase({
            ...request,
            payload: { ...request.payload, idempotency_key: 'cash-refund-second' }
        }));

        expect(first.success).toBe(true);
        expect(second.success).toBe(false);
        expect(second.error.code).toBe('CONFLICT');
        expect(fixture.state.events).toHaveLength(1);
        expect(fixture.state.adjustments).toHaveLength(1);
    });

    it('rolls back when adjustment evidence cannot be written', async () => {
        const fixture = buildFixture({ failAdjustment: true });
        const useCase = buildCashRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 168,
            payload: {
                shift_id: 107,
                reason: 'Customer returned paid item',
                idempotency_key: 'cash-refund-fail'
            },
            user: { user_id: 99 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(fixture.state.events).toHaveLength(1);
        expect(fixture.sequelize.transaction).toHaveBeenCalled();
    });
});
