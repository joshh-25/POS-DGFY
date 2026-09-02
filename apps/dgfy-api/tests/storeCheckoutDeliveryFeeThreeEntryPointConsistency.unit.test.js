// Unit tests for Phase 237 (#1329, epic #1321) -- the ticket's own named acceptance evidence: one
// frozen delivery payload/settings fixture, run through all three resolveCheckoutContext callers
// (cart quote, checkout, payment session), asserting the resolved delivery_fee/total_amount are
// strictly identical across all three, and that the persisted pos_transactions breakdown columns
// reconcile with the fee actually charged.
//
// Fixture shapes mirror tests/storeCheckoutDownpaymentResolution.unit.test.js (QRPh payment-session
// setup) and tests/storeCheckoutCalculatedDeliveryFee.unit.test.js (calculated-mode settings). ONE
// deterministic fake roadDistanceProvider instance is reused across all three calls -- not
// re-created per call -- so the in-process cache inside the real adapter (irrelevant here since this
// is a fake, but matching the ticket's own stated design) cannot mask a difference between paths.

import { jest } from '@jest/globals';

process.env.STOREFRONT_PAYMENT_RETURN_URL = 'https://dgfy.ph/payment-return';

const {
    buildStoreCartQuoteUseCase,
    buildStoreCheckoutUseCase,
    buildStoreCheckoutPaymentSessionUseCase
} = await import('../src/modules/store/usecases/storeUseCases.js');
const { generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js');
const dbStore = (await import('../src/utils/dbStore.js')).default;

const TENANT_ID = '55555555-5555-4555-8555-555555555555';

const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    }
];

// Object.freeze: a mutation on one path's copy must not be able to silently alter another path's
// read of the same fixture -- the exact failure mode a naive version of this test would miss.
const FROZEN_LOCATION = Object.freeze({
    location_id: 3,
    name: 'Main',
    address_line: 'Address',
    latitude: 10.7,
    longitude: 122.5,
    delivery_radius_km: 50,
    is_open: true,
    is_active: true,
    supports_delivery: true,
    supports_pickup: true,
    supports_dine_in: true,
    allow_out_of_stock_sales: false,
    current_wait_time_minutes: 15
});

const FROZEN_ITEM = Object.freeze({
    item_id: 40,
    name: 'Widget',
    current_stock: 100,
    default_sale_price: 500,
    cost_per_unit: 10,
    unit_of_measure: 'pc',
    vat_type: 'vatable'
});

const FROZEN_PAYLOAD = Object.freeze({
    location_id: 3,
    order_method: 'delivery',
    payment_type: 'cash',
    customer_name: 'Buyer',
    customer_phone: '0917',
    customer_email: 'buyer@example.com',
    delivery_address: '123 Some St',
    delivery_latitude: 10.75,
    delivery_longitude: 122.55,
    lines: Object.freeze([Object.freeze({ item_id: 40, quantity: 1 })])
});

const calculatedModeSettings = () => Object.freeze([
    ...registeredTransactionSettings(),
    { setting_key: 'store_delivery_fee', setting_value: '50' },
    { setting_key: 'store_delivery_fee_mode', setting_value: 'calculated' },
    {
        setting_key: 'store_delivery_fee_calc',
        setting_value: JSON.stringify({ min_fee: 49, included_km: 2, per_km_rate: 12, increment_km: 1, max_distance_km: 15 })
    },
    { setting_key: 'pos_open_status', setting_value: 'true' }
]);

const freeModeSettings = () => Object.freeze([
    ...registeredTransactionSettings(),
    { setting_key: 'store_delivery_fee', setting_value: '50' },
    { setting_key: 'store_delivery_fee_mode', setting_value: 'free' },
    { setting_key: 'pos_open_status', setting_value: 'true' }
]);

const fakeRoadDistanceProvider = () => ({
    // ONE instance's ONE mock, called by all three entry points below -- deterministic, same
    // {5400, 'road'} result every call, so the in-process cache cannot mask a cross-path difference.
    resolveRoadDistance: jest.fn().mockResolvedValue({ distanceMeters: 5400, source: 'road' })
});

const withGuestProof = (payload, idempotencyKey) => ({
    ...payload,
    idempotency_key: idempotencyKey,
    guest_checkout_proof: generateStoreGuestCheckoutProof({
        tenantId: TENANT_ID,
        email: payload.customer_email,
        idempotencyKey
    })
});

const buildQuoteUseCase = (settingsRows, roadDistanceProvider) => buildStoreCartQuoteUseCase({
    revenueSharingEnabled: false,
    roadDistanceProvider,
    storeRepository: {
        findSellableItemsByIds: jest.fn().mockResolvedValue([FROZEN_ITEM]),
        findLocationById: jest.fn().mockResolvedValue(FROZEN_LOCATION),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows)
    }
});

const buildCheckoutFixture = (settingsRows, roadDistanceProvider) => {
    const transaction = {
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        LOCK: { UPDATE: 'UPDATE' }
    };
    const createOnlineTransactionWithLines = jest.fn().mockResolvedValue(9501);
    const storeRepository = {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        findLocationById: jest.fn().mockResolvedValue(FROZEN_LOCATION),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows),
        findSellableItemsByIds: jest.fn().mockResolvedValue([FROZEN_ITEM]),
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        createOnlineTransactionWithLines,
        getOrderById: jest.fn().mockResolvedValue({
            pos_transaction_id: 9501,
            tracking_pin: 'SK-3EPTEST',
            invoice_number: 'INV-000001',
            order_source: 'online_store',
            order_method: 'delivery',
            payment_type: 'cash',
            payment_status: 'unpaid',
            fulfillment_status: 'placed',
            subtotal_amount: 500,
            discount_amount: 0,
            service_fee_amount: 5,
            delivery_fee: 0,
            total_amount: 0,
            customer_name: 'Buyer',
            customer_phone: '0917',
            customer_email: null,
            location: { location_id: 3, name: 'Main', address_line: 'Address' },
            lines: []
        }),
        nextInvoiceNumber: jest.fn().mockResolvedValue('INV-000001'),
        isTrackingPinTaken: jest.fn().mockResolvedValue(false),
        updateSettingByKey: jest.fn().mockResolvedValue({})
    };
    const useCase = buildStoreCheckoutUseCase({ storeRepository, roadDistanceProvider });
    return { useCase, storeRepository, createOnlineTransactionWithLines };
};

