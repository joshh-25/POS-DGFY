import { jest } from '@jest/globals';
import { ApplicationResult } from '../../src/shared/contracts/applicationResult.js';
import { buildSearchDiscoveryUseCase } from '../../src/modules/storefront/usecases/searchDiscoveryUseCases.js';
import { buildGetStorePageUseCase } from '../../src/modules/storefront/usecases/getStorePageUseCases.js';
import { buildValidateCartUseCase } from '../../src/modules/storefront/usecases/cartValidation.js';
import { buildGuestCheckoutUseCases } from '../../src/modules/storefront/usecases/guestCheckoutUseCases.js';
import { buildPlaceOrderUseCase } from '../../src/modules/storefront/usecases/placeOrderUseCases.js';
import { buildGetOrderStatusUseCase } from '../../src/modules/storefront/usecases/getOrderStatusUseCases.js';
import { buildCreateQrphSessionUseCase } from '../../src/modules/commercePayments/usecases/createQrphSessionUseCases.js';
import { buildHandleWebhookUseCase } from '../../src/modules/commercePayments/usecases/handleWebhookUseCases.js';
import { buildFinalizePaidOrderUseCase, buildExpireDueSessionsUseCase } from '../../src/modules/commercePayments/usecases/finalizePaidOrderUseCases.js';

// storefrontE2E.test.js — 10-08-PLAN.md Task 3 (STF-01..STF-05). Drives the
// FULL storefront flow through the real use-case builders (never the
// composition root's concrete Sequelize/PayMongo/TenantConnector adapters —
// PayMongo and the tenant/landlord "databases" are lightweight in-memory
// fakes here, mirroring every other unit-level test in this codebase, e.g.
// placeOrder.test.js/webhookFinalize.test.js's mocked-collaborator
// convention): discovery -> store page -> validate cart -> guest OTP verify
// -> placeOrder (QR path) -> a verified `payment.paid` webhook -> asserts
// ONE tenant Availment finalized, availment_id written back to the landlord
// order+session, the reservation committed, and that a DUPLICATE webhook
// delivery produces no second Availment (T-10-08-02, STF-05's core claim).
//
// Every fake below implements ONLY the exact method surface the real
// repository/client classes expose (same signatures, same return shapes) —
// this test exercises the SAME orchestration code the composition root
// wires in apps/dgfy-api/src/routes/index.js, just with in-memory
// collaborators instead of MySQL/Redis/a real PayMongo HTTP call.

const NOW = new Date('2026-07-14T09:00:00.000Z');
const BUSINESS_ID = 'biz-e2e-0001';

// ---- Tenant catalog (Phase 8's productRepository shape) -------------------
const makeProductRepository = () => {
    const catalog = {
        [BUSINESS_ID]: [
            { id: 1, name: 'Iced Latte', category: 'beverage', base_price: '120.00', is_active: true, folder_id: null }
        ]
    };
    return {
        findById: jest.fn(async (businessId, productId) => (
            (catalog[businessId] || []).find((p) => p.id === Number(productId)) || null
        )),
        findAll: jest.fn(async (businessId) => catalog[businessId] || [])
    };
};

// ---- Landlord discovery projection (10-01/10-03) ---------------------------
const makeDiscoveryRepository = () => ({
    searchNearby: jest.fn(async () => ([
        { handle: 'the-coffee-shop', display_name: 'The Coffee Shop', distance_km: 0.4 }
    ])),
    getStoreByHandle: jest.fn(async (handle) => (
        handle === 'the-coffee-shop'
            ? {
                handle: 'the-coffee-shop',
                display_name: 'The Coffee Shop',
                business_id: BUSINESS_ID,
                is_visible: true,
                latitude: 14.6,
                longitude: 121.0
            }
            : null
    ))
});

// ---- Guest OTP identity (10-04) --------------------------------------------
const makeEmailOtp = () => ({
    EMAIL_OTP_PURPOSES: { STOREFRONT_GUEST_CHECKOUT: 'storefront_guest_checkout' },
    requestEmailOtp: jest.fn(async ({ email }) => ({
        otp_id: 'otp-e2e-1', purpose: 'storefront_guest_checkout', email, expires_at: new Date(), delivery_status: 'sent'
    })),
    verifyEmailOtp: jest.fn(async () => true)
});

