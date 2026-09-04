// #1565 (#478 residue). Confirms the legacy haversine `outside_radius_flag` was actually retired,
// not just stopped-mattering: the helper functions, the model field, and every read/write site are
// gone, and every response shape that used to carry the flag no longer does. No database is used
// anywhere in this file -- storeRepository is a hand-built fake, same pattern as
// storeCheckoutRoadDistanceCapture.unit.test.js and storeCartQuotePreviewNoContactRequired.unit.test.js.
//
// Deliberately NOT covered here (out of scope for #1565, per its own ticket): resolveStoreDeliveryFee,
// the road-distance capture/await pipeline, or ADR 0078 Decision 2's enforcement logic --
// storeCheckoutRoadDistanceCapture.unit.test.js already covers those and is untouched by this PR.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
    buildStoreCheckoutUseCase,
    buildStoreCartQuoteUseCase
} = await import('../src/modules/store/usecases/storeUseCases.js');
const { default: PosTransaction } = await import('../src/models/PosTransaction.js');
const { generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js');

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

const buildFakeCheckoutStoreRepository = ({ createdOrderId = 9202 } = {}) => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; }),
        LOCK: { UPDATE: 'UPDATE' }
    };
    const createOnlineTransactionWithLines = jest.fn().mockResolvedValue(createdOrderId);
    return {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        // Deliberately a customer address WELL OUTSIDE the location's delivery_radius_km (5) --
        // exactly the case the old haversine flag would have flipped `true` for. Proves the
        // retirement isn't just "the field happens to be false in this fixture", but that the key
        // is gone from every response/persisted-payload shape entirely, regardless of distance.
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
            tracking_pin: 'SK-ORFTEST',
            invoice_number: 'INV-000002',
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
        nextInvoiceNumber: jest.fn().mockResolvedValue('INV-000002'),
        isTrackingPinTaken: jest.fn().mockResolvedValue(false),
        updateSettingByKey: jest.fn().mockResolvedValue({}),
        _transaction: transaction
    };
};

// A pin ~85km from the fake location above (10.7, 122.5) -- far past delivery_radius_km: 5. Under
// the old haversine logic this would have resolved outsideRadiusFlag: true.
const farAwayDeliveryPayload = (overrides = {}) => ({
    location_id: 3,
    order_method: 'delivery',
    payment_type: 'cash',
    payment_status: 'unpaid',
    idempotency_key: `orf-checkout-${Math.floor(Math.random() * 1e9)}`,
    customer_name: 'Buyer',
    customer_phone: '0917',
    customer_email: 'buyer@example.com',
    delivery_address: 'Very far away St',
    delivery_latitude: 11.5,
    delivery_longitude: 123.4,
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

describe('#1565 -- haversine outside_radius_flag retirement', () => {
    test('storeUseCases.js source no longer defines the haversine helpers or references the flag', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'modules', 'store', 'usecases', 'storeUseCases.js'),
            'utf8'
        );
        expect(source).not.toMatch(/haversineDistanceKm/);
        expect(source).not.toMatch(/resolveDeliveryRadiusFlag/);
        expect(source).not.toMatch(/outside_radius_flag/);
        expect(source).not.toMatch(/outsideRadiusFlag/);
    });

    test('posUseCases.js no longer references the retired flag', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '..', 'src', 'modules', 'pos', 'usecases', 'posUseCases.js'),
            'utf8'
        );
        expect(source).not.toMatch(/outside_radius_flag/);
    });

    test('PosTransaction model no longer defines outside_radius_flag', () => {
        expect(Object.prototype.hasOwnProperty.call(PosTransaction.rawAttributes, 'outside_radius_flag')).toBe(false);
        expect(PosTransaction.rawAttributes.delivery_distance_meters).toBeDefined();
        expect(PosTransaction.rawAttributes.delivery_distance_source).toBeDefined();
    });

    test('checkout: persisted create-payload header carries no outside_radius_flag key, even for a far-away delivery pin', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const useCase = buildStoreCheckoutUseCase({ storeRepository });

        const result = await useCase({ tenantId: TENANT_ID, payload: withGuestProof(farAwayDeliveryPayload()) });

        expect(result.success).toBe(true);
        const persistedHeader = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(Object.prototype.hasOwnProperty.call(persistedHeader, 'outside_radius_flag')).toBe(false);
    });

    test('checkout: the serialized order in the response carries no outside_radius_flag key', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const useCase = buildStoreCheckoutUseCase({ storeRepository });

        const result = await useCase({ tenantId: TENANT_ID, payload: withGuestProof(farAwayDeliveryPayload()) });

        expect(result.success).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(result.data.order, 'outside_radius_flag')).toBe(false);
    });

    test('cart quote: the response carries no outside_radius_flag key, even for a far-away delivery pin', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const useCase = buildStoreCartQuoteUseCase({ storeRepository });

        const result = await useCase({ payload: farAwayDeliveryPayload({ idempotency_key: undefined }) });

        expect(result.success).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(result.data, 'outside_radius_flag')).toBe(false);
        // Sanity: the retirement didn't collaterally remove the REAL out-of-range signal (ADR 0078
        // Decision 2, road-distance-pipeline-driven), which #1565 explicitly leaves untouched.
        expect(result.data).toHaveProperty('delivery_out_of_range');
    });

    test('a non-delivery (pickup) order still checks out cleanly with no outside_radius_flag anywhere', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const useCase = buildStoreCheckoutUseCase({ storeRepository });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(farAwayDeliveryPayload({
                order_method: 'pickup',
                delivery_address: null,
                delivery_latitude: null,
                delivery_longitude: null
            }))
        });

        expect(result.success).toBe(true);
        const persistedHeader = storeRepository.createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(Object.prototype.hasOwnProperty.call(persistedHeader, 'outside_radius_flag')).toBe(false);
    });
});
