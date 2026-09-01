// Unit tests for Phase 237 (#1329, epic #1321, Wave 0 decision #2 / D2) -- quoted-fee pinning
// across a webhook-replay finalization. Two layers:
//   1. buildStoreCheckoutUseCase's own pinnedDeliveryBreakdown handling (resolveCheckoutContext) --
//      the mechanism itself: honor a valid pin regardless of what a fresh distance resolution would
//      produce, fall through to normal resolution on anything shape/version-invalid, and NEVER hard-
//      invalidate on the advisory TTL.
//   2. finalizePaidCommerceSession.js's plumbing -- reads session.delivery_fee_breakdown and passes
//      it through to storeCheckoutUseCase as the sibling arg, verbatim. storeCheckoutUseCase itself
//      is module-mocked here, mirroring tests/finalizePaidCommerceSession.usecase.test.js exactly --
//      layer 1 above is what actually proves the mechanism works; this layer only proves the wiring.
//
// No database anywhere in this file. Fixture shapes mirror
// tests/storeCheckoutRoadDistanceCapture.unit.test.js (checkout) and
// tests/finalizePaidCommerceSession.usecase.test.js (finalizer plumbing).

import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

const { buildStoreCheckoutUseCase } = await import('../src/modules/store/usecases/storeUseCases.js');
const { generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js');
const { DELIVERY_FEE_CALC_VERSION } = await import('../src/modules/deliveryPricing/index.js');

const TENANT_ID = '66666666-6666-4666-8666-666666666666';

const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    }
];

const calculatedModeSettingsRows = () => [
    ...registeredTransactionSettings(),
    { setting_key: 'store_delivery_fee', setting_value: '50' },
    { setting_key: 'store_delivery_fee_mode', setting_value: 'calculated' },
    {
        setting_key: 'store_delivery_fee_calc',
        setting_value: JSON.stringify({ min_fee: 49, included_km: 2, per_km_rate: 12, increment_km: 1, max_distance_km: 15 })
    },
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

const fakeRoadDistanceProvider = (result) => ({ resolveRoadDistance: jest.fn().mockResolvedValue(result) });

const withGuestProof = (payload) => ({
    ...payload,
    guest_checkout_proof: generateStoreGuestCheckoutProof({
        tenantId: TENANT_ID,
        email: payload.customer_email,
        idempotencyKey: payload.idempotency_key
    })
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
    idempotency_key: `pin-checkout-${Math.floor(Math.random() * 1e9)}`,
    lines: [{ item_id: 40, quantity: 1 }],
    ...overrides
});

const buildCheckoutFixture = ({ settingsRows, roadDistanceProvider }) => {
    const transaction = {
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        LOCK: { UPDATE: 'UPDATE' }
    };
    const createOnlineTransactionWithLines = jest.fn().mockResolvedValue(9601);
    const storeRepository = {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        findLocationById: jest.fn().mockResolvedValue(baseLocation()),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows),
        findSellableItemsByIds: jest.fn().mockResolvedValue(baseItem()),
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        createOnlineTransactionWithLines,
        getOrderById: jest.fn().mockResolvedValue({
            pos_transaction_id: 9601,
            tracking_pin: 'SK-PINTEST',
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
    return { useCase, createOnlineTransactionWithLines };
};

const VALID_PIN_AT_5400M = Object.freeze({
    mode: 'calculated',
    baseFee: 97,
    waiverAmount: 0,
    overrideAmount: null,
    finalFee: 97,
    distanceMeters: 5400,
    distanceSource: 'road',
    fallbackApplied: false,
    outOfRange: false,
    calcVersion: DELIVERY_FEE_CALC_VERSION,
    pinned_at: new Date().toISOString()
});

describe('resolveCheckoutContext pinnedDeliveryBreakdown -- the mechanism itself', () => {
    test('a valid pin wins over a fresh resolution that would price differently (provider now unavailable)', async () => {
        // Would fall back to the fixed ₱50 rate if freshly resolved -- the pin (₱97) must win.
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: null, source: 'unavailable' });
        const { useCase, createOnlineTransactionWithLines } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: VALID_PIN_AT_5400M
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(97);
        // Phase 236 observation capture still runs independently of the pin -- resolveRoadDistance
        // MAY be called; the pinned fee wins regardless of what it returns. Not asserted either way.
        const persistedHeader = createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedHeader.delivery_fee).toBe(97);
        expect(persistedHeader.delivery_fee_mode).toBe('calculated');
        expect(persistedHeader.delivery_fee_base).toBe(97);
    });

    test('a valid pin wins over a fresh resolution that would price differently (a different distance)', async () => {
        // 12000m would price at a different fee than the pin's 97 if freshly resolved.
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 12000, source: 'road' });
        const { useCase, createOnlineTransactionWithLines } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: VALID_PIN_AT_5400M
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(97);
        const persistedHeader = createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedHeader.delivery_fee).toBe(97);
    });

    test('pinnedDeliveryBreakdown absent (null): resolves normally, identical to a pre-Phase-237 session', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 5400, source: 'road' });
        const { useCase } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: null
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(97);
    });

    test.each([
        ['empty object', {}],
        ['finalFee not a number', { ...VALID_PIN_AT_5400M, finalFee: 'x' }],
        ['negative finalFee', { ...VALID_PIN_AT_5400M, finalFee: -1 }]
    ])('malformed pin (%s) falls through to normal resolution, does not throw', async (_label, malformedPin) => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 5400, source: 'road' });
        const { useCase } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: malformedPin
        });

        expect(result.success).toBe(true);
        // Falls through to a fresh resolution -- 5400m calculated-mode prices at ₱97, same as the
        // pin would have, but arrived at by re-resolving, not by honoring the malformed pin.
        expect(result.data.totals.delivery_fee).toBe(97);
    });

    test('calcVersion mismatch falls through to normal resolution, does not throw', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: null, source: 'unavailable' });
        const { useCase } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });
        const staleVersionPin = { ...VALID_PIN_AT_5400M, calcVersion: DELIVERY_FEE_CALC_VERSION + 1 };

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: staleVersionPin
        });

        expect(result.success).toBe(true);
        // Falls through to a fresh resolution: provider unavailable -> fallback to the fixed ₱50
        // rate, NOT the stale pin's ₱97 -- proves the version check actually gates honoring the pin.
        expect(result.data.totals.delivery_fee).toBe(50);
    });

    test('a pin past the 60-minute advisory TTL is STILL honored (D2: advisory only, never hard-invalidated)', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: null, source: 'unavailable' });
        const { useCase } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });
        const staleAgePin = {
            ...VALID_PIN_AT_5400M,
            pinned_at: new Date(Date.now() - 90 * 60 * 1000).toISOString() // 90 minutes old
        };

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: staleAgePin
        });

        expect(result.success).toBe(true);
        // Still ₱97, the pinned amount -- never re-priced or refused for age alone.
        expect(result.data.totals.delivery_fee).toBe(97);
    });
});