const makeGuestIdentityRepository = () => ({
    upsertByVerifiedEmail: jest.fn(async () => 'guest-e2e-0001'),
    findByEmail: jest.fn(async (email) => (email === 'buyer@example.com' ? { id: 'guest-e2e-0001' } : null))
});

// ---- Landlord storefront_orders (10-06) ------------------------------------
function makeInMemoryOrderRepository() {
    const byId = new Map();
    const byIdempotency = new Map();
    const byPublicReference = new Map();
    let counter = 0;

    return {
        async createOrder(payload) {
            counter += 1;
            const row = { id: `order-e2e-${counter}`, created_at: NOW, updated_at: NOW, ...payload };
            byId.set(row.id, row);
            byIdempotency.set(`${row.tenant_id}:${row.target_type}:${row.idempotency_key}`, row);
            byPublicReference.set(row.public_reference, row);
            return row;
        },
        async findByIdempotency({ tenant_id, target_type = 'storefront_checkout', idempotency_key }) {
            return byIdempotency.get(`${tenant_id}:${target_type}:${idempotency_key}`) || null;
        },
        async updateOrder(id, patch) {
            const row = byId.get(id);
            if (!row) return null;
            Object.assign(row, patch, { updated_at: new Date() });
            return { ...row };
        },
        async findByPublicReference(publicReference) {
            return byPublicReference.get(publicReference) || null;
        },
        async findById(id) {
            return byId.get(id) || null;
        },
        async findDueAwaitingPayment(now) {
            return [...byId.values()].filter((row) => row.status === 'awaiting_payment' && row.expires_at && row.expires_at <= now);
        }
    };
}

// ---- Landlord commerce_payment_sessions (10-05) ----------------------------
function makeInMemorySessionRepository() {
    const byId = new Map();
    const byPublicReference = new Map();
    const byIntent = new Map();
    let counter = 0;

    return {
        async createSession(payload) {
            counter += 1;
            const row = {
                id: `session-e2e-${counter}`,
                public_reference: `CPS-E2ETEST${counter}`,
                status: 'awaiting_payment',
                provider: 'paymongo',
                provider_payment_id: null,
                paid_at: null,
                finalized_at: null,
                manual_resolution_reason: null,
                ...payload
            };
            byId.set(row.id, row);
            byPublicReference.set(row.public_reference, row);
            if (row.provider_payment_intent_id) byIntent.set(row.provider_payment_intent_id, row);
            return row;
        },
        async findSessionByPublicReference(reference) {
            return byPublicReference.get(reference) || null;
        },
        async findSessionByProviderPaymentIntent(id) {
            return byIntent.get(id) || null;
        },
        async findSessionByProviderPayment() {
            return null;
        },
        async findSessionByStorefrontOrderId(orderId) {
            return [...byId.values()].find((row) => row.storefront_order_id === orderId) || null;
        },
        async updateSessionStatus(id, patch) {
            const row = byId.get(id);
            if (!row) return null;
            Object.assign(row, patch);
            return { ...row };
        }
    };
}

// ---- PayMongo (mocked HTTP dance + signature — always verified true here,
// signature verification itself is exhaustively covered in
// payMongoClient.test.js/webhookFinalize.test.js, out of THIS test's scope) -
const makePayMongoClient = () => ({
    createQrphPaymentIntent: jest.fn(async () => ({
        paymentIntentId: 'pi_e2e_0001',
        paymentMethodId: 'pm_e2e_0001',
        qrCodeImageUrl: 'https://paymongo.example/qr/pi_e2e_0001.png',
        expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000)
    })),
    verifyWebhookSignature: jest.fn(() => true)
});

// ---- Tenant inventory reservations (10-02) ---------------------------------
function makeReservationPorts() {
    const byReferenceId = new Map();
    return {
        reserveStock: jest.fn(async ({ lines, referenceId, expiresAt }) => {
            byReferenceId.set(referenceId, lines.map((line) => ({ ...line, status: 'active', expiresAt })));
            return { reservations: byReferenceId.get(referenceId) };
        }),
        releaseReservation: jest.fn(async (businessId, referenceId) => {
            const rows = byReferenceId.get(referenceId) || [];
            rows.forEach((row) => { row.status = 'released'; });
            return rows.length;
        }),
        setReservationExpiry: jest.fn(async (businessId, referenceId, expiresAt) => {
            const rows = byReferenceId.get(referenceId) || [];
            rows.forEach((row) => { row.expiresAt = expiresAt; });
            return rows.length;
        }),
        commitReservation: jest.fn(async ({ referenceId }) => {
            const rows = byReferenceId.get(referenceId) || [];
            rows.forEach((row) => { row.status = 'committed'; });
            return { success: true };
        }),
        statusesFor: (referenceId) => (byReferenceId.get(referenceId) || []).map((row) => row.status)
    };
}

