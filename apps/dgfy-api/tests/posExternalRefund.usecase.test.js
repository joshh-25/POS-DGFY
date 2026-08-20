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

let buildExternalRefundPosTransactionUseCase;

beforeAll(async () => {
    ({ buildExternalRefundPosTransactionUseCase } = await import('../src/modules/pos/usecases/externalRefundUseCases.js'));
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

const buildFixture = ({ transactionOverrides = {}, shiftOverrides = {} } = {}) => {
    const state = {
        transaction: {
            pos_transaction_id: 169,
            invoice_number: 'NFS-000099',
            status: 'voided',
            payment_status: 'paid',
            payment_type: 'gcash',
            payment_provider: 'merchant_owned',
            payment_breakdown: [{ payment_type: 'gcash', amount: 250 }],
            total_amount: 250,
            cashier_id: 77,
            shift_id: 102,
            terminal_id: 'COUNTER-01',
            location_id: 7,
            ...transactionOverrides
        },
        shift: {
            pos_terminal_shift_id: 108,
            status: 'open',
            cashier_id: 99,
            terminal_id: 'COUNTER-01',
            location_id: 7,
            ...shiftOverrides
        },
        adjustments: [],
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
        async createPosTransactionAdjustment(payload) {
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

const buildRequest = (overrides = {}) => ({
    posTransactionId: 169,
    payload: {
        shift_id: 108,
        terminal_id: 'COUNTER-01',
        terminal_location_id: 7,
        external_reference: 'STORE-GCASH-REF-169',
        reason: 'Customer reversal confirmed at store QR',
        idempotency_key: 'external-refund-169',
        completion_confirmed: false,
        ...overrides
    },
    user: { user_id: 99, role: 'cashier' }
});

describe('POS merchant-owned external reversal use case', () => {
    beforeEach(() => {
        mockAssertComplianceOperationAllowed.mockClear();
    });

    it('records pending external evidence without claiming the customer was refunded', async () => {
        const fixture = buildFixture();
        const useCase = buildExternalRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));

        expect(result.success).toBe(true);
        expect(result.data.transaction.payment_status).toBe('refund_pending');
        expect(result.data.adjustment).toEqual(expect.objectContaining({
            adjustment_type: 'external_refund',
            status: 'manual_review_required',
            external_reference: 'STORE-GCASH-REF-169',
            actor_shift_id: 108,
            provider: null
        }));
        expect(result.data.financial_outcome).toEqual(expect.objectContaining({
            refund_state: 'manual_review_required',
            refund_required: true,
            next_action: 'confirm_external_reversal'
        }));
        expect(fixture.state.auditLogs[0].event_type).toBe('pos_external_refund_pending');
        expect(mockAssertComplianceOperationAllowed).toHaveBeenCalledTimes(1);
    });

    it('does not allow a first submission to skip the pending evidence state', async () => {
        const fixture = buildFixture();
        const useCase = buildExternalRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest({
            completion_confirmed: true
        })));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(fixture.state.adjustments).toHaveLength(0);
        expect(fixture.state.transaction.payment_status).toBe('paid');
        expect(mockAssertComplianceOperationAllowed).not.toHaveBeenCalled();
    });

    it('rejects confirmation when the pending transaction state was changed out of band', async () => {
        const fixture = buildFixture();
        const useCase = buildExternalRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const pending = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));
        fixture.state.transaction.payment_status = 'paid';
        const confirmed = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest({
            idempotency_key: 'external-refund-169-state-mismatch',
            completion_confirmed: true
        })));

        expect(pending.success).toBe(true);
        expect(confirmed.success).toBe(false);
        expect(confirmed.error.code).toBe('CONFLICT');
        expect(fixture.state.adjustments).toHaveLength(1);
        expect(fixture.state.transaction.payment_status).toBe('paid');
    });

    it('appends a confirmed record and only then marks the transaction refunded', async () => {
        const fixture = buildFixture();
        const useCase = buildExternalRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const pending = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));
        const confirmed = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest({
            idempotency_key: 'external-refund-169-confirm',
            completion_confirmed: true
        })));

        expect(pending.success).toBe(true);
        expect(confirmed.success).toBe(true);
        expect(confirmed.data.transaction.payment_status).toBe('refunded');
        expect(confirmed.data.financial_outcome).toEqual(expect.objectContaining({
            refund_state: 'completed',
            refund_required: false,
            reason_code: 'MERCHANT_OWNED_EXTERNAL_REVERSAL_COMPLETED'
        }));
        expect(fixture.state.adjustments).toHaveLength(2);
        expect(fixture.state.adjustments.map((entry) => entry.status)).toEqual([
            'manual_review_required',
            'succeeded'
        ]);
        expect(fixture.state.adjustments[0].external_reference).toBe(fixture.state.adjustments[1].external_reference);
    });

    it('replays the same idempotency key without adding another reversal record', async () => {
        const fixture = buildFixture();
        const useCase = buildExternalRefundPosTransactionUseCase({ posRepository: fixture.posRepository });
        const request = buildRequest();

        const first = await runInTenantContext(fixture.sequelize, () => useCase(request));
        const replay = await runInTenantContext(fixture.sequelize, () => useCase(request));

        expect(first.success).toBe(true);
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(fixture.state.adjustments).toHaveLength(1);
    });

    it('fails closed for unclassified or split tenders and does not call a provider', async () => {
        const fixture = buildFixture({
            transactionOverrides: {
                payment_provider: null,
                payment_breakdown: [{ payment_type: 'gcash', amount: 150 }, { payment_type: 'cash', amount: 100 }]
            }
        });
        const useCase = buildExternalRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(fixture.state.adjustments).toHaveLength(0);
        expect(mockAssertComplianceOperationAllowed).not.toHaveBeenCalled();
    });

    it('requires an active shift when an administrator records external evidence', async () => {
        const fixture = buildFixture();
        const useCase = buildExternalRefundPosTransactionUseCase({ posRepository: fixture.posRepository });

        const result = await runInTenantContext(fixture.sequelize, () => useCase({
            ...buildRequest({ shift_id: null, terminal_id: 'COUNTER-01', idempotency_key: 'external-refund-admin' }),
            user: { user_id: 1, role: 'admin' }
        }));

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(fixture.state.adjustments).toHaveLength(0);

        const withShift = await runInTenantContext(fixture.sequelize, () => useCase({
            ...buildRequest({ idempotency_key: 'external-refund-admin-shift' }),
            user: { user_id: 99, role: 'admin' }
        }));

        expect(withShift.success).toBe(true);
        expect(withShift.data.adjustment.actor_shift_id).toBe(108);
        expect(withShift.data.transaction.payment_status).toBe('refund_pending');
    });
});