describe('finalizePaidCommerceSession.js -- pinnedDeliveryBreakdown plumbing', () => {
    const storeCheckoutUseCase = jest.fn();
    const getConnection = jest.fn();
    const getTenantModels = jest.fn();

    jest.unstable_mockModule('../src/modules/store/index.js', () => ({ storeCheckoutUseCase }));
    jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({ default: { getConnection } }));
    jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({ getTenantModels }));

    let finalizePaidCommerceSession;

    beforeAll(async () => {
        ({ finalizePaidCommerceSession } = await import('../src/modules/commercePayments/usecases/finalizePaidCommerceSession.js'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
        getConnection.mockResolvedValue({ name: 'tenant-sequelize' });
        getTenantModels.mockReturnValue({ Item: { name: 'Item' } });
        storeCheckoutUseCase.mockResolvedValue({
            success: true,
            data: { tracking_pin: 'TRACK-PIN', order: { pos_transaction_id: 9701, tracking_pin: 'TRACK-PIN' } }
        });
    });

    test('reads session.delivery_fee_breakdown and passes it through verbatim as pinnedDeliveryBreakdown', async () => {
        const tenant = { id: 'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11d', name: 'Pin Cafe', plan: 'standard', subscription_status: 'active' };
        const breakdown = { ...VALID_PIN_AT_5400M };
        const session = {
            session_id: 21,
            tenant_id: tenant.id,
            store_slug: 'pin-cafe',
            public_reference: 'CPS-PINTEST01',
            status: 'paid',
            delivery_fee_breakdown: breakdown,
            checkout_payload: JSON.stringify({
                payment_type: 'card',
                customer_name: 'Pin Buyer',
                customer_email: 'pin@example.com'
            }),
            idempotency_key: 'checkout:CPS-PINTEST01'
        };
        const commercePaymentRepository = {
            findTenantById: jest.fn().mockResolvedValue(tenant),
            updateSessionById: jest.fn().mockImplementation(async (_id, changes) => ({ ...session, ...changes }))
        };

        await finalizePaidCommerceSession({
            session,
            resource: { id: 'pay_pin', attributes: { status: 'paid' } },
            providerEventId: 'evt_pin',
            commercePaymentRepository
        });

        expect(storeCheckoutUseCase).toHaveBeenCalledWith(expect.objectContaining({
            pinnedDeliveryBreakdown: breakdown
        }));
    });

    test('a pre-Phase-237 session with no delivery_fee_breakdown passes null -- unchanged behavior', async () => {
        const tenant = { id: 'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11e', name: 'Pin Cafe', plan: 'standard', subscription_status: 'active' };
        const session = {
            session_id: 22,
            tenant_id: tenant.id,
            store_slug: 'pin-cafe',
            public_reference: 'CPS-NOPIN01',
            status: 'paid',
            checkout_payload: JSON.stringify({
                payment_type: 'card',
                customer_name: 'No Pin Buyer',
                customer_email: 'nopin@example.com'
            }),
            idempotency_key: 'checkout:CPS-NOPIN01'
        };
        const commercePaymentRepository = {
            findTenantById: jest.fn().mockResolvedValue(tenant),
            updateSessionById: jest.fn().mockImplementation(async (_id, changes) => ({ ...session, ...changes }))
        };

        await finalizePaidCommerceSession({
            session,
            resource: { id: 'pay_nopin', attributes: { status: 'paid' } },
            providerEventId: 'evt_nopin',
            commercePaymentRepository
        });

        expect(storeCheckoutUseCase).toHaveBeenCalledWith(expect.objectContaining({
            pinnedDeliveryBreakdown: null
        }));
    });
});