// ---- Tenant Availment finalize (10-07's finalizeStorefrontOrder, the seam
// this plan's finalizePaidOrder calls) — simulates ITS OWN idempotency
// guard (row-locked lookup by source_reference, UNIQUE index) exactly as
// 10-07-SUMMARY.md documents, so the E2E test proves the SAME
// double-Availment guard the real repository enforces.
function makeFinalizeStorefrontOrder({ commitReservation }) {
    const bySourceReference = new Map();
    let nextAvailmentId = 500;

    const fn = jest.fn(async ({ businessId, sourceReference, customerAccountId, lines, totalCentavos, paymentMethod, paymentReference }) => {
        const existing = bySourceReference.get(sourceReference);
        if (existing) {
            return ApplicationResult.success({ availment: existing, payment: { id: existing.payment_id }, idempotent: true });
        }

        const commitResult = await commitReservation({ businessId, referenceId: sourceReference });
        if (!commitResult?.success) {
            return ApplicationResult.failure(new Error('commitReservation failed for source_reference ' + sourceReference));
        }

        nextAvailmentId += 1;
        const availment = {
            id: nextAvailmentId,
            business_id: businessId,
            source_reference: sourceReference,
            customer_account_id: customerAccountId,
            payment_id: nextAvailmentId,
            total_amount: totalCentavos,
            payment_method: paymentMethod,
            payment_reference: paymentReference
        };
        bySourceReference.set(sourceReference, availment);
        return ApplicationResult.success({ availment, payment: { id: availment.payment_id }, idempotent: false });
    });

    return { fn, bySourceReference };
}

