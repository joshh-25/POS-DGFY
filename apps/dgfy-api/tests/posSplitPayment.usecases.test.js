import { afterEach, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
    buildAddPosPaymentAllocationUseCase,
    buildCancelPosPaymentAllocationUseCase,
    buildConfirmPosPaymentAllocationUseCase,
    buildReconcilePosPaymentAllocationUseCase,
    buildCancelPosPaymentSessionUseCase,
    buildCompletePosPaymentSessionUseCase,
    buildCreatePosPaymentSessionUseCase,
    buildGetActivePosPaymentSessionUseCase,
    buildGetPosPaymentSessionUseCase
} from '../src/modules/pos/usecases/splitPaymentUseCases.js';

const baseSession = (overrides = {}) => ({
    pos_payment_session_id: 501,
    status: 'open',
    cashier_id: 15,
    shift_id: 41,
    terminal_id: 'COUNTER-01',
    location_id: 3,
    subtotal_amount: 1250,
    total_amount: 1250,
    paid_amount: 0,
    remaining_amount: 1250,
    ...overrides
});

const basePayload = () => ({
    idempotency_key: 'split-session-001',
    shift_id: 41,
    terminal_id: 'counter-01',
    location_id: 3,
    snapshot: {
        customer_name: 'Walk-in',
        lines: [{ item_id: 7, quantity: 2, sale_price: 625, manager_pin: '1234' }]
    },
    subtotal_amount: 1250,
    total_amount: 1250
});

const buildTransaction = () => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; })
    };
    return transaction;
};

const buildHarness = ({ session = null, allocations = [], existingSession = null, existingAllocation = null } = {}) => {
    const transaction = buildTransaction();
    const storedSession = session || baseSession();
    const storedAllocations = [...allocations];
    const posRepository = {
        getTerminalShiftById: jest.fn().mockResolvedValue({
            pos_terminal_shift_id: 41,
            status: 'open',
            cashier_id: 15,
            terminal_id: 'COUNTER-01',
            location_id: 3
        }),
        getParkedSaleById: jest.fn(),
        findPosPaymentSessionByIdempotencyKey: jest.fn().mockResolvedValue(existingSession),
        findActivePosPaymentSessionForScope: jest.fn().mockResolvedValue(null),
        listUnresolvedFundedPaymentSessionsForShift: jest.fn().mockResolvedValue([]),
        createPosPaymentSession: jest.fn(async (payload) => ({ ...storedSession, ...payload })),
        getPosPaymentSessionById: jest.fn().mockImplementation(async () => storedSession),
        updatePosPaymentSession: jest.fn(async (id, payload) => Object.assign(storedSession, payload)),
        listPosPaymentAllocationsForSession: jest.fn().mockImplementation(async () => [...storedAllocations]),
        findPosPaymentAllocationByIdempotencyKey: jest.fn().mockResolvedValue(existingAllocation),
        createPosPaymentAllocation: jest.fn(async (payload) => {
            const created = { pos_payment_allocation_id: storedAllocations.length + 701, ...payload };
            storedAllocations.push(created);
            return created;
        }),
        getPosPaymentAllocationById: jest.fn().mockImplementation(async (id) => storedAllocations.find((row) => row.pos_payment_allocation_id === id) || null),
        findPosPaymentAllocationByProviderEventId: jest.fn().mockResolvedValue(null),
        findPosPaymentAllocationByProviderRefundEventId: jest.fn().mockResolvedValue(null),
        updatePosPaymentAllocation: jest.fn(async (id, payload) => {
            const row = storedAllocations.find((entry) => entry.pos_payment_allocation_id === id);
            Object.assign(row, payload);
            return row;
        }),
        getTransactionById: jest.fn().mockResolvedValue({
            pos_transaction_id: 9901,
            total_amount: 1250,
            status: 'completed'
        })
    };
    const sequelize = { transaction: jest.fn().mockResolvedValue(transaction) };
    return { posRepository, sequelize, transaction, storedSession, storedAllocations };
};

const runInTenant = (sequelize, callback) => dbStore.run({ sequelize }, callback);

afterEach(() => jest.restoreAllMocks());

