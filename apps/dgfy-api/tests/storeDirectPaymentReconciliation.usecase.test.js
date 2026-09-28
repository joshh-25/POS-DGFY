import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildReconcileStoreCheckoutPaymentSessionUseCase } from '../src/modules/store/usecases/storeUseCases.js';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_REFERENCE = 'CPS-TESTRECON1';

const buildSession = (overrides = {}) => ({
    session_id: 41,
    public_reference: SESSION_REFERENCE,
    tenant_id: TENANT_ID,
    store_slug: 'masu-cafe',
    provider: 'paymongo',
    target_type: 'store_checkout',
    status: 'awaiting_payment',
    total_amount: '130.0000',
    total_amount_centavos: 13000,
    currency: 'PHP',
    capture_payment_method: 'gcash',
    provider_payment_intent_id: 'pi_test_reconcile',
    provider_payload: {
        paymentFlow: 'direct_gcash',
        paymentIntent: { attributes: { client_key: 'client_test' } }
    },
    ...overrides
});

const execute = async ({
    session = buildSession(),
    refreshedSession = session,
    remoteAddress = '::1',
    paymongoMode = 'test',
    reconciliationResult = {
        success: true,
        data: {
            reconciliation: {
                status: 'finalized',
                provider_status: 'paid',
                provider_payment_id: 'pay_test_reconcile'
            }
        }
    }
} = {}) => {
    const commercePaymentRepository = {
        findSessionByPublicReference: jest.fn()
            .mockResolvedValueOnce(session)
            .mockResolvedValueOnce(refreshedSession)
    };
    const reconcileCommercePaymentSessionUseCase = jest.fn().mockResolvedValue(reconciliationResult);
    const useCase = buildReconcileStoreCheckoutPaymentSessionUseCase({
        commercePaymentRepository,
        reconcileCommercePaymentSessionUseCase,
        paymongoMode
    });
    const result = await dbStore.run({ tenantId: TENANT_ID }, () => useCase({
        paymentSessionId: SESSION_REFERENCE,
        remoteAddress
    }));
    return { result, commercePaymentRepository, reconcileCommercePaymentSessionUseCase };
};

describe('local Storefront direct-payment reconciliation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('delegates a loopback test-mode direct GCash session to the audited reconciliation path', async () => {
        const refreshedSession = buildSession({
            status: 'finalized',
            tracking_pin: 'SK-TEST01',
            pos_transaction_id: 9001
        });
        const { result, reconcileCommercePaymentSessionUseCase } = await execute({ refreshedSession });

        expect(result.success).toBe(true);
        expect(result.data.payment_session).toEqual(expect.objectContaining({
            payment_session_id: SESSION_REFERENCE,
            status: 'finalized',
            tracking_pin: 'SK-TEST01'
        }));
        expect(result.data.reconciliation.status).toBe('finalized');
        expect(reconcileCommercePaymentSessionUseCase).toHaveBeenCalledWith({
            paymentSessionId: SESSION_REFERENCE,
            actor: 'storefront_test_reconciliation'
        });
    });

    it('keeps the reconciliation endpoint idempotent after direct payment finalization', async () => {
        const session = buildSession({
            status: 'finalized',
            tracking_pin: 'SK-TEST02',
            pos_transaction_id: 9002,
            provider_payload: { providerPayment: { id: 'pay_test_reconcile' } }
        });
        const { result, reconcileCommercePaymentSessionUseCase } = await execute({
            session,
            refreshedSession: session,
            reconciliationResult: {
                success: true,
                data: {
                    reconciliation: {
                        status: 'already_finalized',
                        provider_status: 'finalized',
                        provider_payment_id: 'pay_test_reconcile'
                    }
                }
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.payment_session.status).toBe('finalized');
        expect(result.data.reconciliation.status).toBe('already_finalized');
        expect(reconcileCommercePaymentSessionUseCase).toHaveBeenCalledWith({
            paymentSessionId: SESSION_REFERENCE,
            actor: 'storefront_test_reconciliation'
        });
    });

    it.each([
        ['live mode', { paymongoMode: 'live', remoteAddress: '::1' }],
        ['non-loopback access', { paymongoMode: 'test', remoteAddress: '192.168.1.50' }]
    ])('rejects the reconciliation endpoint in %s', async (_label, options) => {
        const { result, reconcileCommercePaymentSessionUseCase } = await execute(options);

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
        expect(reconcileCommercePaymentSessionUseCase).not.toHaveBeenCalled();
    });

    it('does not allow a non-storefront or non-direct session to reach provider reconciliation', async () => {
        const { result, reconcileCommercePaymentSessionUseCase } = await execute({
            session: buildSession({
                target_type: 'dglaundry_booking',
                provider_payload: { paymentFlow: 'hosted' }
            })
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
        expect(reconcileCommercePaymentSessionUseCase).not.toHaveBeenCalled();
    });

    it('returns a provider-pending result without inventing a paid state', async () => {
        const { result } = await execute({
            reconciliationResult: {
                success: true,
                data: {
                    reconciliation: {
                        status: 'provider_not_paid',
                        provider_status: 'awaiting_payment',
                        provider_payment_id: null
                    }
                }
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.payment_session.status).toBe('awaiting_payment');
        expect(result.data.reconciliation.status).toBe('provider_not_paid');
    });
});