describe('storefront E2E: discovery -> checkout -> webhook finalize (STF-01..STF-05)', () => {
    let productRepository;
    let discoveryRepository;
    let guestIdentityRepository;
    let emailOtp;
    let orderRepository;
    let sessionRepository;
    let payMongoClient;
    let reservationPorts;
    let finalizeStorefrontOrder;

    let searchDiscovery;
    let getStorePage;
    let validateCart;
    let verifyGuestOtp;
    let resolveCheckoutIdentity;
    let placeOrder;
    let getOrderStatus;
    let createQrphSession;
    let finalizePaidOrder;
    let handleWebhook;
    let expireDueSessions;

    beforeEach(() => {
        productRepository = makeProductRepository();
        discoveryRepository = makeDiscoveryRepository();
        guestIdentityRepository = makeGuestIdentityRepository();
        emailOtp = makeEmailOtp();
        orderRepository = makeInMemoryOrderRepository();
        sessionRepository = makeInMemorySessionRepository();
        payMongoClient = makePayMongoClient();
        reservationPorts = makeReservationPorts();
        finalizeStorefrontOrder = makeFinalizeStorefrontOrder({ commitReservation: reservationPorts.commitReservation });

        searchDiscovery = buildSearchDiscoveryUseCase({ repository: discoveryRepository });
        getStorePage = buildGetStorePageUseCase({ repository: discoveryRepository, productRepository });
        validateCart = buildValidateCartUseCase({ productRepository });
        ({ verifyGuestOtp, resolveCheckoutIdentity } = buildGuestCheckoutUseCases({ guestIdentityRepository, emailOtp }));

        createQrphSession = buildCreateQrphSessionUseCase({
            payMongoClient,
            repository: sessionRepository,
            checkQrphConfig: () => ({ configured: true, missing: [] })
        });

        placeOrder = buildPlaceOrderUseCase({
            validateCart,
            resolveCheckoutIdentity,
            orderRepository,
            reserveStock: reservationPorts.reserveStock,
            releaseReservation: reservationPorts.releaseReservation,
            setReservationExpiry: reservationPorts.setReservationExpiry,
            createQrphSession,
            finalizeCashOrder: finalizeStorefrontOrder.fn,
            now: NOW
        });

        getOrderStatus = buildGetOrderStatusUseCase({ orderRepository, guestIdentityRepository });

        finalizePaidOrder = buildFinalizePaidOrderUseCase({
            orderRepository,
            updateSessionStatus: sessionRepository.updateSessionStatus,
            finalizeStorefrontOrder: finalizeStorefrontOrder.fn
        });

        handleWebhook = buildHandleWebhookUseCase({
            verifyWebhookSignature: payMongoClient.verifyWebhookSignature,
            findSessionByPublicReference: sessionRepository.findSessionByPublicReference,
            findSessionByProviderPaymentIntent: sessionRepository.findSessionByProviderPaymentIntent,
            findSessionByProviderPayment: sessionRepository.findSessionByProviderPayment,
            updateSessionStatus: sessionRepository.updateSessionStatus,
            orderRepository,
            releaseReservation: reservationPorts.releaseReservation,
            finalizePaidOrder
        });

        expireDueSessions = buildExpireDueSessionsUseCase({
            orderRepository,
            commercePaymentRepository: sessionRepository,
            releaseReservation: reservationPorts.releaseReservation
        });
    });

    const paidWebhookBody = (paymentIntentId) => ({
        data: {
            id: 'evt_e2e_1',
            attributes: {
                type: 'payment.paid',
                data: {
                    id: 'pay_e2e_0001',
                    attributes: { payment_intent_id: paymentIntentId }
                }
            }
        }
    });

    it('drives browse -> checkout -> webhook-finalize and proves single-Availment idempotency', async () => {
        // 1. Discovery: find the store nearby.
        const discoveryResult = await searchDiscovery({ lat: 14.6, lng: 121.0 });
        expect(discoveryResult.isSuccess).toBe(true);
        expect(discoveryResult.data.stores).toEqual([
            expect.objectContaining({ handle: 'the-coffee-shop' })
        ]);

        // 2. Store page: browse the product listing.
        const storePageResult = await getStorePage({ handle: 'the-coffee-shop' });
        expect(storePageResult.isSuccess).toBe(true);
        expect(storePageResult.data.store.handle).toBe('the-coffee-shop');
        expect(storePageResult.data.products).toEqual([
            expect.objectContaining({ id: 1, name: 'Iced Latte' })
        ]);

        // 3. Validate cart: server re-prices from the tenant catalog.
        const cartResult = await validateCart({ businessId: BUSINESS_ID, lines: [{ productId: 1, quantity: 2 }] });
        expect(cartResult.isSuccess).toBe(true);
        expect(cartResult.data.totalCentavos).toBe(24000);

        // 4. Guest OTP verify: resolves a persistent guest identity.
        const otpResult = await verifyGuestOtp({ email: 'buyer@example.com', code: '123456' });
        expect(otpResult.isSuccess).toBe(true);
        expect(otpResult.data.guest_identity_id).toBe('guest-e2e-0001');

        // 5. placeOrder — QR Ph (gcash) path: durable order -> reserve -> session.
        const placeOrderResult = await placeOrder({
            businessId: BUSINESS_ID,
            idempotencyKey: 'e2e-idem-key-0001',
            guestIdentityId: otpResult.data.guest_identity_id,
            lines: [{ productId: 1, quantity: 2 }],
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'immediate',
            paymentMethod: 'gcash',
            contact: { name: 'E2E Buyer', phone: '09171234567' },
            now: NOW
        });

        expect(placeOrderResult.isSuccess).toBe(true);
        expect(placeOrderResult.data.status).toBe('awaiting_payment');
        expect(placeOrderResult.data.qr_code_image_url).toBe('https://paymongo.example/qr/pi_e2e_0001.png');
        const orderReference = placeOrderResult.data.order_reference;

        const orderAfterPlacement = await orderRepository.findByPublicReference(orderReference);
        expect(orderAfterPlacement.status).toBe('awaiting_payment');
        expect(reservationPorts.statusesFor(orderReference)).toEqual(['active']);

        const statusAfterPlacement = await getOrderStatus({ reference: orderReference, requesterEmail: 'buyer@example.com' });
        expect(statusAfterPlacement.data.status).toBe('awaiting_payment');

        // 6. A verified `payment.paid` webhook arrives (resolved by
        // provider_payment_intent_id, since PayMongo's metadata reference
        // resolution is exercised separately in webhookFinalize.test.js).
        const webhookResult = await handleWebhook({
            rawBody: JSON.stringify(paidWebhookBody('pi_e2e_0001')),
            signatureHeader: 't=1,te=deadbeef',
            body: paidWebhookBody('pi_e2e_0001')
        });

        expect(webhookResult.isSuccess).toBe(true);
        expect(webhookResult.data).toMatchObject({ handled: true, status: 'finalized' });

        // ---- Assert: ONE tenant Availment finalized, availment_id written
        // back to BOTH the landlord order and session, reservation committed.
        expect(finalizeStorefrontOrder.bySourceReference.size).toBe(1);
        const [availment] = [...finalizeStorefrontOrder.bySourceReference.values()];
        expect(availment.source_reference).toBe(orderReference);

        const orderAfterFinalize = await orderRepository.findByPublicReference(orderReference);
        expect(orderAfterFinalize.status).toBe('finalized');
        expect(orderAfterFinalize.availment_id).toBe(availment.id);

        const sessionAfterFinalize = await sessionRepository.findSessionByProviderPaymentIntent('pi_e2e_0001');
        expect(sessionAfterFinalize.status).toBe('finalized');

        expect(reservationPorts.statusesFor(orderReference)).toEqual(['committed']);

        const statusAfterFinalize = await getOrderStatus({ reference: orderReference, requesterEmail: 'buyer@example.com' });
        expect(statusAfterFinalize.data.status).toBe('finalized');

        // 7. DUPLICATE `payment.paid` delivery (PayMongo redelivery, T-10-08-02):
        // no second Availment, no second commitReservation call.
        const duplicateWebhookResult = await handleWebhook({
            rawBody: JSON.stringify(paidWebhookBody('pi_e2e_0001')),
            signatureHeader: 't=1,te=deadbeef',
            body: paidWebhookBody('pi_e2e_0001')
        });

        expect(duplicateWebhookResult.isSuccess).toBe(true);
        expect(finalizeStorefrontOrder.bySourceReference.size).toBe(1);
        expect(reservationPorts.commitReservation).toHaveBeenCalledTimes(1);
        expect(finalizeStorefrontOrder.fn).toHaveBeenCalledTimes(1);
    });

    it('missed-webhook path: expireDueSessions reclaims a NEVER-paid order that PayMongo never sent qrph.expired for (D-09)', async () => {
        const placeOrderResult = await placeOrder({
            businessId: BUSINESS_ID,
            idempotencyKey: 'e2e-idem-key-0002',
            guestIdentityId: 'guest-e2e-0001',
            lines: [{ productId: 1, quantity: 1 }],
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'immediate',
            paymentMethod: 'gcash',
            contact: { name: 'E2E Buyer 2', phone: '09171234567' },
            now: NOW
        });
        expect(placeOrderResult.isSuccess).toBe(true);
        const orderReference = placeOrderResult.data.order_reference;

        // Simulate time passing well beyond the session's expires_at with NO
        // qrph.expired webhook ever delivered.
        const wayLater = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
        const order = await orderRepository.findByPublicReference(orderReference);
        // The sweep queries by `expires_at`, already stamped to the shared
        // D-08 clock by placeOrder's session-creation branch.
        expect(order.expires_at.getTime()).toBeLessThan(wayLater.getTime());

        const sweepResult = await expireDueSessions(wayLater);

        expect(sweepResult.expired_count).toBe(1);
        const orderAfterSweep = await orderRepository.findByPublicReference(orderReference);
        expect(orderAfterSweep.status).toBe('expired');
        expect(reservationPorts.statusesFor(orderReference)).toEqual(['released']);

        const session = await sessionRepository.findSessionByStorefrontOrderId(order.id);
        expect(session.status).toBe('expired');
    });

    it('cash order finalizes immediately at placement (no PayMongo session, [ASSUMED A3])', async () => {
        const placeOrderResult = await placeOrder({
            businessId: BUSINESS_ID,
            idempotencyKey: 'e2e-idem-key-0003',
            guestIdentityId: 'guest-e2e-0001',
            lines: [{ productId: 1, quantity: 1 }],
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'immediate',
            paymentMethod: 'cash',
            contact: { name: 'E2E Buyer 3', phone: '09171234567' },
            now: NOW
        });

        expect(placeOrderResult.isSuccess).toBe(true);
        expect(placeOrderResult.data.status).toBe('finalized');
        expect(finalizeStorefrontOrder.bySourceReference.size).toBe(1);
        expect(payMongoClient.createQrphPaymentIntent).not.toHaveBeenCalled();
    });
});
