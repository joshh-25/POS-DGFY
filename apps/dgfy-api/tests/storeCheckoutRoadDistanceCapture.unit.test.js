// Unit tests for Phase 236 (#1328, epic #1321) -- server-side road-distance capture at checkout,
// observation only. No database is used anywhere in this file. storeRepository is a hand-built
// fake; roadDistanceProvider is dependency-injected through buildStoreCheckoutUseCase (mirrors
// downpaymentSettingsRepository's own injection). Fixture shapes mirror
// tests/storeCheckoutDownpaymentResolution.unit.test.js.
//
// The central claim under test (§6 of the Phase 236 plan): resolveStoreDeliveryFee's output --
// and therefore delivery_fee/total_amount -- is byte-identical regardless of what the road-distance
// provider returns. Distance capture must never leak into fee math.

import { jest } from '@jest/globals';

const {
    buildStoreCheckoutUseCase
} = await import('../src/modules/store/usecases/storeUseCases.js');
const { generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js');

const TENANT_ID = '33333333-3333-4333-8333-333333333333';

const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    }
];

const buildFakeCheckoutStoreRepository = ({ createdOrderId = 9101 } = {}) => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; }),
        LOCK: { UPDATE: 'UPDATE' }
    };
    const createOnlineTransactionWithLines = jest.fn().mockResolvedValue(createdOrderId);
    return {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        findLocationById: jest.fn().mockResolvedValue({
            location_id: 3,
            name: 'Main',
            address_line: 'Address',
            latitude: 10.7,
            longitude: 122.5,
            delivery_radius_km: 5,
            is_open: true,
            is_active: true,
            supports_delivery: true,
            supports_pickup: true,
            supports_dine_in: true,
            allow_out_of_stock_sales: false,
            current_wait_time_minutes: 15
        }),
        getSettingsByKeys: jest.fn().mockResolvedValue([
            ...registeredTransactionSettings(),
            { setting_key: 'store_delivery_fee', setting_value: '50' },
            { setting_key: 'pos_open_status', setting_value: 'true' }
        ]),
        findSellableItemsByIds: jest.fn().mockResolvedValue([
            {
                item_id: 40,
                name: 'Widget',
                current_stock: 100,
                default_sale_price: 500,
                cost_per_unit: 10,
                unit_of_measure: 'pc',
                vat_type: 'vatable'
            }
        ]),
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        createOnlineTransactionWithLines,
        getOrderById: jest.fn().mockResolvedValue({
            pos_transaction_id: createdOrderId,
            tracking_pin: 'SK-RDTEST',
            invoice_number: 'INV-000001',
            order_source: 'online_store',
            order_method: 'delivery',
            payment_type: 'cash',
            payment_status: 'unpaid',
            fulfillment_status: 'placed',
            subtotal_amount: 500,
            discount_amount: 0,
            service_fee_amount: 5,
            delivery_fee: 50,
            total_amount: 555,
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

const deliveryCheckoutPayload = (overrides = {}) => ({
    location_id: 3,
    order_method: 'delivery',
    payment_type: 'cash',
    payment_status: 'unpaid',
    idempotency_key: `rd-checkout-${Math.floor(Math.random() * 1e9)}`,
    customer_name: 'Buyer',
    customer_phone: '0917',
    customer_email: 'buyer@example.com',
    delivery_address: '123 Some St',
    delivery_latitude: 10.75,
    delivery_longitude: 122.55,
    lines: [{ item_id: 40, quantity: 1 }],
    ...overrides
});

const withGuestProof = (payload) => ({
    ...payload,
    guest_checkout_proof: generateStoreGuestCheckoutProof({
        tenantId: TENANT_ID,
        email: payload.customer_email,
        idempotencyKey: payload.idempotency_key
    })
});

const fakeRoadDistanceProvider = (result) => ({
    resolveRoadDistance: jest.fn().mockResolvedValue(result)
});

describe('buildStoreCheckoutUseCase — Phase 236 (#1328) road-distance capture', () => {
    test('a successful road-distance resolution persists {source: "road", meters: <value>}', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 6400, source: 'road' });
        const useCase = buildStoreCheckoutUseCase({ storeRepository, roadDistanceProvider });

        const result = await useCase({ tenantId: TENANT_ID, payload: withGuestProof(deliveryCheckoutPayload()) });

        expect(result.success).toBe(true);
        expect(roadDistanceProvider.resolveRoadDistance).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: TENANT_ID,
            locationId: 3,
            originLat: 10.7,
            originLng: 122.5,
            destLat: 10.75,
            destLng: 122.55
        }));
        const persistedAttrs = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedAttrs.delivery_distance_meters).toBe(6400);
        expect(persistedAttrs.delivery_distance_source).toBe('road');
    });

    test('GraphHopper down/unavailable: checkout still completes, persists {source: "fallback", meters: null}', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: null, source: 'unavailable' });
        const useCase = buildStoreCheckoutUseCase({ storeRepository, roadDistanceProvider });

        const result = await useCase({ tenantId: TENANT_ID, payload: withGuestProof(deliveryCheckoutPayload()) });

        expect(result.success).toBe(true);
        expect(storeRepository.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
        const persistedAttrs = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedAttrs.delivery_distance_meters).toBeNull();
        expect(persistedAttrs.delivery_distance_source).toBe('fallback');
        // Fee math is unaffected by the failure -- see the fee-boundary regression test below.
        expect(result.data.totals.delivery_fee).toBe(50);
    });

    test('order_method !== "delivery": the provider is never called, persists {source: "none", meters: null}', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 1234, source: 'road' });
        const useCase = buildStoreCheckoutUseCase({ storeRepository, roadDistanceProvider });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryCheckoutPayload({ order_method: 'pickup', delivery_address: null, delivery_latitude: null, delivery_longitude: null }))
        });

        expect(result.success).toBe(true);
        expect(roadDistanceProvider.resolveRoadDistance).not.toHaveBeenCalled();
        const persistedAttrs = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedAttrs.delivery_distance_meters).toBeNull();
        expect(persistedAttrs.delivery_distance_source).toBe('none');
    });

    test('no roadDistanceProvider injected (falls back to the real singleton): checkout is unaffected by this addition', async () => {
        // Pins that the additive param has a default and doesn't break a caller that omits it --
        // does not exercise the real GraphHopper HTTP call (ROUTE_CALCULATOR_ENDPOINT is unset in
        // the test environment, so the real singleton's own use case reports SERVICE_UNAVAILABLE,
        // which the adapter already normalizes to 'unavailable').
        const storeRepository = buildFakeCheckoutStoreRepository();
        const useCase = buildStoreCheckoutUseCase({ storeRepository });

        const result = await useCase({ tenantId: TENANT_ID, payload: withGuestProof(deliveryCheckoutPayload()) });

        expect(result.success).toBe(true);
        const persistedAttrs = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedAttrs.delivery_distance_source).toBe('fallback');
    });

    // §6 of the Phase 236 plan: the single most important test in this file. Fee math must be
    // byte-identical no matter what the road-distance provider returns.
    test.each([
        ['road, zero distance', { distanceMeters: 0, source: 'road' }],
        ['road, large distance', { distanceMeters: 50000, source: 'road' }],
        ['unavailable', { distanceMeters: null, source: 'unavailable' }]
    ])('fee-boundary regression: %s never changes delivery_fee or total_amount', async (_label, providerResult) => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const roadDistanceProvider = fakeRoadDistanceProvider(providerResult);
        const useCase = buildStoreCheckoutUseCase({ storeRepository, roadDistanceProvider });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryCheckoutPayload({ idempotency_key: `rd-fee-${Math.random()}` }))
        });

        expect(result.success).toBe(true);
        // store_delivery_fee = 50, subtotal 500, service fee 5 (1%) => 555 total, regardless of
        // distance/source above.
        expect(result.data.totals.delivery_fee).toBe(50);
        expect(result.data.totals.total_amount).toBe(555);
    });
});
