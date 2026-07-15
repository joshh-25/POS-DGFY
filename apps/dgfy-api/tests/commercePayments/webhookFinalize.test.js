import { jest } from '@jest/globals';
import { buildHandleWebhookUseCase } from '../../src/modules/commercePayments/usecases/handleWebhookUseCases.js';
import {
    buildFinalizePaidOrderUseCase,
    buildExpireDueSessionsUseCase
} from '../../src/modules/commercePayments/usecases/finalizePaidOrderUseCases.js';
import { buildRetryFinalizationUseCase } from '../../src/modules/commercePayments/usecases/retryFinalizationUseCases.js';

// 10-08-PLAN.md Task 1 + Task 2 (TDD): the async, webhook-driven cross-
// database finalization seam (STF-05, D-04, ADR 0027 #8). A verified
// `payment.paid` event resolves the landlord session/tenant, invokes the
// storefront finalize path (10-07's finalizeStorefrontOrder, mocked here),
// and writes the tenant availment_id back to the durable landlord order —
// idempotently. A paid-but-unfinalizable order lands in
// finalize_failed_manual_resolution_required, never silently dropped.

const makeOrder = (overrides = {}) => ({
    id: 'order-uuid-1',
    public_reference: 'SFO-AAAAAAAAAA',
    tenant_id: 'biz-1',
    status: 'awaiting_payment',
    customer_account_id: null,
    guest_identity_id: 'guest-1',
    payment_method: 'gcash',
    fulfillment_mode: 'pickup',
    fulfillment_timing: 'immediate',
    requested_for: null,
    total_centavos: 24000,
    availment_id: null,
    checkout_payload: {
        lines: [
            { product_id: 1, name: 'Coffee', quantity: 2, unit_price_centavos: 12000, line_total_centavos: 24000 }
        ]
    },
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides
});

const makeSession = (overrides = {}) => ({
    id: 'session-uuid-1',
    public_reference: 'CPS-BBBBBBBBBB',
    storefront_order_id: 'order-uuid-1',
    tenant_id: 'biz-1',
    status: 'awaiting_payment',
    provider_payment_intent_id: 'pi_123',
    provider_payment_id: null,
    provider_event_id: null,
    finalized_at: null,
    availment_id: null,
    ...overrides
});

const makeOrderRepository = (overrides = {}) => ({
    findById: jest.fn(async () => makeOrder()),
    updateOrder: jest.fn(async () => ({})),
    findDueAwaitingPayment: jest.fn(async () => []),
    ...overrides
});

const makeSuccessfulFinalizeStorefrontOrder = (overrides = {}) => jest.fn(async () => ({
    isFailure: false,
    isSuccess: true,
    data: { availment: { id: 501 }, payment: { id: 900 }, idempotent: false }
}));

// ---------------------------------------------------------------------------
// buildFinalizePaidOrderUseCase (Task 2)
// ---------------------------------------------------------------------------