const buildPaymentSessionFixture = (settingsRows, roadDistanceProvider) => {
    const commercePaymentRepository = {
        findSessionByIdempotency: jest.fn().mockResolvedValue(null),
        findTenantPaymentAccount: jest.fn().mockResolvedValue({
            onboarding_status: 'active',
            qrph_enabled: true,
            split_enabled: true,
            charges_enabled: true,
            wallet_status: 'enabled',
            wallet_verified_at: new Date('2026-08-01T00:00:00Z'),
            provider_merchant_id: 'acct_live_fixture'
        }),
        createSession: jest.fn((attrs) => Promise.resolve({ session_id: 701, ...attrs })),
        updateSessionById: jest.fn((sessionId, attrs) => Promise.resolve({ session_id: sessionId, ...attrs }))
    };
    const paymongoService = {
        createQrphPaymentIntent: jest.fn().mockResolvedValue({
            payment_intent_id: 'pi_fixture',
            checkout_url: 'https://paymongo.example/checkout/pi_fixture',
            qr_code_image_url: null,
            expires_at: new Date('2026-08-22T00:00:00Z')
        })
    };
    const storeRepository = {
        findLocationById: jest.fn().mockResolvedValue(FROZEN_LOCATION),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows),
        findSellableItemsByIds: jest.fn().mockResolvedValue([FROZEN_ITEM])
    };
    const useCase = buildStoreCheckoutPaymentSessionUseCase({
        storeRepository,
        commercePaymentRepository,
        paymongoService,
        commercePaymentsEnabled: true,
        commerceQrphEnabled: true,
        requireCommerceQrphConfig: jest.fn().mockReturnValue([]),
        roadDistanceProvider
    });
    return { useCase, commercePaymentRepository, paymongoService };
};

describe.each([
    ['calculated mode (5400m -> ₱97)', calculatedModeSettings, 602, 97],
    ['free mode', freeModeSettings, 505, 0]
])('three-entry-point delivery-fee consistency -- %s', (_label, settingsFactory, expectedTotal, expectedFee) => {
    test('cart quote, checkout, and payment-session all resolve the IDENTICAL delivery_fee and total_amount', async () => {
        const settingsRows = settingsFactory();
        const roadDistanceProvider = fakeRoadDistanceProvider();

        const quoteUseCase = buildQuoteUseCase(settingsRows, roadDistanceProvider);
        const quoteResult = await quoteUseCase({ payload: FROZEN_PAYLOAD });
        expect(quoteResult.success).toBe(true);
        expect(quoteResult.data.delivery_fee).toBe(expectedFee);
        expect(quoteResult.data.total_amount).toBe(expectedTotal);

        const { useCase: checkoutUseCase, createOnlineTransactionWithLines } = buildCheckoutFixture(settingsRows, roadDistanceProvider);
        const checkoutResult = await checkoutUseCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(FROZEN_PAYLOAD, 'three-ep-checkout-1')
        });
        expect(checkoutResult.success).toBe(true);
        expect(checkoutResult.data.totals.delivery_fee).toBe(expectedFee);
        expect(checkoutResult.data.totals.total_amount).toBe(expectedTotal);
        const persistedHeader = createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedHeader.delivery_fee).toBe(expectedFee);

        // The five breakdown columns reconcile: base - waiver === delivery_fee when override is null.
        expect(persistedHeader.delivery_fee_override).toBeNull();
        expect(persistedHeader.delivery_fee_base - persistedHeader.delivery_fee_waiver).toBeCloseTo(persistedHeader.delivery_fee, 4);
        expect(persistedHeader.delivery_fee_calc_version).toBe(1);

        const { useCase: paymentSessionUseCase, commercePaymentRepository } = buildPaymentSessionFixture(settingsRows, roadDistanceProvider);
        const paymentSessionResult = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'three-ep-store' }, () => paymentSessionUseCase({
            payload: withGuestProof({ ...FROZEN_PAYLOAD, store_slug: 'three-ep-store', payment_type: 'qrph' }, 'three-ep-session-1')
        }));
        expect(paymentSessionResult.success).toBe(true);
        const sessionAttrs = commercePaymentRepository.createSession.mock.calls[0][0];
        expect(sessionAttrs.delivery_fee).toBe(expectedFee);
        expect(sessionAttrs.delivery_fee_breakdown.finalFee).toBe(expectedFee);
        expect(sessionAttrs.delivery_fee_breakdown.mode).toBe(persistedHeader.delivery_fee_mode);
        expect(typeof sessionAttrs.delivery_fee_breakdown.pinned_at).toBe('string');

        // All four reads of the fee -- strictly ===, not just numerically close.
        expect(quoteResult.data.delivery_fee).toBe(checkoutResult.data.totals.delivery_fee);
        expect(checkoutResult.data.totals.delivery_fee).toBe(persistedHeader.delivery_fee);
        expect(persistedHeader.delivery_fee).toBe(sessionAttrs.delivery_fee);
        expect(quoteResult.data.total_amount).toBe(checkoutResult.data.totals.total_amount);
    });
});
