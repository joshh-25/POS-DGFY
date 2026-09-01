// Unit tests for Phase 237 (#1329, epic #1321) -- calculated-mode delivery-fee wiring in
// resolveStoreDeliveryFee/resolveCheckoutContext. Covers ADR 0078 Decision 2 [binding]'s
// fail-open-to-fixed on every named failure branch (provider down/throws/no-coordinates, malformed
// calc config), the happy-path formula wiring, and the ADR 0078 Decision 2 / D6 out-of-range hard
// block (never at cart quote, always at checkout and payment-session creation).
//
// No database is used anywhere in this file. storeRepository/roadDistanceProvider are hand-built
// fakes, mirroring tests/storeCheckoutRoadDistanceCapture.unit.test.js (fee-boundary fixed-mode
// regression) and tests/storeCheckoutDownpaymentResolution.unit.test.js (the QRPh payment-session
// fixture shape, for the out-of-range-at-payment-session case).

import { jest } from '@jest/globals';

process.env.STOREFRONT_PAYMENT_RETURN_URL = 'https://dgfy.ph/payment-return';

const {
    buildStoreCartQuoteUseCase,
    buildStoreCheckoutUseCase,
    buildStoreCheckoutPaymentSessionUseCase
} = await import('../src/modules/store/usecases/storeUseCases.js');
const { generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js');
const dbStore = (await import('../src/utils/dbStore.js')).default;

const TENANT_ID = '44444444-4444-4444-8444-444444444444';

const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    }
];

// min_fee 49, included 2km, ₱12/increment_km beyond that, 1km increments, max 15km.
const CALCULATED_CALC_CONFIG = {
    min_fee: 49,
    included_km: 2,
    per_km_rate: 12,
    increment_km: 1,
    max_distance_km: 15
};

const calculatedModeSettingsRows = (overrides = {}) => [
    ...registeredTransactionSettings(),
    { setting_key: 'store_delivery_fee', setting_value: '50' },
    { setting_key: 'store_delivery_fee_mode', setting_value: 'calculated' },
    { setting_key: 'store_delivery_fee_calc', setting_value: JSON.stringify({ ...CALCULATED_CALC_CONFIG, ...overrides }) },
    { setting_key: 'pos_open_status', setting_value: 'true' }
];

const baseLocation = () => ({
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

const baseItem = () => ([{
    item_id: 40,
    name: 'Widget',
    current_stock: 100,
    default_sale_price: 500,
    cost_per_unit: 10,
    unit_of_measure: 'pc',
    vat_type: 'vatable'
}]);

const fakeRoadDistanceProvider = (impl) => ({
    resolveRoadDistance: typeof impl === 'function' ? jest.fn(impl) : jest.fn().mockResolvedValue(impl)
});

const deliveryPayload = (overrides = {}) => ({
    location_id: 3,
    order_method: 'delivery',
    payment_type: 'cash',
    customer_name: 'Buyer',
    customer_phone: '0917',
    customer_email: 'buyer@example.com',
    delivery_address: '123 Some St',
    delivery_latitude: 10.75,
    delivery_longitude: 122.55,
    lines: [{ item_id: 40, quantity: 1 }],
    ...overrides
});

// ---- quote fixture ----

const buildQuoteUseCase = (settingsRows, roadDistanceProvider) => buildStoreCartQuoteUseCase({
    revenueSharingEnabled: false,
    roadDistanceProvider,
    storeRepository: {
        findSellableItemsByIds: jest.fn().mockResolvedValue(baseItem()),
        findLocationById: jest.fn().mockResolvedValue(baseLocation()),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows)
    }
});

// ---- checkout fixture ----

const buildFakeCheckoutStoreRepository = ({ settingsRows, createdOrderId = 9401 } = {}) => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; }),
        LOCK: { UPDATE: 'UPDATE' }
    };
    const createOnlineTransactionWithLines = jest.fn().mockResolvedValue(createdOrderId);
    return {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        findLocationById: jest.fn().mockResolvedValue(baseLocation()),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows),
        findSellableItemsByIds: jest.fn().mockResolvedValue(baseItem()),
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        createOnlineTransactionWithLines,
        getOrderById: jest.fn().mockResolvedValue({
            pos_transaction_id: createdOrderId,
            tracking_pin: 'SK-CALCTEST',
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
        updateSettingByKey: jest.fn().mockResolvedValue({}),
        _transaction: transaction
    };
};

const withGuestProof = (payload) => ({
    ...payload,
    guest_checkout_proof: generateStoreGuestCheckoutProof({
        tenantId: TENANT_ID,
        email: payload.customer_email,
        idempotencyKey: payload.idempotency_key
    })
});

const runCheckout = async ({ settingsRows, roadDistanceProvider, payloadOverrides = {} }) => {
    const storeRepository = buildFakeCheckoutStoreRepository({ settingsRows });
    const useCase = buildStoreCheckoutUseCase({ storeRepository, roadDistanceProvider });
    const payload = withGuestProof(deliveryPayload({
        idempotency_key: `calc-checkout-${Math.floor(Math.random() * 1e9)}`,
        ...payloadOverrides
    }));
    const result = await useCase({ tenantId: TENANT_ID, payload });
    return { result, storeRepository };
};

// ---- payment-session fixture (for the out-of-range-at-payment-session case) ----

const buildPaymentSessionUseCase = ({ settingsRows, roadDistanceProvider }) => {
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
        createSession: jest.fn((attrs) => Promise.resolve({ session_id: 601, ...attrs }))
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
        findLocationById: jest.fn().mockResolvedValue(baseLocation()),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows),
        findSellableItemsByIds: jest.fn().mockResolvedValue(baseItem())
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