describe('buildFinalizePaidOrderUseCase', () => {
    it('throws when required deps are missing', () => {
        expect(() => buildFinalizePaidOrderUseCase({})).toThrow(/requires an orderRepository/);
        expect(() => buildFinalizePaidOrderUseCase({ orderRepository: {} })).toThrow(/requires an updateSessionStatus/);
        expect(() => buildFinalizePaidOrderUseCase({ orderRepository: {}, updateSessionStatus: jest.fn() })).toThrow(/requires a finalizeStorefrontOrder/);
    });

    it('finalizes a paid order: marks session paid, calls finalizeStorefrontOrder with server-side lines, writes availment_id back to BOTH order and session', async () => {
        const orderRepository = makeOrderRepository();
        const updateSessionStatus = jest.fn(async () => ({}));
        const finalizeStorefrontOrder = makeSuccessfulFinalizeStorefrontOrder();
        const useCase = buildFinalizePaidOrderUseCase({ orderRepository, updateSessionStatus, finalizeStorefrontOrder });

        const session = makeSession();
        const result = await useCase({ session, resource: { id: 'pay_abc', attributes: {} }, providerEventId: 'evt_1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data).toMatchObject({ status: 'finalized', availment_id: 501 });

        // Session marked paid FIRST (landlord-durable-first).
        expect(updateSessionStatus).toHaveBeenCalledWith(session.id, expect.objectContaining({ status: 'paid', provider_payment_id: 'pay_abc' }));

        // finalizeStorefrontOrder called with server-recomputed lines from checkout_payload.
        expect(finalizeStorefrontOrder).toHaveBeenCalledWith(expect.objectContaining({
            businessId: 'biz-1',
            sourceReference: 'SFO-AAAAAAAAAA',
            lines: [{ productId: 1, quantity: 2, unitPrice: '120.0000' }],
            totalCentavos: 24000,
            paymentMethod: 'gcash'
        }));

        // availment_id written back to the landlord order.
        expect(orderRepository.updateOrder).toHaveBeenCalledWith('order-uuid-1', { status: 'finalized', availment_id: 501 });
        // availment_id/finalized status also written back to the session.
        expect(updateSessionStatus).toHaveBeenCalledWith(session.id, expect.objectContaining({ status: 'finalized' }));
    });

    it('is idempotent: a session already finalized short-circuits without calling finalizeStorefrontOrder again (no second Availment)', async () => {
        const orderRepository = makeOrderRepository();
        const updateSessionStatus = jest.fn(async () => ({}));
        const finalizeStorefrontOrder = makeSuccessfulFinalizeStorefrontOrder();
        const useCase = buildFinalizePaidOrderUseCase({ orderRepository, updateSessionStatus, finalizeStorefrontOrder });

        const session = makeSession({ status: 'finalized' });
        const result = await useCase({ session });

        expect(result.isSuccess).toBe(true);
        expect(result.data.idempotent).toBe(true);
        expect(finalizeStorefrontOrder).not.toHaveBeenCalled();
        expect(orderRepository.findById).not.toHaveBeenCalled();
    });

    it('is idempotent when the ORDER (not the session) already shows finalized+availment_id — a duplicate webhook delivery never creates a second Availment', async () => {
        const orderRepository = makeOrderRepository({
            findById: jest.fn(async () => makeOrder({ status: 'finalized', availment_id: 777 }))
        });
        const updateSessionStatus = jest.fn(async () => ({}));
        const finalizeStorefrontOrder = makeSuccessfulFinalizeStorefrontOrder();
        const useCase = buildFinalizePaidOrderUseCase({ orderRepository, updateSessionStatus, finalizeStorefrontOrder });

        const session = makeSession({ status: 'paid' });
        const result = await useCase({ session });

        expect(result.isSuccess).toBe(true);
        expect(result.data).toMatchObject({ idempotent: true, availment_id: 777 });
        expect(finalizeStorefrontOrder).not.toHaveBeenCalled();
    });

    it('returns 404 when the order for this session cannot be found', async () => {
        const orderRepository = makeOrderRepository({ findById: jest.fn(async () => null) });
        const updateSessionStatus = jest.fn(async () => ({}));
        const finalizeStorefrontOrder = makeSuccessfulFinalizeStorefrontOrder();
        const useCase = buildFinalizePaidOrderUseCase({ orderRepository, updateSessionStatus, finalizeStorefrontOrder });

        const result = await useCase({ session: makeSession() });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(404);
    });

    it('a finalizeStorefrontOrder FAILURE result lands the order+session in finalize_failed_manual_resolution_required — never silent', async () => {
        const orderRepository = makeOrderRepository();
        const updateSessionStatus = jest.fn(async () => ({}));
        const finalizeStorefrontOrder = jest.fn(async () => ({
            isFailure: true,
            isSuccess: false,
            error: { message: 'Insufficient stock at finalize time.' }
        }));
        const useCase = buildFinalizePaidOrderUseCase({ orderRepository, updateSessionStatus, finalizeStorefrontOrder });

        const result = await useCase({ session: makeSession() });

        expect(result.isFailure).toBe(true);
        expect(orderRepository.updateOrder).toHaveBeenCalledWith('order-uuid-1', { status: 'finalize_failed_manual_resolution_required' });
        expect(updateSessionStatus).toHaveBeenCalledWith('session-uuid-1', expect.objectContaining({
            status: 'finalize_failed_manual_resolution_required',
            manual_resolution_reason: expect.stringContaining('Insufficient stock')
        }));
    });

    it('a finalizeStorefrontOrder THROW also lands the order+session in finalize_failed_manual_resolution_required, then re-throws (never silent)', async () => {
        const orderRepository = makeOrderRepository();
        const updateSessionStatus = jest.fn(async () => ({}));
        const finalizeStorefrontOrder = jest.fn(async () => { throw new Error('tenant DB connection lost mid-transaction'); });
        const useCase = buildFinalizePaidOrderUseCase({ orderRepository, updateSessionStatus, finalizeStorefrontOrder });

        await expect(useCase({ session: makeSession() })).rejects.toThrow('tenant DB connection lost mid-transaction');

        expect(orderRepository.updateOrder).toHaveBeenCalledWith('order-uuid-1', { status: 'finalize_failed_manual_resolution_required' });
        expect(updateSessionStatus).toHaveBeenCalledWith('session-uuid-1', expect.objectContaining({
            status: 'finalize_failed_manual_resolution_required'
        }));
    });
});

// ---------------------------------------------------------------------------
// buildExpireDueSessionsUseCase (Task 2, D-09 sweep — T-10-08-07)
// ---------------------------------------------------------------------------

describe('buildExpireDueSessionsUseCase', () => {
    it('releases the reservation + expires BOTH the order and its paired session for every due order', async () => {
        const dueOrder = makeOrder({ id: 'order-due-1', public_reference: 'SFO-DUE0000001', status: 'awaiting_payment' });
        const orderRepository = makeOrderRepository({
            findDueAwaitingPayment: jest.fn(async () => [dueOrder]),
            updateOrder: jest.fn(async () => ({}))
        });
        const pairedSession = makeSession({ id: 'session-due-1', storefront_order_id: 'order-due-1', status: 'awaiting_payment' });
        const commercePaymentRepository = {
            findSessionByStorefrontOrderId: jest.fn(async () => pairedSession),
            updateSessionStatus: jest.fn(async () => ({}))
        };
        const releaseReservation = jest.fn(async () => 1);
        const useCase = buildExpireDueSessionsUseCase({ orderRepository, commercePaymentRepository, releaseReservation });

        const result = await useCase(new Date());

        expect(result.expired_count).toBe(1);
        expect(releaseReservation).toHaveBeenCalledWith('biz-1', 'SFO-DUE0000001');
        expect(orderRepository.updateOrder).toHaveBeenCalledWith('order-due-1', { status: 'expired' });
        expect(commercePaymentRepository.updateSessionStatus).toHaveBeenCalledWith('session-due-1', expect.objectContaining({ status: 'expired' }));
    });

    it('MISSED-WEBHOOK PATH: an expired session that never received a qrph.expired webhook is still reclaimed by the sweep alone', async () => {
        // Simulates: order placed, PayMongo session created, customer never
        // pays, PayMongo's qrph.expired webhook is never delivered (network
        // blip, PayMongo outage, whatever) — the ONLY thing that reclaims
        // the stock is this sweep running on its own schedule.
        const staleOrder = makeOrder({
            id: 'order-missed-webhook',
            public_reference: 'SFO-MISSEDHOOK1',
            status: 'awaiting_payment',
            expires_at: new Date(Date.now() - 60 * 60 * 1000) // 1 hour past expiry
        });
        const orderRepository = makeOrderRepository({
            findDueAwaitingPayment: jest.fn(async (now) => [staleOrder]),
            updateOrder: jest.fn(async () => ({}))
        });
        const commercePaymentRepository = {
            // No webhook was ever delivered — session is STILL awaiting_payment.
            findSessionByStorefrontOrderId: jest.fn(async () => makeSession({ id: 'session-missed-webhook', storefront_order_id: 'order-missed-webhook', status: 'awaiting_payment' })),
            updateSessionStatus: jest.fn(async () => ({}))
        };
        const releaseReservation = jest.fn(async () => 1);
        const useCase = buildExpireDueSessionsUseCase({ orderRepository, commercePaymentRepository, releaseReservation });

        const result = await useCase();

        expect(result.expired_count).toBe(1);
        expect(releaseReservation).toHaveBeenCalledWith('biz-1', 'SFO-MISSEDHOOK1');
        expect(orderRepository.updateOrder).toHaveBeenCalledWith('order-missed-webhook', { status: 'expired' });
        expect(commercePaymentRepository.updateSessionStatus).toHaveBeenCalledWith('session-missed-webhook', expect.objectContaining({ status: 'expired' }));
    });

    it('never marks an already-finalized session as expired (race guard: payment.paid arrived just as the sweep ran)', async () => {
        const dueOrder = makeOrder({ id: 'order-race-1', public_reference: 'SFO-RACE0000001' });
        const orderRepository = makeOrderRepository({ findDueAwaitingPayment: jest.fn(async () => [dueOrder]) });
        const commercePaymentRepository = {
            findSessionByStorefrontOrderId: jest.fn(async () => makeSession({ status: 'finalized' })),
            updateSessionStatus: jest.fn(async () => ({}))
        };
        const releaseReservation = jest.fn(async () => 1);
        const useCase = buildExpireDueSessionsUseCase({ orderRepository, commercePaymentRepository, releaseReservation });

        await useCase();

        expect(commercePaymentRepository.updateSessionStatus).not.toHaveBeenCalled();
    });

    it('skips (does not mark expired) an order whose release fails, so the next sweep pass can retry it', async () => {
        const dueOrder = makeOrder({ id: 'order-release-fail' });
        const orderRepository = makeOrderRepository({ findDueAwaitingPayment: jest.fn(async () => [dueOrder]) });
        const commercePaymentRepository = { findSessionByStorefrontOrderId: jest.fn(), updateSessionStatus: jest.fn() };
        const releaseReservation = jest.fn(async () => { throw new Error('tenant DB unreachable'); });
        const useCase = buildExpireDueSessionsUseCase({ orderRepository, commercePaymentRepository, releaseReservation });

        const result = await useCase();

        expect(result.expired_count).toBe(0);
        expect(orderRepository.updateOrder).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// buildRetryFinalizationUseCase (Task 2, T-10-08-05)
// ---------------------------------------------------------------------------

describe('buildRetryFinalizationUseCase', () => {
    it('re-runs finalizePaidOrder for a paid session', async () => {
        const session = makeSession({ status: 'paid' });
        const findSessionByPublicReference = jest.fn(async () => session);
        const finalizePaidOrder = jest.fn(async () => ({ isSuccess: true, isFailure: false, data: { status: 'finalized' } }));
        const useCase = buildRetryFinalizationUseCase({ findSessionByPublicReference, finalizePaidOrder });

        const result = await useCase({ sessionReference: 'CPS-BBBBBBBBBB' });

        expect(result.isSuccess).toBe(true);
        expect(finalizePaidOrder).toHaveBeenCalledWith(expect.objectContaining({ session }));
    });

    it('re-runs finalizePaidOrder for a finalize_failed_manual_resolution_required session (the operator recovery path)', async () => {
        const session = makeSession({ status: 'finalize_failed_manual_resolution_required' });
        const findSessionByPublicReference = jest.fn(async () => session);
        const finalizePaidOrder = jest.fn(async () => ({ isSuccess: true, isFailure: false, data: { status: 'finalized' } }));
        const useCase = buildRetryFinalizationUseCase({ findSessionByPublicReference, finalizePaidOrder });

        const result = await useCase({ sessionReference: session.public_reference });

        expect(result.isSuccess).toBe(true);
    });

    it('rejects 404 for an unknown session reference', async () => {
        const findSessionByPublicReference = jest.fn(async () => null);
        const finalizePaidOrder = jest.fn();
        const useCase = buildRetryFinalizationUseCase({ findSessionByPublicReference, finalizePaidOrder });

        const result = await useCase({ sessionReference: 'CPS-UNKNOWN0X' });

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(404);
    });

    it('rejects 409 for a non-retryable status (e.g. awaiting_payment — never paid yet)', async () => {
        const session = makeSession({ status: 'awaiting_payment' });
        const findSessionByPublicReference = jest.fn(async () => session);
        const finalizePaidOrder = jest.fn();
        const useCase = buildRetryFinalizationUseCase({ findSessionByPublicReference, finalizePaidOrder });

        const result = await useCase({ sessionReference: session.public_reference });

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(409);
        expect(finalizePaidOrder).not.toHaveBeenCalled();
    });

    it('rejects 403 when the actor is not an active staff/owner member of the session tenant (T-10-08-05)', async () => {
        const session = makeSession({ status: 'paid' });
        const findSessionByPublicReference = jest.fn(async () => session);
        const finalizePaidOrder = jest.fn();
        const businessRepository = { getMembership: jest.fn(async () => null) };
        const useCase = buildRetryFinalizationUseCase({ findSessionByPublicReference, finalizePaidOrder, businessRepository });

        const result = await useCase({ sessionReference: session.public_reference, actorAccountId: 'acct-not-a-member' });

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(403);
        expect(finalizePaidOrder).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// buildHandleWebhookUseCase (Task 1) — signature gate, event routing.
// ---------------------------------------------------------------------------

const makeWebhookDeps = (overrides = {}) => ({
    verifyWebhookSignature: jest.fn(() => true),
    findSessionByPublicReference: jest.fn(async () => null),
    findSessionByProviderPaymentIntent: jest.fn(async () => makeSession()),
    findSessionByProviderPayment: jest.fn(async () => null),
    updateSessionStatus: jest.fn(async () => ({})),
    orderRepository: makeOrderRepository(),
    releaseReservation: jest.fn(async () => 1),
    finalizePaidOrder: jest.fn(async () => ({ isSuccess: true, isFailure: false, data: { status: 'finalized' } })),
    ...overrides
});

const paidBody = () => ({
    data: {
        id: 'evt_1',
        attributes: {
            type: 'payment.paid',
            data: {
                id: 'pay_abc',
                attributes: { payment_intent_id: 'pi_123' }
            }
        }
    }
});

describe('buildHandleWebhookUseCase', () => {
    it('throws when required deps are missing', () => {
        expect(() => buildHandleWebhookUseCase({})).toThrow(/verifyWebhookSignature/);
    });

    it('returns 401 and does ZERO DB work when the signature is invalid — signature gate runs BEFORE any DB read (Pitfall 1, T-10-08-01)', async () => {
        const deps = makeWebhookDeps({ verifyWebhookSignature: jest.fn(() => false) });
        const useCase = buildHandleWebhookUseCase(deps);

        const result = await useCase({ rawBody: 'tampered', signatureHeader: 'bad', body: paidBody() });

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(401);
        expect(deps.findSessionByPublicReference).not.toHaveBeenCalled();
        expect(deps.findSessionByProviderPaymentIntent).not.toHaveBeenCalled();
        expect(deps.finalizePaidOrder).not.toHaveBeenCalled();
    });

    it('verifies the signature over the EXACT rawBody + signatureHeader passed in', async () => {
        const deps = makeWebhookDeps();
        const useCase = buildHandleWebhookUseCase(deps);

        await useCase({ rawBody: '{"exact":"bytes"}', signatureHeader: 't=1,te=abc', body: paidBody() });

        expect(deps.verifyWebhookSignature).toHaveBeenCalledWith({ rawBody: '{"exact":"bytes"}', signatureHeader: 't=1,te=abc' });
    });

    it('ignores account.*/refund.* events with a 200 handled:false — never acted upon (D-02/D-03)', async () => {
        const deps = makeWebhookDeps();
        const useCase = buildHandleWebhookUseCase(deps);

        const refundBody = { data: { attributes: { type: 'payment.refunded', data: {} } } };
        const result = await useCase({ rawBody: 'x', signatureHeader: 'y', body: refundBody });

        expect(result.isSuccess).toBe(true);
        expect(result.data).toMatchObject({ handled: false, reason: 'event_type_ignored' });
        expect(deps.findSessionByProviderPaymentIntent).not.toHaveBeenCalled();
    });

    it('returns 200 handled:false when no session can be resolved for a verified event', async () => {
        const deps = makeWebhookDeps({
            findSessionByProviderPaymentIntent: jest.fn(async () => null)
        });
        const useCase = buildHandleWebhookUseCase(deps);

        const result = await useCase({ rawBody: 'x', signatureHeader: 'y', body: paidBody() });

        expect(result.isSuccess).toBe(true);
        expect(result.data).toMatchObject({ handled: false, reason: 'session_not_found' });
    });

    it('routes payment.paid to finalizePaidOrder and returns its status', async () => {
        const session = makeSession();
        const deps = makeWebhookDeps({
            findSessionByProviderPaymentIntent: jest.fn(async () => session),
            finalizePaidOrder: jest.fn(async () => ({ isSuccess: true, isFailure: false, data: { status: 'finalized' } }))
        });
        const useCase = buildHandleWebhookUseCase(deps);

        const result = await useCase({ rawBody: 'x', signatureHeader: 'y', body: paidBody() });

        expect(result.isSuccess).toBe(true);
        expect(result.data).toMatchObject({ handled: true, status: 'finalized', payment_session: session.public_reference });
        expect(deps.finalizePaidOrder).toHaveBeenCalledWith(expect.objectContaining({ session, providerEventId: 'evt_1' }));
    });

    it('a duplicate payment.paid delivery is a safe no-op (finalizePaidOrder itself is idempotent, tested above) — the webhook layer does not add its own dedup logic', async () => {
        const session = makeSession();
        const deps = makeWebhookDeps({
            findSessionByProviderPaymentIntent: jest.fn(async () => session),
            finalizePaidOrder: jest.fn(async () => ({ isSuccess: true, isFailure: false, data: { status: 'finalized', idempotent: true } }))
        });
        const useCase = buildHandleWebhookUseCase(deps);

        const first = await useCase({ rawBody: 'x', signatureHeader: 'y', body: paidBody() });
        const second = await useCase({ rawBody: 'x', signatureHeader: 'y', body: paidBody() });

        expect(first.isSuccess).toBe(true);
        expect(second.isSuccess).toBe(true);
        expect(deps.finalizePaidOrder).toHaveBeenCalledTimes(2);
    });

    it('qrph.expired releases the reservation and moves BOTH order and session to expired (D-09)', async () => {
        const session = makeSession();
        const order = makeOrder();
        const orderRepository = makeOrderRepository({ findById: jest.fn(async () => order) });
        const deps = makeWebhookDeps({
            findSessionByProviderPaymentIntent: jest.fn(async () => session),
            orderRepository
        });
        const useCase = buildHandleWebhookUseCase(deps);

        const expiredBody = { data: { attributes: { type: 'qrph.expired', data: { id: 'x', attributes: { payment_intent_id: 'pi_123' } } } } };
        const result = await useCase({ rawBody: 'x', signatureHeader: 'y', body: expiredBody });

        expect(result.isSuccess).toBe(true);
        expect(result.data).toMatchObject({ handled: true, status: 'expired' });
        expect(deps.releaseReservation).toHaveBeenCalledWith(order.tenant_id, order.public_reference);
        expect(orderRepository.updateOrder).toHaveBeenCalledWith(order.id, { status: 'expired' });
        expect(deps.updateSessionStatus).toHaveBeenCalledWith(session.id, expect.objectContaining({ status: 'expired' }));
    });

    it('payment.failed releases the reservation and moves BOTH order and session to failed', async () => {
        const session = makeSession();
        const order = makeOrder();
        const orderRepository = makeOrderRepository({ findById: jest.fn(async () => order) });
        const deps = makeWebhookDeps({
            findSessionByProviderPaymentIntent: jest.fn(async () => session),
            orderRepository
        });
        const useCase = buildHandleWebhookUseCase(deps);

        const failedBody = { data: { attributes: { type: 'payment.failed', data: { id: 'x', attributes: { payment_intent_id: 'pi_123', failed_message: 'card declined' } } } } };
        const result = await useCase({ rawBody: 'x', signatureHeader: 'y', body: failedBody });

        expect(result.isSuccess).toBe(true);
        expect(result.data).toMatchObject({ handled: true, status: 'failed' });
        expect(deps.releaseReservation).toHaveBeenCalledWith(order.tenant_id, order.public_reference);
        expect(orderRepository.updateOrder).toHaveBeenCalledWith(order.id, { status: 'failed' });
    });

    it('session resolution falls through metadata reference -> payment_intent id -> payment id in order', async () => {
        const session = makeSession();
        const deps = makeWebhookDeps({
            findSessionByPublicReference: jest.fn(async () => null),
            findSessionByProviderPaymentIntent: jest.fn(async () => null),
            findSessionByProviderPayment: jest.fn(async () => session)
        });
        const useCase = buildHandleWebhookUseCase(deps);

        const bodyNoIntent = { data: { attributes: { type: 'payment.paid', data: { id: 'pay_abc', attributes: {} } } } };
        const result = await useCase({ rawBody: 'x', signatureHeader: 'y', body: bodyNoIntent });

        expect(result.isSuccess).toBe(true);
        expect(deps.findSessionByProviderPayment).toHaveBeenCalledWith('pay_abc');
    });
});
