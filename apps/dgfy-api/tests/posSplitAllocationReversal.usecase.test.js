import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';

const mockAssertComplianceOperationAllowed = jest.fn(async () => ({
    success: true,
    data: { decision: { allowed: true, operation: 'pos.terminal.operation' } }
}));

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
    assertComplianceOperationAllowed: mockAssertComplianceOperationAllowed,
    COMPLIANCE_OPERATION: { POS_TERMINAL_OPERATION: 'pos.terminal.operation' }
}));

let buildSplitAllocationReversalUseCase;

beforeAll(async () => {
    ({ buildSplitAllocationReversalUseCase } = await import('../src/modules/pos/usecases/splitAllocationReversalUseCases.js'));
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

const buildFixture = ({ providerReconciler, transactionOverrides = {}, allocations = null, shiftOverrides = {} } = {}) => {
    const state = {
        transaction: {
            pos_transaction_id: 220,
            invoice_number: 'NFS-000220',
            status: 'voided',
            payment_status: 'paid',
            payment_type: 'cash',
            payment_provider: 'split',
            payment_breakdown: [
                { payment_type: 'cash', amount: 100 },
                { payment_type: 'gcash', amount: 50 },
                { payment_type: 'card', amount: 75 }
            ],
            total_amount: 225,
            cashier_id: 77,
            shift_id: 101,
            terminal_id: 'COUNTER-01',
            location_id: 7,
            ...transactionOverrides
        },
        session: {
            pos_payment_session_id: 42,
            session_reference: 'PAY-SPLIT-220',
            status: 'completed',
            completed_transaction_id: 220,
            cashier_id: 77,
            shift_id: 101,
            terminal_id: 'COUNTER-01',
            location_id: 7
        },
        allocations: allocations || [
            {
                pos_payment_allocation_id: 1,
                allocation_reference: 'ALLOC-CASH-220',
                session_id: 42,
                status: 'successful',
                payment_method: 'cash',
                payment_provider: null,
                applied_amount: 100,
                reversed_amount: 0,
                reversal_status: 'none'
            },
            {
                pos_payment_allocation_id: 2,
                allocation_reference: 'ALLOC-GCASH-220',
                session_id: 42,
                status: 'successful',
                payment_method: 'gcash',
                payment_provider: 'merchant_owned',
                applied_amount: 50,
                reversed_amount: 0,
                reversal_status: 'none'
            },
            {
                pos_payment_allocation_id: 3,
                allocation_reference: 'ALLOC-CARD-220',
                session_id: 42,
                status: 'successful',
                payment_method: 'card',
                payment_provider: 'paymongo',
                payment_reference: 'pay_split_220_card',
                applied_amount: 75,
                reversed_amount: 0,
                reversal_status: 'none'
            }
        ],
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
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    const posRepository = {
        async getTransactionById() { return clone(state.transaction); },
        async findPosPaymentSessionByCompletedTransactionId() { return clone(state.session); },
        async listPosPaymentAllocationsForSession() { return clone(state.allocations); },
        async getTerminalShiftById() { return clone(state.shift); },
        async listPosTransactionAdjustmentsForTransaction() { return clone(state.adjustments); },
        async findPosTransactionAdjustmentByIdempotencyKey(transactionId, idempotencyKey) {
            return clone(state.adjustments.find((row) => (
                Number(row.pos_transaction_id) === Number(transactionId)
                && row.idempotency_key === idempotencyKey
            )) || null);
        },
        async findPosTransactionAdjustmentByProviderEventId(providerEventId) {
            return clone(state.adjustments.find((row) => row.provider_event_id === providerEventId) || null);
        },
        async createCashDrawerEvent(payload) {
            const event = { pos_cash_drawer_event_id: state.events.length + 1, ...clone(payload) };
            state.events.push(event);
            return clone(event);
        },
        async createPosTransactionAdjustment(payload) {
            const adjustment = {
                pos_transaction_adjustment_id: state.adjustments.length + 1,
                ...clone(payload)
            };
            state.adjustments.push(adjustment);
            return clone(adjustment);
        },
        async updatePosPaymentAllocation(allocationId, payload) {
            const index = state.allocations.findIndex((row) => Number(row.pos_payment_allocation_id) === Number(allocationId));
            if (index < 0) return null;
            state.allocations[index] = { ...state.allocations[index], ...clone(payload) };
            return clone(state.allocations[index]);
        },
        async updateTransactionLifecycle(transactionId, payload) {
            if (Number(transactionId) !== Number(state.transaction.pos_transaction_id)) return null;
            state.transaction = { ...state.transaction, ...clone(payload) };
            return clone(state.transaction);
        },
        async createAuditLog(payload) {
            state.auditLogs.push(clone(payload));
            return clone(payload);
        }
    };
    return { state, sequelize, posRepository, providerReconciler };
};

const runInTenantContext = (sequelize, callback) => dbStore.run({
    tenantId: 'tenant-masu',
    tenantComplianceModeState: 'compliant_pending',
    tenantComplianceModeChoiceRequired: false,
    tenantComplianceProfile: { bir: {}, npc: {} },
    tenantCompliancePolicyVersion: '2026.04.09',
    sequelize
}, callback);

const adminRequest = (overrides = {}) => ({
    posTransactionId: 220,
    allocationId: 2,
    payload: {
        shift_id: 107,
        terminal_id: 'COUNTER-01',
        terminal_location_id: 7,
        reason: 'Customer reversal recorded at store QR',
        external_reference: 'STORE-GCASH-REV-220',
        idempotency_key: 'split-ext-220-a',
        ...overrides
    },
    user: { user_id: 99, role: 'admin' }
});

describe('POS split allocation reversal use case', () => {
    beforeEach(() => mockAssertComplianceOperationAllowed.mockClear());

    it('creates one linked cash-out for the cash allocation and keeps the transaction partial until other legs are resolved', async () => {
        const fixture = buildFixture();
        const useCase = buildSplitAllocationReversalUseCase({ posRepository: fixture.posRepository });
        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 220,
            allocationId: 1,
            payload: {
                shift_id: 107,
                terminal_id: 'COUNTER-01',
                terminal_location_id: 7,
                reason: 'Cash returned to customer',
                idempotency_key: 'split-cash-220-a'
            },
            user: { user_id: 99, role: 'cashier' }
        }));

        expect(result.success).toBe(true);
        expect(result.data.transaction.payment_status).toBe('partial_refunded');
        expect(result.data.allocation).toEqual(expect.objectContaining({ reversal_status: 'completed', reversed_amount: 100 }));
        expect(result.data.adjustment).toEqual(expect.objectContaining({
            adjustment_type: 'cash_refund',
            pos_payment_allocation_id: 1,
            status: 'succeeded',
            cash_drawer_event_id: 1
        }));
        expect(fixture.state.events).toHaveLength(1);
        expect(mockAssertComplianceOperationAllowed).toHaveBeenCalledTimes(1);
    });

    it('records merchant-owned evidence first and appends a separate confirmed row for the same allocation', async () => {
        const fixture = buildFixture();
        const useCase = buildSplitAllocationReversalUseCase({ posRepository: fixture.posRepository });
        const pending = await runInTenantContext(fixture.sequelize, () => useCase(adminRequest()));
        const confirmed = await runInTenantContext(fixture.sequelize, () => useCase(adminRequest({
            idempotency_key: 'split-ext-220-b',
            completion_confirmed: true
        })));

        expect(pending.success).toBe(true);
        expect(pending.data.financial_outcome.refund_state).toBe('manual_review_required');
        expect(pending.data.transaction.payment_status).toBe('refund_pending');
        expect(confirmed.success).toBe(true);
        expect(confirmed.data.financial_outcome.refund_state).toBe('completed');
        expect(confirmed.data.allocation.reversal_status).toBe('completed');
        expect(confirmed.data.transaction.payment_status).toBe('partial_refunded');
        expect(fixture.state.adjustments).toHaveLength(2);
        expect(fixture.state.adjustments[1].metadata.confirms_adjustment_id).toBe(1);
    });

    it('reconciles provider refund evidence for one allocation and reaches refunded only after every leg is terminal', async () => {
        const fixture = buildFixture({
            providerReconciler: jest.fn(async () => ({
                reconciled: true,
                action: 'reverse',
                provider_event_id: 'paymongo:payment:pay_split_220_card:paid',
                provider_refund_ids: ['re_220_card'],
                provider_refund_event_id: 'paymongo:refund:re_220_card:succeeded',
                provider_refund_status: 'succeeded'
            }))
        });
        const useCase = buildSplitAllocationReversalUseCase({
            posRepository: fixture.posRepository,
            providerReconciler: fixture.providerReconciler
        });
        const cash = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 220,
            allocationId: 1,
            payload: { shift_id: 107, terminal_id: 'COUNTER-01', reason: 'Cash refund', idempotency_key: 'split-all-cash' },
            user: { user_id: 99, role: 'cashier' }
        }));
        const merchant = await runInTenantContext(fixture.sequelize, () => useCase(adminRequest({ idempotency_key: 'split-all-ext' })));
        const merchantConfirmed = await runInTenantContext(fixture.sequelize, () => useCase(adminRequest({
            idempotency_key: 'split-all-ext-confirm',
            completion_confirmed: true
        })));
        const provider = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 220,
            allocationId: 3,
            payload: {
                shift_id: 107,
                terminal_id: 'COUNTER-01',
                terminal_location_id: 7,
                reason: 'Provider refund confirmed',
                idempotency_key: 'split-all-provider'
            },
            user: { user_id: 99, role: 'admin' }
        }));

        expect(cash.success).toBe(true);
        expect(merchant.success).toBe(true);
        expect(merchantConfirmed.success).toBe(true);
        expect(provider.success).toBe(true);
        expect(provider.data.transaction.payment_status).toBe('refunded');
        expect(provider.data.adjustment).toEqual(expect.objectContaining({
            adjustment_type: 'provider_refund',
            provider_reference: 're_220_card',
            provider_event_id: 'paymongo:refund:re_220_card:succeeded'
        }));
        expect(fixture.providerReconciler).toHaveBeenCalledTimes(1);
    });

    it('does not create another reversal when the allocation amount is exhausted', async () => {
        const fixture = buildFixture();
        const useCase = buildSplitAllocationReversalUseCase({ posRepository: fixture.posRepository });
        const first = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 220,
            allocationId: 1,
            payload: { shift_id: 107, reason: 'Cash refund', idempotency_key: 'split-limit-first' },
            user: { user_id: 99, role: 'cashier' }
        }));
        const second = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 220,
            allocationId: 1,
            payload: { shift_id: 107, amount: 1, reason: 'Duplicate cash refund', idempotency_key: 'split-limit-second' },
            user: { user_id: 99, role: 'cashier' }
        }));

        expect(first.success).toBe(true);
        expect(second.success).toBe(false);
        expect(second.error.code).toBe('VALIDATION_FAILED');
        expect(fixture.state.events).toHaveLength(1);
        expect(fixture.state.adjustments).toHaveLength(1);
    });

    it('rejects provider partial evidence without recording a false completed refund', async () => {
        const providerReconciler = jest.fn(async () => ({
            reconciled: false,
            reason_code: 'PAYMENT_PROVIDER_PARTIAL_REFUND_REQUIRES_REVIEW',
            reason: 'PayMongo reported a partial refund.'
        }));
        const fixture = buildFixture({ providerReconciler });
        const useCase = buildSplitAllocationReversalUseCase({ posRepository: fixture.posRepository, providerReconciler });
        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 220,
            allocationId: 3,
            payload: {
                shift_id: 107,
                terminal_id: 'COUNTER-01',
                terminal_location_id: 7,
                reason: 'Provider partial refund review',
                idempotency_key: 'split-provider-partial'
            },
            user: { user_id: 99, role: 'admin' }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(fixture.state.adjustments).toHaveLength(0);
        expect(fixture.state.transaction.payment_status).toBe('paid');
    });

    it('requires an owned open shift before moving cash even for an administrator', async () => {
        const fixture = buildFixture();
        const useCase = buildSplitAllocationReversalUseCase({ posRepository: fixture.posRepository });
        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            posTransactionId: 220,
            allocationId: 1,
            payload: { reason: 'Cash refund without shift', idempotency_key: 'split-cash-no-shift' },
            user: { user_id: 1, role: 'admin' }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(fixture.state.events).toHaveLength(0);
        expect(fixture.state.adjustments).toHaveLength(0);
    });

    it('requires an owned open shift for non-cash allocation reversals even for an administrator', async () => {
        const fixture = buildFixture();
        const useCase = buildSplitAllocationReversalUseCase({ posRepository: fixture.posRepository });
        const result = await runInTenantContext(fixture.sequelize, () => useCase(adminRequest({
            shift_id: null,
            terminal_id: 'COUNTER-01',
            terminal_location_id: 7,
            idempotency_key: 'split-ext-admin-no-shift'
        })));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_SHIFT_REQUIRED'
        }));
        expect(fixture.state.adjustments).toHaveLength(0);
    });
});
