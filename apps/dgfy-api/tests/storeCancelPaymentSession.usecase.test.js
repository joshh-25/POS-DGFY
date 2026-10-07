import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildCancelStoreCheckoutPaymentSessionUseCase } from '../src/modules/store/usecases/storeUseCases.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BASE_SESSION = {
    session_id: 41,
    public_reference: 'CPS-ABCDEFGHIJ',
    tenant_id: TENANT_ID,
    store_slug: 'masu-cafe',
    target_type: 'store_checkout',
    checkout_payload: { payment_type: 'card' },
    status: 'awaiting_payment',
    provider: 'paymongo',
    provider_payment_intent_id: 'pi_test_123',
    provider_checkout_session_id: null,
    total_amount_centavos: 12500,
    currency: 'PHP',
    subtotal_amount: '125.00',
    delivery_fee: '0.00',
    service_fee_amount: '0.00',
    total_amount: '125.00',
    tracking_pin: null,
    pos_transaction_id: null
};

const build = ({ session = {}, providerResult = { outcome: 'cancelled' }, findSessionImpl = null } = {}) => {
    const row = { ...BASE_SESSION, ...session };
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const transactionState = { active: false };
    const repository = {
        runInTransaction: jest.fn(async (callback) => {
            transactionState.active = true;
            try {
                return await callback(transaction);
            } finally {
                transactionState.active = false;
            }
        }),
        findSessionByPublicReference: jest.fn(findSessionImpl || (async () => row)),
        updateSessionById: jest.fn(async (_id, patch) => Object.assign(row, patch)),
        createAuditLog: jest.fn(async () => ({ id: 1 })),
        createSession: jest.fn(),
        createOrder: jest.fn(),
        captureCharge: jest.fn()
    };
    const paymongoService = {
        cancelPaymentIntent: jest.fn(async () => {
            if (transactionState.active) throw new Error('provider call ran inside a database transaction');
            return providerResult;
        }),
        expireCheckoutSession: jest.fn(async () => {
            if (transactionState.active) throw new Error('provider call ran inside a database transaction');
            return providerResult;
        })
    };
    const useCase = buildCancelStoreCheckoutPaymentSessionUseCase({
        commercePaymentRepository: repository,
        paymongoService
    });
    const run = (overrides = {}) => dbStore.run({ tenantId: TENANT_ID, tenantToken: 'masu-cafe' }, () => useCase({
        paymentSessionId: BASE_SESSION.public_reference,
        actor: 'store_guest',
        storeSlug: 'masu-cafe',
        ...overrides
    }));
    return { run, row, repository, paymongoService };
};

