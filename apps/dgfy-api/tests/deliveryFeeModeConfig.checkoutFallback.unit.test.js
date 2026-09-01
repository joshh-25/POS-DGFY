// Phase 233 (#1324, epic #1321) regression coverage: resolveStoreDeliveryFee (storeUseCases.js)
// now consumes the new store_delivery_fee_mode / store_delivery_fee_calc settings via
// deliveryPricing's resolveDeliveryFeeConfig, but MUST keep returning today's flat
// store_delivery_fee value regardless of what mode/calc resolves to -- calculated/free fee
// computation is out of scope for this phase (#237). These tests are the acceptance evidence named
// directly by #1324: absent config resolves to today's value; garbage config resolves to today's
// value, not a crash.
//
// This is a new file, not an edit to any existing store-checkout test suite -- the regression gate
// for this phase is that every existing suite (storeUsecases.applicationResult.test.js and
// siblings) keeps passing unmodified.

import { jest } from '@jest/globals';
import { buildStoreCartQuoteUseCase } from '../src/modules/store/usecases/storeUseCases.js';

// Customer access modes default to enforced in this test env (isCustomerAccessModesEnabled fails
// open unless explicitly disabled) -- every fixture below needs a 'transaction'-capable settings
// row set, matching storeUsecases.applicationResult.test.js's own registeredTransactionSettings().
const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: {
                business_classification: {
                    legitimacy: { registration_status: 'registered' }
                }
            }
        })
    }
];

const baseLocation = () => ({
    location_id: 3,
    name: 'Main',
    address_line: 'Test',
    latitude: 14.5,
    longitude: 121.0,
    delivery_radius_km: 5,
    is_open: true,
    is_active: true,
    supports_delivery: true,
    supports_pickup: true,
    supports_dine_in: true,
    allow_out_of_stock_sales: false,
    current_wait_time_minutes: 15
});

const baseItem = () => ([
    {
        item_id: 1,
        name: 'Sample Item',
        current_stock: 10,
        default_sale_price: 100,
        cost_per_unit: 60,
        unit_of_measure: 'pc',
        vat_type: 'vatable'
    }
]);

const quoteDeliveryPayload = () => ({
    location_id: 3,
    order_method: 'delivery',
    payment_type: 'cash',
    customer_name: 'Buyer',
    customer_phone: '0917',
    delivery_address: 'Address',
    lines: [{ item_id: 1, quantity: 1 }]
});

const buildQuoteUseCase = (settingsRows) => buildStoreCartQuoteUseCase({
    revenueSharingEnabled: false,
    storeRepository: {
        findSellableItemsByIds: jest.fn().mockResolvedValue(baseItem()),
        findLocationById: jest.fn().mockResolvedValue(baseLocation()),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows)
    }
});

describe('resolveStoreDeliveryFee fee-mode-config fallback (#1324, fixed-only behavior)', () => {
    it('resolves the flat store_delivery_fee value when no fee-mode config keys are stored at all (absent config)', async () => {
        const useCase = buildQuoteUseCase([
            ...registeredTransactionSettings(),
            { setting_key: 'store_delivery_fee', setting_value: '20' },
            { setting_key: 'pos_open_status', setting_value: 'true' }
            // No store_delivery_fee_mode / store_delivery_fee_calc rows -- matches every tenant
            // provisioned before this phase shipped.
        ]);

        const result = await useCase({ payload: quoteDeliveryPayload() });

        expect(result.success).toBe(true);
        expect(Number(result.data.delivery_fee)).toBeCloseTo(20, 4);
    });

    it('resolves the flat store_delivery_fee value when store_delivery_fee_mode is garbage, and does not throw', async () => {
        const useCase = buildQuoteUseCase([
            ...registeredTransactionSettings(),
            { setting_key: 'store_delivery_fee', setting_value: '20' },
            { setting_key: 'store_delivery_fee_mode', setting_value: 'not-a-real-mode' },
            { setting_key: 'pos_open_status', setting_value: 'true' }
        ]);

        const result = await useCase({ payload: quoteDeliveryPayload() });

        expect(result.success).toBe(true);
        expect(Number(result.data.delivery_fee)).toBeCloseTo(20, 4);
    });

    it('resolves the flat store_delivery_fee value when store_delivery_fee_calc is a malformed blob, and does not throw', async () => {
        const useCase = buildQuoteUseCase([
            ...registeredTransactionSettings(),
            { setting_key: 'store_delivery_fee', setting_value: '20' },
            { setting_key: 'store_delivery_fee_mode', setting_value: 'calculated' },
            // Missing required fields, negative rate -- garbage, not a well-formed formula.
            { setting_key: 'store_delivery_fee_calc', setting_value: JSON.stringify({ per_km_rate: -5 }) },
            { setting_key: 'pos_open_status', setting_value: 'true' }
        ]);

        const result = await useCase({ payload: quoteDeliveryPayload() });

        expect(result.success).toBe(true);
        expect(Number(result.data.delivery_fee)).toBeCloseTo(20, 4);
    });

    it('still returns the flat fee even with a fully well-formed calculated-mode config -- computing that fee is out of scope for this phase', async () => {
        const useCase = buildQuoteUseCase([
            ...registeredTransactionSettings(),
            { setting_key: 'store_delivery_fee', setting_value: '20' },
            { setting_key: 'store_delivery_fee_mode', setting_value: 'calculated' },
            {
                setting_key: 'store_delivery_fee_calc',
                setting_value: JSON.stringify({
                    min_fee: 50,
                    included_km: 3,
                    per_km_rate: 10,
                    increment_km: 0.5,
                    max_distance_km: 15
                })
            },
            { setting_key: 'pos_open_status', setting_value: 'true' }
        ]);

        const result = await useCase({ payload: quoteDeliveryPayload() });

        expect(result.success).toBe(true);
        expect(Number(result.data.delivery_fee)).toBeCloseTo(20, 4);
    });

    it('resolves 0 for a non-delivery order method regardless of fee-mode config, same as before this phase', async () => {
        const useCase = buildQuoteUseCase([
            ...registeredTransactionSettings(),
            { setting_key: 'store_delivery_fee', setting_value: '20' },
            { setting_key: 'store_delivery_fee_mode', setting_value: 'calculated' },
            { setting_key: 'pos_open_status', setting_value: 'true' }
        ]);

        const result = await useCase({
            payload: {
                ...quoteDeliveryPayload(),
                order_method: 'pickup',
                delivery_address: undefined
            }
        });

        expect(result.success).toBe(true);
        expect(Number(result.data.delivery_fee)).toBe(0);
    });
});
