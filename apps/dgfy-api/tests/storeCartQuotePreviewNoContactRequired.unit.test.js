// #746: the cart-quote preview (buildStoreCartQuoteUseCase) used to require customer_name, then
// customer_phone/email, then delivery_address (for a delivery order) before it would compute
// anything at all -- including the voucher/promo discount, which never reads any of those fields.
// A shopper applying a voucher from the cart drawer, before reaching checkout, has typically
// entered none of them yet, so the quote 422'd and the drawer silently showed the undiscounted
// total forever. Live-reproduced 2026-08-20 against a real tenant, including for a SIGNED-IN
// customer (the identity-resolution half of this bug, fixed separately on the frontend by
// selecting the right auth token -- this file covers the backend half: the requirement itself).
//
// Fix: resolveCheckoutContext gained a `requireCheckoutContact` option (default true, unchanged
// for every order-placing caller); buildStoreCartQuoteUseCase is the one caller that passes false.
//
// Same fake-repository pattern as storeCheckoutVoucherPromoStacking.unit.test.js -- no database,
// storeRepository is hand-built covering exactly what the quote path touches.

import { jest } from '@jest/globals';

const { buildStoreCartQuoteUseCase } = await import('../src/modules/store/usecases/storeUseCases.js');

const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    }
];

const buildFakeStoreRepository = () => ({
    findLocationById: jest.fn().mockResolvedValue({
        location_id: 2,
        name: 'Main',
        address_line: 'Address',
        delivery_radius_km: 5,
        is_open: true,
        is_active: true,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        allow_out_of_stock_sales: false
    }),
    getSettingsByKeys: jest.fn().mockResolvedValue([
        ...registeredTransactionSettings(),
        { setting_key: 'store_delivery_fee', setting_value: '0' },
        { setting_key: 'pos_open_status', setting_value: 'true' }
    ]),
    findSellableItemsByIds: jest.fn().mockResolvedValue([
        {
            item_id: 40,
            name: 'Widget',
            current_stock: 100,
            default_sale_price: 80,
            cost_per_unit: 67,
            unit_of_measure: 'pc',
            vat_type: 'vatable'
        }
    ])
});

const noContactPayload = (overrides = {}) => ({
    location_id: 2,
    order_method: 'delivery',
    payment_type: 'cash',
    // Deliberately absent: customer_name, customer_phone, customer_email, delivery_address --
    // exactly the state of a shopper who just opened the cart drawer and applied a code.
    lines: [{ item_id: 40, quantity: 13 }],
    ...overrides
});

describe('storefront cart-quote preview — #746 no checkout-contact requirement', () => {
    test('computes a quote with no customer_name, phone, email, or delivery_address', async () => {
        const useCase = buildStoreCartQuoteUseCase({ storeRepository: buildFakeStoreRepository() });

        const result = await useCase({ payload: noContactPayload() });

        expect(result.success).toBe(true);
    });

    test('does not require delivery_address even when order_method is delivery', async () => {
        const useCase = buildStoreCartQuoteUseCase({ storeRepository: buildFakeStoreRepository() });

        const result = await useCase({ payload: noContactPayload({ order_method: 'delivery' }) });

        expect(result.success).toBe(true);
    });

    test('still computes the correct subtotal for the cart with no identity supplied', async () => {
        const useCase = buildStoreCartQuoteUseCase({ storeRepository: buildFakeStoreRepository() });

        const result = await useCase({ payload: noContactPayload() });

        // 13 units at the fake item's default_sale_price (80) -- proves the quote actually ran the
        // real pricing path rather than short-circuiting on some other silent default.
        expect(result.data.subtotal_amount).toBe(1040);
    });

    test('a customer_name supplied anyway (e.g. from a signed-in account) still works', async () => {
        const useCase = buildStoreCartQuoteUseCase({ storeRepository: buildFakeStoreRepository() });

        const result = await useCase({
            payload: noContactPayload({ customer_name: 'Signed-in Shopper' })
        });

        expect(result.success).toBe(true);
    });
});
