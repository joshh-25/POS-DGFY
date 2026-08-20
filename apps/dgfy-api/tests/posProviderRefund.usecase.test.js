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

let buildProviderRefundPosTransactionUseCase;

beforeAll(async () => {
    ({ buildProviderRefundPosTransactionUseCase } = await import('../src/modules/pos/usecases/providerRefundUseCases.js'));
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

const buildFixture = ({ transactionOverrides = {}, sessionOverrides = {}, providerOverrides = {} } = {}) => {
    const state = {
        transaction: {
            pos_transaction_id: 169,
            invoice_number: 'NFS-000099',
            status: 'voided',
            payment_status: 'paid',
            payment_type: 'gcash',
            payment_provider: 'paymongo',
            payment_reference: 'pay_169',
            payment_session_reference: 'CPS-ONLINE-169',
            payment_breakdown: [{ payment_type: 'gcash', amount: 250 }],
            order_source: 'online_store',
            total_amount: 250,
            cashier_id: 77,
            shift_id: 102,
            terminal_id: 'COUNTER-01',
            location_id: 7,
            ...transactionOverrides
        },
        session: {
            session_id: 501,
            public_reference: 'CPS-ONLINE-169',
            tenant_id: 'tenant-masu',
            pos_transaction_id: 169,
            provider: 'paymongo',
            provider_payment_id: 'pay_169',
            status: 'finalized',
            currency: 'PHP',
            total_amount_centavos: 25000,
            checkout_payload: { payment_type: 'gcash' },
            ...sessionOverrides
        },
        shift: {
            pos_terminal_shift_id: 108,
            status: 'open',
            cashier_id: 99,
            terminal_id: 'COUNTER-01',
            location_id: 7
        },
        adjustments: [],
        auditLogs: [],
        commerceRefunds: [],
        provider: {
            payment: {
                id: 'pay_169',
                attributes: {
                    status: 'paid',
                    amount: 25000,
                    currency: 'PHP',
                    source: { type: 'gcash' },
                    refunds: []
                }
            },
            ...providerOverrides
        }
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
            const existing = state.adjustments.find((entry) => (
                Number(entry.pos_transaction_id) === Number(payload.pos_transaction_id)
                && entry.idempotency_key === payload.idempotency_key
            ));
            if (existing) return clone(existing);
            const adjustment = {
                pos_transaction_adjustment_id: state.adjustments.length + 1,
                created_at: new Date().toISOString(),
                ...clone(payload)
            };
            state.adjustments.push(adjustment);
            return clone(adjustment);
        },
        async updatePosTransactionAdjustment(adjustmentId, payload) {
            const index = state.adjustments.findIndex((entry) => Number(entry.pos_transaction_adjustment_id) === Number(adjustmentId));
            if (index < 0) return null;
            state.adjustments[index] = {
                ...state.adjustments[index],
                ...clone(payload),
                metadata: payload.metadata || state.adjustments[index].metadata
            };
            return clone(state.adjustments[index]);
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
    const commercePaymentRepository = {
        findSessionByPublicReference: jest.fn(async () => clone(state.session)),
        listRefundsBySession: jest.fn(async () => clone(state.commerceRefunds)),
        updateRefundById: jest.fn(async (refundId, payload) => {
            const index = state.commerceRefunds.findIndex((refund) => Number(refund.refund_id) === Number(refundId));
            if (index < 0) return null;
            state.commerceRefunds[index] = { ...state.commerceRefunds[index], ...clone(payload) };
            return clone(state.commerceRefunds[index]);
        })
    };
    const paymongoService = {
        getPayment: jest.fn(async () => clone(state.provider.payment))
    };

    return { state, sequelize, posRepository, commercePaymentRepository, paymongoService };
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
        reason: 'Customer reversal confirmed online',
        idempotency_key: 'provider-refund-169',
        provider_reason: 'requested_by_customer',
        ...overrides
    },
    user: { user_id: 99, role: 'cashier' }
});

const buildCommerceRefundUseCase = (status = 'succeeded') => jest.fn(async () => ({
    success: true,
    data: {
        refund: {
            refund_id: 801,
            provider_refund_id: status === 'failed' ? null : `ref_${status}`,
            status,
            amount_centavos: 25000
        }
    }
}));

describe('POS provider-owned refund use case', () => {
    beforeEach(() => {
        mockAssertComplianceOperationAllowed.mockClear();
    });

    it('verifies the server-owned online payment and records a successful provider refund', async () => {
        const fixture = buildFixture();
        const createCommerceRefund = buildCommerceRefundUseCase('succeeded');
        const useCase = buildProviderRefundPosTransactionUseCase({
            posRepository: fixture.posRepository,
            commercePaymentRepository: fixture.commercePaymentRepository,
            createCommercePaymentRefundUseCase: createCommerceRefund,
            paymongoService: fixture.paymongoService
        });

        const result = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));

        expect(result.success).toBe(true);
        expect(result.data.transaction.payment_status).toBe('refunded');
        expect(result.data.adjustment).toEqual(expect.objectContaining({
            adjustment_type: 'provider_refund',
            status: 'succeeded',
            provider: 'paymongo',
            provider_reference: 'ref_succeeded'
        }));
        expect(result.data.provider_verification).toEqual(expect.objectContaining({
            provider_payment_id: 'pay_169',
            provider_refund_id: 'ref_succeeded'
        }));
        expect(fixture.paymongoService.getPayment).toHaveBeenCalledWith('pay_169');
        expect(createCommerceRefund).toHaveBeenCalledWith(expect.objectContaining({
            paymentSessionId: 'CPS-ONLINE-169',
            actor: 'pos:99'
        }));
        expect(fixture.state.auditLogs.map((entry) => entry.event_type)).toEqual([
            'pos_provider_refund_pending',
            'pos_provider_refund_completed'
        ]);
    });

    it('keeps pending provider confirmation retryable without claiming refunded', async () => {
        const fixture = buildFixture();
        const createCommerceRefund = buildCommerceRefundUseCase('pending');
        const useCase = buildProviderRefundPosTransactionUseCase({
            posRepository: fixture.posRepository,
            commercePaymentRepository: fixture.commercePaymentRepository,
            createCommercePaymentRefundUseCase: createCommerceRefund,
            paymongoService: fixture.paymongoService
        });

        const result = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));

        expect(result.success).toBe(true);
        expect(result.data.transaction.payment_status).toBe('refund_pending');
        expect(result.data.adjustment.status).toBe('pending');
        expect(result.data.financial_outcome).toEqual(expect.objectContaining({
            refund_state: 'pending',
            refund_required: true,
            next_action: 'retry_provider_refund'
        }));
        expect(result.data.transaction.payment_status).not.toBe('refunded');
    });

    it('replays completed idempotency without calling the provider refund again', async () => {
        const fixture = buildFixture();
        const createCommerceRefund = buildCommerceRefundUseCase('succeeded');
        const useCase = buildProviderRefundPosTransactionUseCase({
            posRepository: fixture.posRepository,
            commercePaymentRepository: fixture.commercePaymentRepository,
            createCommercePaymentRefundUseCase: createCommerceRefund,
            paymongoService: fixture.paymongoService
        });
        const request = buildRequest();

        const first = await runInTenantContext(fixture.sequelize, () => useCase(request));
        const replay = await runInTenantContext(fixture.sequelize, () => useCase(request));

        expect(first.success).toBe(true);
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(fixture.state.adjustments).toHaveLength(1);
        expect(createCommerceRefund).toHaveBeenCalledTimes(1);
    });

    it('recovers a provider-success result after a local process interruption and updates the commerce ledger', async () => {
        const fixture = buildFixture();
        const marker = 'POS-PROVIDER-REFUND:169:provider-refund-169';
        fixture.state.provider.payment.attributes.refunds = [{
            id: 'ref_recovered',
            attributes: { status: 'succeeded', amount: 25000, notes: marker }
        }];
        fixture.state.commerceRefunds.push({
            refund_id: 801,
            status: 'pending',
            provider_refund_id: null,
            amount_centavos: 25000,
            notes: marker
        });
        const createCommerceRefund = buildCommerceRefundUseCase('succeeded');
        const reconcileCommercePaymentRefundState = jest.fn(async ({ session }) => ({ ...session, status: 'refunded' }));
        const recordSucceededRevenueRefund = jest.fn(async () => ({ success: true }));
        const useCase = buildProviderRefundPosTransactionUseCase({
            posRepository: fixture.posRepository,
            commercePaymentRepository: fixture.commercePaymentRepository,
            createCommercePaymentRefundUseCase: createCommerceRefund,
            paymongoService: fixture.paymongoService,
            reconcileCommercePaymentRefundState,
            recordSucceededRevenueRefund
        });

        const result = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));

        expect(result.success).toBe(true);
        expect(result.data.idempotent_replay).toBe(true);
        expect(result.data.transaction.payment_status).toBe('refunded');
        expect(result.data.commerce_refund).toEqual(expect.objectContaining({
            status: 'succeeded',
            provider_refund_id: 'ref_recovered'
        }));
        expect(createCommerceRefund).not.toHaveBeenCalled();
        expect(recordSucceededRevenueRefund).toHaveBeenCalledTimes(1);
    });

    it('allows a definite provider failure to remain unpaid and retry with the same idempotency key', async () => {
        const fixture = buildFixture();
        const createCommerceRefund = jest.fn()
            .mockResolvedValueOnce({
                success: true,
                data: { refund: { refund_id: 801, provider_refund_id: null, status: 'failed', amount_centavos: 25000 } }
            })
            .mockResolvedValueOnce({
                success: true,
                data: { refund: { refund_id: 802, provider_refund_id: 'ref_retry', status: 'succeeded', amount_centavos: 25000 } }
            });
        const useCase = buildProviderRefundPosTransactionUseCase({
            posRepository: fixture.posRepository,
            commercePaymentRepository: fixture.commercePaymentRepository,
            createCommercePaymentRefundUseCase: createCommerceRefund,
            paymongoService: fixture.paymongoService
        });

        const failed = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));
        const retry = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));

        expect(failed.success).toBe(true);
        expect(failed.data.transaction.payment_status).toBe('refund_pending');
        expect(failed.data.adjustment.status).toBe('failed');
        expect(retry.success).toBe(true);
        expect(retry.data.transaction.payment_status).toBe('refunded');
        expect(retry.data.adjustment.status).toBe('succeeded');
        expect(createCommerceRefund).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['walk-in', { order_source: 'in_store', payment_provider: 'paymongo' }],
        ['merchant-owned', { payment_provider: 'merchant_owned' }],
        ['unpaid', { payment_status: 'unpaid' }],
        ['split', { payment_breakdown: [{ payment_type: 'gcash', amount: 100 }, { payment_type: 'cash', amount: 150 }] }]
    ])('does not call PayMongo for %s transactions', async (_label, transactionOverrides) => {
        const fixture = buildFixture({ transactionOverrides });
        const createCommerceRefund = buildCommerceRefundUseCase('succeeded');
        const useCase = buildProviderRefundPosTransactionUseCase({
            posRepository: fixture.posRepository,
            commercePaymentRepository: fixture.commercePaymentRepository,
            createCommercePaymentRefundUseCase: createCommerceRefund,
            paymongoService: fixture.paymongoService
        });

        const result = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));

        expect(result.success).toBe(false);
        expect(fixture.paymongoService.getPayment).not.toHaveBeenCalled();
        expect(createCommerceRefund).not.toHaveBeenCalled();
        expect(fixture.state.adjustments).toHaveLength(0);
    });

    it('rejects a commerce session whose amount does not match the POS total', async () => {
        const fixture = buildFixture({ sessionOverrides: { total_amount_centavos: 24900 } });
        const createCommerceRefund = buildCommerceRefundUseCase('succeeded');
        const useCase = buildProviderRefundPosTransactionUseCase({
            posRepository: fixture.posRepository,
            commercePaymentRepository: fixture.commercePaymentRepository,
            createCommercePaymentRefundUseCase: createCommerceRefund,
            paymongoService: fixture.paymongoService
        });

        const result = await runInTenantContext(fixture.sequelize, () => useCase(buildRequest()));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_PROVIDER_REFUND_SESSION_SCOPE_MISMATCH'
        }));
        expect(fixture.paymongoService.getPayment).not.toHaveBeenCalled();
        expect(createCommerceRefund).not.toHaveBeenCalled();
    });

    it('requires an owned open shift for administrators and cashiers', async () => {
        const adminFixture = buildFixture();
        const adminCreateCommerceRefund = buildCommerceRefundUseCase('succeeded');
        const adminUseCase = buildProviderRefundPosTransactionUseCase({
            posRepository: adminFixture.posRepository,
            commercePaymentRepository: adminFixture.commercePaymentRepository,
            createCommercePaymentRefundUseCase: adminCreateCommerceRefund,
            paymongoService: adminFixture.paymongoService
        });
        const adminResult = await runInTenantContext(adminFixture.sequelize, () => adminUseCase({
            ...buildRequest({ shift_id: null, idempotency_key: 'provider-refund-admin' }),
            user: { user_id: 1, role: 'admin' }
        }));

        const adminWithShiftResult = await runInTenantContext(adminFixture.sequelize, () => adminUseCase({
            ...buildRequest({ idempotency_key: 'provider-refund-admin-shift' }),
            user: { user_id: 99, role: 'admin' }
        }));

        const cashierFixture = buildFixture();
        const cashierUseCase = buildProviderRefundPosTransactionUseCase({
            posRepository: cashierFixture.posRepository,
            commercePaymentRepository: cashierFixture.commercePaymentRepository,
            createCommercePaymentRefundUseCase: buildCommerceRefundUseCase('succeeded'),
            paymongoService: cashierFixture.paymongoService
        });
        const cashierResult = await runInTenantContext(cashierFixture.sequelize, () => cashierUseCase(buildRequest({ shift_id: null })));

        expect(adminResult.success).toBe(false);
        expect(adminResult.error.code).toBe('VALIDATION_FAILED');
        expect(adminWithShiftResult.success).toBe(true);
        expect(adminWithShiftResult.data.adjustment.actor_shift_id).toBe(108);
        expect(adminFixture.paymongoService.getPayment).toHaveBeenCalledTimes(1);
        expect(adminFixture.state.adjustments).toHaveLength(1);
        expect(cashierResult.success).toBe(false);
        expect(cashierResult.error.code).toBe('VALIDATION_FAILED');
        expect(cashierFixture.paymongoService.getPayment).not.toHaveBeenCalled();
    });
});