describe('buildCancelStoreCheckoutPaymentSessionUseCase', () => {
    it('cancels a Payment Intent and audits the terminal write', async () => {
        const fixture = build();
        const result = await fixture.run();

        expect(result.success).toBe(true);
        expect(result.data.cancellation.outcome).toBe('cancelled');
        expect(fixture.paymongoService.cancelPaymentIntent).toHaveBeenCalledWith('pi_test_123');
        expect(fixture.repository.findSessionByPublicReference).toHaveBeenCalledTimes(2);
        expect(fixture.repository.findSessionByPublicReference.mock.calls.every(([, options]) => options.lock === true)).toBe(true);
        expect(fixture.row.status).toBe('cancelled');
        expect(fixture.repository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            entity_type: 'CommercePayment',
            entity_id: 41,
            changes: expect.objectContaining({ event: 'commerce_payment_session_cancelled' })
        }), expect.objectContaining({ transaction: expect.anything() }));
    });

    it('expires a Hosted Checkout session using its persisted cs_ ID', async () => {
        const fixture = build({ session: {
            provider_payment_intent_id: null,
            provider_checkout_session_id: 'cs_test_123'
        } });

        const result = await fixture.run();

        expect(result.data.cancellation.outcome).toBe('cancelled');
        expect(fixture.paymongoService.expireCheckoutSession).toHaveBeenCalledWith('cs_test_123');
        expect(fixture.paymongoService.cancelPaymentIntent).not.toHaveBeenCalled();
    });

    it.each(['paid', 'finalized', 'paid_manual_resolution_required'])(
        'does not call PayMongo when session is %s', async (status) => {
            const fixture = build({ session: { status } });
            const result = await fixture.run();

            expect(result.data.cancellation.outcome).toBe('not_cancellable');
            expect(fixture.paymongoService.cancelPaymentIntent).not.toHaveBeenCalled();
            expect(fixture.row.status).toBe(status);
        }
    );

    it('refuses to cancel any session that already carries an order identity', async () => {
        const fixture = build({ session: { pos_transaction_id: 903 } });
        const result = await fixture.run();

        expect(result.data.cancellation.outcome).toBe('not_cancellable');
        expect(fixture.paymongoService.cancelPaymentIntent).not.toHaveBeenCalled();
        expect(fixture.row.status).toBe('awaiting_payment');
    });

    it('returns an already-cancelled session idempotently', async () => {
        const fixture = build({ session: { status: 'cancelled' } });
        const result = await fixture.run();

        expect(result.data.cancellation.outcome).toBe('cancelled');
        expect(fixture.paymongoService.cancelPaymentIntent).not.toHaveBeenCalled();
        expect(fixture.repository.updateSessionById).not.toHaveBeenCalled();
    });

    it('keeps the session unresolved when PayMongo rejects with an ongoing-payment 400', async () => {
        const fixture = build({ providerResult: {
            outcome: 'not_cancellable',
            reason_code: 'PAYMENT_ONGOING',
            reason: 'There is an ongoing payment for this session.'
        } });
        const result = await fixture.run();

        expect(result.data.cancellation.outcome).toBe('unresolved');
        expect(fixture.row.status).toBe('awaiting_payment');
        expect(fixture.row.failure_code).toBe('PAYMENT_ONGOING');
    });

    it('keeps the session unresolved after a provider timeout or 5xx', async () => {
        const fixture = build({ providerResult: {
            outcome: 'transient',
            reason_code: 'PAYMONGO_HTTP_503',
            reason: 'Provider temporarily unavailable.'
        } });
        const result = await fixture.run();

        expect(result.data.cancellation.outcome).toBe('unresolved');
        expect(fixture.row.status).toBe('awaiting_payment');
        expect(fixture.row.failure_code).toBe('PAYMONGO_HTTP_503');
    });

    it('preserves paid state when payment completes during the provider call', async () => {
        const paid = { ...BASE_SESSION, status: 'paid' };
        let reads = 0;
        const fixture = build({ findSessionImpl: async () => {
            reads += 1;
            return reads === 1 ? fixtureRow : paid;
        } });
        const fixtureRow = { ...BASE_SESSION };
        const result = await fixture.run();

        expect(result.data.cancellation.outcome).toBe('not_cancellable');
        expect(result.data.payment_session.status).toBe('paid');
        expect(fixture.repository.updateSessionById).not.toHaveBeenCalled();
    });

    it('returns 404 when the looked-up session belongs to another tenant', async () => {
        const fixture = build({ session: { tenant_id: '22222222-2222-4222-8222-222222222222' } });
        const result = await fixture.run();

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
        expect(fixture.paymongoService.cancelPaymentIntent).not.toHaveBeenCalled();
    });

    it('rejects a signed-in customer that does not own the session', async () => {
        const fixture = build({
            session: {
                checkout_payload: {
                    payment_type: 'card',
                    _verified_store_customer: { customer_id: 11, dgfy_account_id: 'account-11' }
                }
            }
        });
        const result = await fixture.run({
            storeCustomer: { customer_id: 12, dgfy_account_id: 'account-12' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.error.statusCode).toBe(403);
        expect(fixture.paymongoService.cancelPaymentIntent).not.toHaveBeenCalled();
        expect(fixture.repository.updateSessionById).not.toHaveBeenCalled();
    });

    it('cancels a created session locally when no provider object exists', async () => {
        const fixture = build({ session: {
            status: 'created',
            provider_payment_intent_id: null,
            provider_checkout_session_id: null
        } });
        const result = await fixture.run();

        expect(result.data.cancellation.outcome).toBe('cancelled');
        expect(fixture.row.status).toBe('cancelled');
        expect(fixture.paymongoService.cancelPaymentIntent).not.toHaveBeenCalled();
        expect(fixture.paymongoService.expireCheckoutSession).not.toHaveBeenCalled();
    });

    it('does not create an order or charge as a side effect', async () => {
        const fixture = build();
        await fixture.run();

        expect(fixture.repository.createOrder).not.toHaveBeenCalled();
        expect(fixture.repository.captureCharge).not.toHaveBeenCalled();
        expect(fixture.repository.createSession).not.toHaveBeenCalled();
    });
});
