import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildCancelStoreCheckoutPaymentSessionUseCase } from '../src/modules/store/usecases/storeUseCases.js';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_REFERENCE = 'CPS-CANCEL0001';

const buildSession = (overrides = {}) => ({
    session_id: 73,
    public_reference: SESSION_REFERENCE,
    tenant_id: TENANT_ID,
    store_slug: 'masu-cafe',
    provider: 'paymongo',
    target_type: 'store_checkout',
    status: 'awaiting_payment',
    idempotency_key: 'cancel-test-idempotency',
    request_hash: 'cancel-test-request-hash',
    checkout_payload: {
        payment_type: 'card'
    },
    total_amount: '230.2500',
    total_amount_centavos: 23025,
    currency: 'PHP',
    provider_payment_intent_id: 'pi_test_cancel',
    provider_payload: {
        paymentFlow: 'direct_card',
        paymentIntent: { attributes: { client_key: 'client_test' } }
    },
    ...overrides
});

const execute = async ({
    session = buildSession(),
    refreshedSession = buildSession({ status: 'cancelled', failure_code: 'PAYMENT_SESSION_CANCELLED' }),
    storeSlug = 'masu-cafe',
    storeCustomer = null,
    cancelPaymentIntent = jest.fn().mockResolvedValue({
        id: 'pi_test_cancel',
        attributes: { status: 'cancelled' }
    })
} = {}) => {
    const commercePaymentRepository = {
        findSessionByPublicReference: jest.fn()
            .mockResolvedValueOnce(session)
            .mockResolvedValueOnce(session),
        updateSessionById: jest.fn().mockResolvedValue(refreshedSession)
    };
    const useCase = buildCancelStoreCheckoutPaymentSessionUseCase({
        commercePaymentRepository,
        paymongoService: { cancelPaymentIntent }
    });
    const result = await dbStore.run({ tenantId: TENANT_ID }, () => useCase({
        paymentSessionId: SESSION_REFERENCE,
        storeSlug,
        storeCustomer
    }));
    return { result, commercePaymentRepository, cancelPaymentIntent };
};

describe('Storefront payment-session cancellation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('cancels the provider intent before marking an unpaid direct session cancelled', async () => {
        const { result, commercePaymentRepository, cancelPaymentIntent } = await execute();

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            cancellation_requested: true,
            idempotent_replay: false
        }));
        expect(result.data.payment_session.status).toBe('cancelled');
        expect(cancelPaymentIntent).toHaveBeenCalledWith('pi_test_cancel');
        expect(commercePaymentRepository.updateSessionById).toHaveBeenCalledWith(
            73,
            expect.objectContaining({
                status: 'cancelled',
                failure_code: 'PAYMENT_SESSION_CANCELLED'
            }),
            {}
        );
    });

    it('is idempotent for an already ended payment session without calling PayMongo', async () => {
        const cancelPaymentIntent = jest.fn();
        const { result, commercePaymentRepository } = await execute({
            session: buildSession({ status: 'cancelled' }),
            refreshedSession: buildSession({ status: 'cancelled' }),
            cancelPaymentIntent
        });

        expect(result.success).toBe(true);
        expect(result.data.idempotent_replay).toBe(true);
        expect(cancelPaymentIntent).not.toHaveBeenCalled();
        expect(commercePaymentRepository.updateSessionById).not.toHaveBeenCalled();
    });

    it('does not cancel a payment that PayMongo reports as already completed', async () => {
        const cancelPaymentIntent = jest.fn().mockRejectedValue({
            response: {
                status: 400,
                data: { errors: [{ code: 'resource_succeeded_state' }] }
            }
        });
        const { result, commercePaymentRepository } = await execute({ cancelPaymentIntent });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(commercePaymentRepository.updateSessionById).not.toHaveBeenCalled();
    });

    it('rejects signed-in customers that do not own the payment session', async () => {
        const cancelPaymentIntent = jest.fn();
        const { result, commercePaymentRepository } = await execute({
            session: buildSession({
                checkout_payload: {
                    payment_type: 'card',
                    _verified_store_customer: {
                        customer_id: 11,
                        dgfy_account_id: 'account-11'
                    }
                }
            }),
            cancelPaymentIntent,
            storeCustomer: { customer_id: 12, dgfy_account_id: 'account-12' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.error.statusCode).toBe(403);
        expect(cancelPaymentIntent).not.toHaveBeenCalled();
        expect(commercePaymentRepository.updateSessionById).not.toHaveBeenCalled();
    });

    it('rejects paid or finalized local sessions before contacting the provider', async () => {
        const cancelPaymentIntent = jest.fn();
        const { result, commercePaymentRepository } = await execute({
            session: buildSession({ status: 'paid' }),
            cancelPaymentIntent
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(cancelPaymentIntent).not.toHaveBeenCalled();
        expect(commercePaymentRepository.updateSessionById).not.toHaveBeenCalled();
    });
});