describe('resolveStoreDeliveryFee calculated mode -- fail-open-to-fixed (ADR 0078 Decision 2 [binding])', () => {
    test('provider unavailable: checkout completes at the fixed rate, fallbackApplied true', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: null, source: 'unavailable' });
        const { result, storeRepository } = await runCheckout({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(50);
        const persistedAttrs = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedAttrs.delivery_fee_mode).toBe('calculated');
        expect(persistedAttrs.delivery_fee_base).toBe(50);
        expect(persistedAttrs.delivery_fee_waiver).toBe(0);
        expect(persistedAttrs.delivery_fee_override).toBeNull();
        expect(persistedAttrs.delivery_fee_calc_version).toBe(1);
        expect(persistedAttrs.delivery_distance_source).toBe('fallback');
    });

    test('provider throws: nothing escapes the choke point, checkout still completes at the fixed rate', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider(() => Promise.reject(new Error('GraphHopper timeout')));
        const { result } = await runCheckout({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        // roadDistanceProvider's own promise rejection propagates as an 'unavailable' source at the
        // resolveCheckoutContext mapping layer only if the adapter itself normalizes it -- this repo's
        // real adapter does that; a raw fake rejection here exercises resolveCheckoutContext's own
        // `await roadDistancePromise` -- if it throws unguarded, checkout would fail outright, which
        // is itself the assertion: it must NOT.
        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(50);
    });

    test('no coordinates on payload: the provider is never called, fallback applies', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 5400, source: 'road' });
        // `undefined`, not `null` -- toNumberOrNull(null) === 0 (Number(null) is finite), so only an
        // omitted/undefined coordinate actually normalizes to `null` (Number(undefined) is NaN).
        const { result } = await runCheckout({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider,
            payloadOverrides: { delivery_latitude: undefined, delivery_longitude: undefined }
        });

        expect(roadDistanceProvider.resolveRoadDistance).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(50);
    });

    test('malformed calc blob with a good distance still falls back to the fixed rate', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 5400, source: 'road' });
        const { result, storeRepository } = await runCheckout({
            settingsRows: calculatedModeSettingsRows({ min_fee: 'abc' }),
            roadDistanceProvider
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(50);
        const persistedAttrs = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedAttrs.delivery_distance_source).toBe('road');
        expect(persistedAttrs.delivery_distance_meters).toBe(5400);
    });

    test('calc blob absent entirely: same fallback as malformed', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 5400, source: 'road' });
        const settingsRows = [
            ...registeredTransactionSettings(),
            { setting_key: 'store_delivery_fee', setting_value: '50' },
            { setting_key: 'store_delivery_fee_mode', setting_value: 'calculated' },
            { setting_key: 'pos_open_status', setting_value: 'true' }
        ];
        const { result } = await runCheckout({ settingsRows, roadDistanceProvider });

        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(50);
    });
});

describe('resolveStoreDeliveryFee calculated mode -- happy path and in-range boundary', () => {
    // Hand-computed from computeCalculatedDeliveryFeeCentavos itself (Phase 235 algorithm), not a
    // re-implementation of the formula: 49 + 4 increments (ceil((5400-2000)/1000)) x 12 = 97.
    test('happy path: 5400m distance prices at ₱97, fallbackApplied false', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 5400, source: 'road' });
        const { result, storeRepository } = await runCheckout({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(97);
        const persistedAttrs = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedAttrs.delivery_fee_mode).toBe('calculated');
        expect(persistedAttrs.delivery_fee_base).toBe(97);
        expect(persistedAttrs.delivery_fee_calc_version).toBe(1);
    });

    test('exactly at max distance (15000m, strict > boundary): in-range, priced, not out-of-range', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 15000, source: 'road' });
        const { result } = await runCheckout({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        expect(result.success).toBe(true);
        // 49 + 13 increments x 12 = 205.
        expect(result.data.totals.delivery_fee).toBe(205);
    });
});

describe('ADR 0078 Decision 2 [binding] / D6 -- out-of-range hard block', () => {
    test('cart quote: never throws, reports delivery_out_of_range and a zero fee', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 20000, source: 'road' });
        const useCase = buildQuoteUseCase(calculatedModeSettingsRows(), roadDistanceProvider);

        const result = await useCase({ payload: deliveryPayload() });

        expect(result.success).toBe(true);
        expect(result.data.delivery_out_of_range).toBe(true);
        expect(result.data.delivery_distance_meters).toBe(20000);
        expect(result.data.delivery_fee).toBe(0);
    });

    test('checkout: throws 422 DELIVERY_DISTANCE_OUT_OF_RANGE, no order is created', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 20000, source: 'road' });
        const { result, storeRepository } = await runCheckout({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(422);
        expect(result.error?.details?.reason_code).toBe('DELIVERY_DISTANCE_OUT_OF_RANGE');
        expect(storeRepository.createOnlineTransactionWithLines).not.toHaveBeenCalled();
    });

    test('payment session: throws 422, no session and no PayMongo call', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 20000, source: 'road' });
        const { useCase, commercePaymentRepository, paymongoService } = buildPaymentSessionUseCase({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'calc-store' }, () => useCase({
            payload: withGuestProof(deliveryPayload({
                store_slug: 'calc-store',
                payment_type: 'qrph',
                idempotency_key: 'calc-oor-session-1'
            }))
        }));

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(422);
        expect(result.error?.details?.reason_code).toBe('DELIVERY_DISTANCE_OUT_OF_RANGE');
        expect(commercePaymentRepository.createSession).not.toHaveBeenCalled();
        expect(paymongoService.createQrphPaymentIntent).not.toHaveBeenCalled();
    });
});