describe('POS split-payment engine', () => {
    const quotePosCheckoutUseCase = jest.fn(async () => ({
        success: true,
        data: { quote: { subtotal_amount: 1250, total_amount: 1250 } }
    }));

    it('creates a scoped, secret-scrubbed payment session', async () => {
        const harness = buildHarness();
        const useCase = buildCreatePosPaymentSessionUseCase({ posRepository: harness.posRepository, quotePosCheckoutUseCase });

        const result = await runInTenant(harness.sequelize, () => useCase({ payload: basePayload(), user: { user_id: 15 } }));

        expect(result.success).toBe(true);
        expect(result.data.status).toBe('open');
        expect(result.data.remaining_amount).toBe(1250);
        expect(result.data.snapshot.lines[0]).not.toHaveProperty('manager_pin');
        expect(harness.posRepository.createPosPaymentSession).toHaveBeenCalledWith(
            expect.objectContaining({ cashier_id: 15, shift_id: 41, terminal_id: 'COUNTER-01', location_id: 3 }),
            expect.objectContaining({ transaction: harness.transaction })
        );
        expect(harness.transaction.commit).toHaveBeenCalledTimes(1);
    });

    it('records a server-validated relief cashier without transferring the register shift', async () => {
        const harness = buildHarness();
        const useCase = buildCreatePosPaymentSessionUseCase({ posRepository: harness.posRepository, quotePosCheckoutUseCase });
        const reliefUser = {
            user_id: 22,
            operator_session_id: 601,
            register_shift_owner_user_id: 15
        };

        const result = await runInTenant(harness.sequelize, () => useCase({ payload: basePayload(), user: reliefUser }));

        expect(result.success).toBe(true);
        expect(harness.posRepository.createPosPaymentSession).toHaveBeenCalledWith(
            expect.objectContaining({ cashier_id: 22, shift_id: 41 }),
            expect.objectContaining({ transaction: harness.transaction })
        );
    });

    it('verifies a PIN-protected discount during session creation and stores only a server approval proof', async () => {
        const harness = buildHarness();
        const governedSnapshot = {
            ...basePayload().snapshot,
            governed_discount: {
                type: 'manual',
                method: 'percentage',
                rate: 10,
                amount: null,
                reason: 'Service recovery',
                approver_user_id: 23,
                manager_pin: '1234'
            }
        };
        const quoteWithApproval = jest.fn(async ({ payload, discountApproval }) => {
            expect(payload.governed_discount).not.toHaveProperty('manager_pin');
            expect(discountApproval).toEqual(expect.objectContaining({
                discount_type: 'manual',
                approver_user_id: 23,
                manager_pin: '1234'
            }));
            return {
                success: true,
                data: { quote: { subtotal_amount: 1250, discount_amount: 125, total_amount: 1125 } }
            };
        });
        const useCase = buildCreatePosPaymentSessionUseCase({
            posRepository: harness.posRepository,
            quotePosCheckoutUseCase: quoteWithApproval
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            payload: { ...basePayload(), snapshot: governedSnapshot },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.total_amount).toBe(1125);
        expect(result.data.snapshot.governed_discount).not.toHaveProperty('manager_pin');
        expect(result.data.snapshot.governed_discount.approval_proof).toEqual(expect.objectContaining({
            version: 1,
            discount_type: 'manual',
            approver_user_id: 23
        }));
    });

    it('replays an idempotent session request without creating a duplicate', async () => {
        const harness = buildHarness();
        const useCase = buildCreatePosPaymentSessionUseCase({ posRepository: harness.posRepository, quotePosCheckoutUseCase });
        const first = await runInTenant(harness.sequelize, () => useCase({ payload: basePayload(), user: { user_id: 15 } }));
        harness.posRepository.findPosPaymentSessionByIdempotencyKey.mockResolvedValue(first.data);
        harness.posRepository.createPosPaymentSession.mockClear();

        const replay = await runInTenant(harness.sequelize, () => useCase({ payload: basePayload(), user: { user_id: 15 } }));

        expect(replay.success).toBe(true);
        expect(replay.data.status).toBe('open');
        expect(harness.posRepository.createPosPaymentSession).not.toHaveBeenCalled();
    });

    it('uses the server quote instead of caller-provided totals before accepting allocations', async () => {
        const harness = buildHarness();
        const authoritativeQuote = jest.fn(async () => ({
            success: true,
            data: { quote: { subtotal_amount: 1250, total_amount: 1250 } }
        }));
        const useCase = buildCreatePosPaymentSessionUseCase({
            posRepository: harness.posRepository,
            quotePosCheckoutUseCase: authoritativeQuote
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            payload: { ...basePayload(), subtotal_amount: 1, total_amount: 1 },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.total_amount).toBe(1250);
        expect(harness.posRepository.createPosPaymentSession).toHaveBeenCalledWith(
            expect.objectContaining({ subtotal_amount: 1250, total_amount: 1250, remaining_amount: 1250 }),
            expect.any(Object)
        );
    });

    it('resumes the scoped active session instead of creating a duplicate', async () => {
        const harness = buildHarness();
        harness.posRepository.findActivePosPaymentSessionForScope.mockResolvedValue(baseSession());
        const useCase = buildCreatePosPaymentSessionUseCase({ posRepository: harness.posRepository, quotePosCheckoutUseCase });

        const result = await runInTenant(harness.sequelize, () => useCase({ payload: basePayload(), user: { user_id: 15 } }));

        expect(result.success).toBe(true);
        expect(result.data.resumed_active_session).toBe(true);
        expect(harness.posRepository.createPosPaymentSession).not.toHaveBeenCalled();
    });

    it('discovers an active session from server scope when browser storage is unavailable', async () => {
        const harness = buildHarness();
        harness.posRepository.findActivePosPaymentSessionForScope.mockResolvedValue(baseSession());
        const useCase = buildGetActivePosPaymentSessionUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', location_id: 3 },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.pos_payment_session_id).toBe(501);
    });

    it('rejects direct reads outside the active terminal scope', async () => {
        const harness = buildHarness();
        harness.posRepository.getTerminalShiftById.mockResolvedValue({
            pos_terminal_shift_id: 41,
            status: 'open',
            cashier_id: 15,
            terminal_id: 'COUNTER-02',
            location_id: 3
        });
        const useCase = buildGetPosPaymentSessionUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: { shift_id: 41, terminal_id: 'COUNTER-02', location_id: 3 },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('POS_PAYMENT_SESSION_SCOPE_MISMATCH');
    });

    it('records cash, calculates the remaining balance, and returns change for over-tendering', async () => {
        const harness = buildHarness({ session: baseSession() });
        const useCase = buildAddPosPaymentAllocationUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: {
                idempotency_key: 'cash-allocation-001', shift_id: 41, terminal_id: 'COUNTER-01',
                payment_method: 'cash', amount: 1300
            },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.allocation.applied_amount).toBe(1250);
        expect(result.data.allocation.change_amount).toBe(50);
        expect(result.data.session.status).toBe('ready_to_complete');
        expect(result.data.session.remaining_amount).toBe(0);
    });

    it('keeps non-cash allocations pending until provider confirmation', async () => {
        const harness = buildHarness({ session: baseSession() });
        const useCase = buildAddPosPaymentAllocationUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: {
                idempotency_key: 'gcash-allocation-001', shift_id: 41, terminal_id: 'COUNTER-01',
                payment_method: 'gcash', amount: 500, payment_reference: 'GC-001'
            },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.allocation.status).toBe('pending');
        expect(result.data.allocation.applied_amount).toBe(500);
        expect(result.data.session.paid_amount).toBe(0);
        expect(result.data.session.status).toBe('open');
    });

    it('records a cashier-confirmed store-owned GCash payment without PayMongo', async () => {
        const harness = buildHarness({ session: baseSession() });
        const useCase = buildAddPosPaymentAllocationUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: {
                idempotency_key: 'gcash-manual-001',
                shift_id: 41,
                terminal_id: 'COUNTER-01',
                payment_method: 'gcash',
                amount: 750,
                payment_handoff_mode: 'external',
                payment_reference: '',
                payment_provider: 'paymongo',
                manual_payment_received: true
            },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.allocation).toEqual(expect.objectContaining({
            status: 'successful',
            payment_method: 'gcash',
            payment_provider: 'merchant_owned',
            payment_reference: null,
            applied_amount: 750
        }));
        expect(result.data.allocation.provider_event_id).toBeUndefined();
        expect(result.data.session.paid_amount).toBe(750);
        expect(result.data.session.remaining_amount).toBe(500);
    });

    it('rejects client-side non-cash success claims', async () => {
        const harness = buildHarness({ session: baseSession() });
        const useCase = buildAddPosPaymentAllocationUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: {
                idempotency_key: 'gcash-success-001', shift_id: 41, terminal_id: 'COUNTER-01',
                payment_method: 'gcash', amount: 500, outcome: 'successful', payment_reference: 'GC-002'
            },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PAYMENT_CONFIRMATION_REQUIRED' }));
        expect(harness.posRepository.createPosPaymentAllocation).not.toHaveBeenCalled();
    });

    it('accepts only server-verified provider confirmation for a pending digital allocation', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            session_id: 501,
            status: 'pending',
            payment_method: 'gcash',
            payment_provider: 'paymongo',
            payment_reference: 'GC-VERIFIED-001',
            applied_amount: 500
        };
        const harness = buildHarness({ session: baseSession(), allocations: [allocation] });
        const verifier = jest.fn().mockResolvedValue({
            verified: true,
            provider_event_id: 'provider-event-001',
            provider_confirmed_at: new Date('2026-08-12T10:00:00.000Z')
        });
        const useCase = buildConfirmPosPaymentAllocationUseCase({
            posRepository: harness.posRepository,
            providerConfirmationVerifier: verifier
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            allocationId: 701,
            payload: {
                shift_id: 41,
                terminal_id: 'COUNTER-01',
                provider_event_id: 'provider-event-001',
                provider_confirmed_at: '2026-08-12T10:00:00.000Z',
                provider_signature: 'a'.repeat(64)
            },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.allocation.status).toBe('successful');
        expect(result.data.allocation.provider_event_id).toBe('provider-event-001');
        expect(result.data.session.paid_amount).toBe(500);
        expect(verifier).toHaveBeenCalledWith(expect.objectContaining({ allocation, session: harness.storedSession }));
    });

    it('keeps a pending allocation unchanged when provider evidence is rejected', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            session_id: 501,
            status: 'pending',
            payment_method: 'gcash',
            payment_provider: 'paymongo',
            payment_reference: 'GC-REJECTED-001',
            applied_amount: 500
        };
        const harness = buildHarness({ session: baseSession(), allocations: [allocation] });
        const useCase = buildConfirmPosPaymentAllocationUseCase({
            posRepository: harness.posRepository,
            providerConfirmationVerifier: jest.fn().mockResolvedValue({ verified: false, reason: 'bad signature' })
        });
        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            allocationId: 701,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', provider_event_id: 'provider-event-002', provider_confirmed_at: '2026-08-12T10:00:00.000Z', provider_signature: 'b'.repeat(64) },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PAYMENT_PROVIDER_CONFIRMATION_INVALID' }));
        expect(allocation.status).toBe('pending');
    });

    it('reconciles a provider-paid pending allocation and recalculates the session balance', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            allocation_reference: 'ALLOC-701',
            session_id: 501,
            status: 'pending',
            payment_method: 'gcash',
            payment_provider: 'paymongo',
            payment_reference: 'pay_701',
            applied_amount: 750
        };
        const harness = buildHarness({ session: baseSession({ session_reference: 'PSES-501' }), allocations: [allocation] });
        const providerReconciler = jest.fn().mockResolvedValue({
            reconciled: true,
            action: 'confirm',
            provider_event_id: 'paymongo:payment:pay_701:paid',
            provider_confirmed_at: new Date('2026-08-12T11:00:00.000Z')
        });
        const useCase = buildReconcilePosPaymentAllocationUseCase({
            posRepository: harness.posRepository,
            providerReconciler
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            allocationId: 701,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.allocation.status).toBe('successful');
        expect(result.data.session.paid_amount).toBe(750);
        expect(result.data.session.remaining_amount).toBe(500);
        expect(providerReconciler).toHaveBeenCalledWith(expect.objectContaining({ allocation }));
    });

    it('reverses a fully refunded provider allocation without deleting its paid evidence', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            allocation_reference: 'ALLOC-701',
            session_id: 501,
            status: 'successful',
            payment_method: 'gcash',
            payment_provider: 'paymongo',
            payment_reference: 'pay_701',
            provider_event_id: 'paymongo:payment:pay_701:paid',
            applied_amount: 750
        };
        const harness = buildHarness({
            session: baseSession({ session_reference: 'PSES-501', status: 'partially_paid', paid_amount: 750, remaining_amount: 500 }),
            allocations: [allocation]
        });
        harness.posRepository.findPosPaymentAllocationByProviderEventId.mockResolvedValue(allocation);
        const useCase = buildReconcilePosPaymentAllocationUseCase({
            posRepository: harness.posRepository,
            providerReconciler: jest.fn().mockResolvedValue({
                reconciled: true,
                action: 'reverse',
                provider_event_id: 'paymongo:payment:pay_701:paid',
                provider_confirmed_at: new Date('2026-08-12T11:00:00.000Z'),
                provider_refund_ids: ['ref_701'],
                provider_refund_event_id: 'paymongo:refund:ref_701:succeeded',
                provider_refund_status: 'succeeded',
                provider_refunded_at: new Date('2026-08-12T11:30:00.000Z')
            })
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            allocationId: 701,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.allocation).toEqual(expect.objectContaining({
            status: 'reversed',
            provider_event_id: 'paymongo:payment:pay_701:paid',
            provider_refund_ids: ['ref_701'],
            provider_refund_event_id: 'paymongo:refund:ref_701:succeeded'
        }));
        expect(result.data.session.paid_amount).toBe(0);
        expect(result.data.session.remaining_amount).toBe(1250);
    });

    it('rejects a provider refund event replayed across allocations', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            allocation_reference: 'ALLOC-701',
            session_id: 501,
            status: 'successful',
            payment_method: 'gcash',
            payment_provider: 'paymongo',
            payment_reference: 'pay_701',
            provider_event_id: 'paymongo:payment:pay_701:paid',
            applied_amount: 750
        };
        const harness = buildHarness({
            session: baseSession({ session_reference: 'PSES-501', status: 'partially_paid' }),
            allocations: [allocation]
        });
        harness.posRepository.findPosPaymentAllocationByProviderEventId.mockResolvedValue(allocation);
        harness.posRepository.findPosPaymentAllocationByProviderRefundEventId.mockResolvedValue({
            pos_payment_allocation_id: 702,
            provider_refund_event_id: 'paymongo:refund:ref_REPLAY:succeeded'
        });
        const useCase = buildReconcilePosPaymentAllocationUseCase({
            posRepository: harness.posRepository,
            providerReconciler: jest.fn().mockResolvedValue({
                reconciled: true,
                action: 'reverse',
                provider_event_id: 'paymongo:payment:pay_701:paid',
                provider_refund_ids: ['ref_REPLAY'],
                provider_refund_event_id: 'paymongo:refund:ref_REPLAY:succeeded',
                provider_refund_status: 'succeeded'
            })
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            allocationId: 701,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'PAYMENT_PROVIDER_REFUND_EVENT_REPLAY'
        }));
        expect(allocation.status).toBe('successful');
    });

    it('does not erase a successful digital allocation through ordinary cancellation', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            session_id: 501,
            status: 'successful',
            payment_method: 'gcash',
            payment_provider: 'paymongo',
            applied_amount: 500
        };
        const harness = buildHarness({
            session: baseSession({ status: 'partially_paid', paid_amount: 500, remaining_amount: 750 }),
            allocations: [allocation]
        });
        const useCase = buildCancelPosPaymentAllocationUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            allocationId: 701,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', reason: 'Customer changed tender' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PAYMENT_PROVIDER_REFUND_REQUIRED' }));
        expect(allocation.status).toBe('successful');
    });

    it('reverses a cashier-confirmed store-owned digital allocation with an audit reason', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            session_id: 501,
            status: 'successful',
            payment_method: 'gcash',
            payment_provider: 'merchant_owned',
            applied_amount: 500
        };
        const harness = buildHarness({
            session: baseSession({ status: 'partially_paid', paid_amount: 500, remaining_amount: 750 }),
            allocations: [allocation]
        });
        const useCase = buildCancelPosPaymentAllocationUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            allocationId: 701,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', reason: 'GCash receipt entered on wrong sale' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.allocation).toEqual(expect.objectContaining({
            status: 'reversed',
            reversed_by: 15,
            reversal_reason: 'GCash receipt entered on wrong sale'
        }));
        expect(result.data.session.paid_amount).toBe(0);
        expect(result.data.session.remaining_amount).toBe(1250);
    });

    it('does not route cash allocations through provider confirmation', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            session_id: 501,
            status: 'successful',
            payment_method: 'cash',
            applied_amount: 500
        };
        const harness = buildHarness({ session: baseSession({ status: 'partially_paid', paid_amount: 500 }), allocations: [allocation] });
        const useCase = buildConfirmPosPaymentAllocationUseCase({
            posRepository: harness.posRepository,
            providerConfirmationVerifier: jest.fn()
        });
        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            allocationId: 701,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', provider_event_id: 'provider-event-cash', provider_confirmed_at: '2026-08-12T10:00:00.000Z', provider_signature: 'c'.repeat(64) },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'CASH_PROVIDER_CONFIRMATION_NOT_ALLOWED' }));
    });

    it('rejects non-cash overpayment instead of silently treating it as change', async () => {
        const harness = buildHarness({ session: baseSession() });
        const useCase = buildAddPosPaymentAllocationUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: {
                idempotency_key: 'gcash-overpay-001', shift_id: 41, terminal_id: 'COUNTER-01',
                payment_method: 'gcash', amount: 1300, payment_reference: 'GC-003'
            },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'NON_CASH_OVERPAYMENT' }));
        expect(harness.posRepository.createPosPaymentAllocation).not.toHaveBeenCalled();
    });

    it('reverses successful cash without deleting its audit row and recomputes the balance', async () => {
        const allocation = { pos_payment_allocation_id: 701, session_id: 501, status: 'successful', payment_method: 'cash', applied_amount: 500 };
        const harness = buildHarness({ session: baseSession({ status: 'partially_paid', paid_amount: 500, remaining_amount: 750 }), allocations: [allocation] });
        const useCase = buildCancelPosPaymentAllocationUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            allocationId: 701,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', reason: 'Customer changed tender' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.allocation.status).toBe('reversed');
        expect(result.data.allocation.reversal_reason).toBe('Customer changed tender');
        expect(result.data.session.paid_amount).toBe(0);
        expect(result.data.session.status).toBe('open');
    });

    it('does not cancel a session while successful money still exists', async () => {
        const allocation = { pos_payment_allocation_id: 701, session_id: 501, status: 'successful', applied_amount: 500 };
        const harness = buildHarness({ session: baseSession({ status: 'partially_paid' }), allocations: [allocation] });
        const useCase = buildCancelPosPaymentSessionUseCase({ posRepository: harness.posRepository });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: { shift_id: 41, terminal_id: 'COUNTER-01', reason: 'Abandoned cart' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PAYMENT_ALLOCATION_REVERSAL_REQUIRED' }));
        expect(harness.posRepository.updatePosPaymentSession).not.toHaveBeenCalled();
    });

    it('completes one fully paid session through the normal checkout transaction seam', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            session_id: 501,
            status: 'successful',
            payment_method: 'cash',
            applied_amount: 1250,
            cash_tendered: 1300,
            change_amount: 50
        };
        const harness = buildHarness({
            session: baseSession({
                status: 'ready_to_complete',
                paid_amount: 1250,
                remaining_amount: 0,
                session_reference: 'PAY-COMPLETE-01',
                snapshot: JSON.stringify({ lines: [{ item_id: 7, quantity: 2, sale_price: 625 }] })
            }),
            allocations: [allocation]
        });
        const checkoutPosUseCase = jest.fn(async ({ payload, transaction, beforeCommit }) => {
            expect(transaction).toBe(harness.transaction);
            expect(payload.idempotency_key).toBe('split-checkout:PAY-COMPLETE-01');
            expect(payload.lines[0].sale_price).toBe(625);
            expect(payload.payment_breakdown).toEqual([
                expect.objectContaining({ payment_type: 'cash', count: 1, amount: 1250 })
            ]);
            await beforeCommit({ transactionId: 9901, idempotentReplay: false });
            return {
                success: true,
                data: {
                    idempotent_replay: false,
                    transaction: { pos_transaction_id: 9901, total_amount: 1250, status: 'completed' }
                }
            };
        });
        const useCase = buildCompletePosPaymentSessionUseCase({
            posRepository: harness.posRepository,
            checkoutPosUseCase
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: { idempotency_key: 'split-complete-001', shift_id: 41, terminal_id: 'COUNTER-01', location_id: 3 },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.transaction.pos_transaction_id).toBe(9901);
        expect(result.data.session.status).toBe('completed');
        expect(result.data.session.completed_transaction_id).toBe(9901);
        expect(harness.posRepository.updatePosPaymentSession).toHaveBeenCalledWith(
            501,
            expect.objectContaining({ status: 'completed', completed_transaction_id: 9901 }),
            expect.objectContaining({ transaction: harness.transaction })
        );
        expect(harness.transaction.commit).toHaveBeenCalledTimes(1);
    });

    it('passes the server approval proof to completion without exposing it in the checkout payload', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            session_id: 501,
            status: 'successful',
            payment_method: 'cash',
            applied_amount: 1125,
            cash_tendered: 1125,
            change_amount: 0
        };
        const harness = buildHarness({
            session: baseSession({
                status: 'ready_to_complete',
                subtotal_amount: 1250,
                total_amount: 1125,
                paid_amount: 1125,
                remaining_amount: 0,
                session_reference: 'PAY-COMPLETE-DISCOUNT',
                snapshot: JSON.stringify({
                    governed_discount: {
                        type: 'manual',
                        method: 'percentage',
                        rate: 10,
                        reason: 'Service recovery',
                        approver_user_id: 23,
                        approval_proof: {
                            version: 1,
                            discount_type: 'manual',
                            approver_user_id: 23,
                            self_approved: false,
                            approved_at: '2026-08-15T09:00:00.000Z'
                        }
                    },
                    lines: [{ item_id: 7, quantity: 2, sale_price: 625 }]
                })
            }),
            allocations: [allocation]
        });
        const checkoutPosUseCase = jest.fn(async ({ payload, trustedDiscountApproval, transaction, beforeCommit }) => {
            expect(transaction).toBe(harness.transaction);
            expect(payload.governed_discount).not.toHaveProperty('approval_proof');
            expect(trustedDiscountApproval).toEqual(expect.objectContaining({
                discount_type: 'manual',
                approver_user_id: 23
            }));
            await beforeCommit({ transactionId: 9901, idempotentReplay: false });
            return {
                success: true,
                data: {
                    idempotent_replay: false,
                    transaction: { pos_transaction_id: 9901, total_amount: 1125, status: 'completed' }
                }
            };
        });
        const useCase = buildCompletePosPaymentSessionUseCase({
            posRepository: harness.posRepository,
            checkoutPosUseCase
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: { idempotency_key: 'split-complete-discount', shift_id: 41, terminal_id: 'COUNTER-01', location_id: 3 },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(true);
        expect(result.data.transaction.total_amount).toBe(1125);
    });

    it('fails closed with a recovery-specific error when the stored checkout snapshot is invalid', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            session_id: 501,
            status: 'successful',
            payment_method: 'gcash',
            payment_provider: 'merchant_owned',
            applied_amount: 90
        };
        const harness = buildHarness({
            session: baseSession({
                status: 'ready_to_complete',
                subtotal_amount: 90,
                total_amount: 90,
                paid_amount: 90,
                remaining_amount: 0,
                session_reference: 'PAY-BROKEN-SNAPSHOT',
                snapshot: '{not-valid-json'
            }),
            allocations: [allocation]
        });
        const checkoutPosUseCase = jest.fn();
        const useCase = buildCompletePosPaymentSessionUseCase({
            posRepository: harness.posRepository,
            checkoutPosUseCase
        });

        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: { idempotency_key: 'split-complete-invalid-snapshot', shift_id: 41, terminal_id: 'COUNTER-01', location_id: 3 },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_PAYMENT_SESSION_SNAPSHOT_INVALID'
        }));
        expect(checkoutPosUseCase).not.toHaveBeenCalled();
        expect(harness.transaction.rollback).toHaveBeenCalledTimes(1);
    });

    it('rejects completion while a digital allocation is still pending', async () => {
        const allocation = {
            pos_payment_allocation_id: 701,
            session_id: 501,
            status: 'pending',
            payment_method: 'gcash',
            applied_amount: 0
        };
        const harness = buildHarness({
            session: baseSession({ status: 'open', paid_amount: 0, remaining_amount: 750 }),
            allocations: [allocation]
        });
        const checkoutPosUseCase = jest.fn();
        const useCase = buildCompletePosPaymentSessionUseCase({
            posRepository: harness.posRepository,
            checkoutPosUseCase
        });
        const result = await runInTenant(harness.sequelize, () => useCase({
            paymentSessionId: 501,
            payload: { idempotency_key: 'split-complete-002', shift_id: 41, terminal_id: 'COUNTER-01' },
            user: { user_id: 15 }
        }));

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'PAYMENT_ALLOCATION_UNRESOLVED' }));
        expect(checkoutPosUseCase).not.toHaveBeenCalled();
        expect(harness.transaction.rollback).toHaveBeenCalledTimes(1);
    });
});
