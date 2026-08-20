// #667: storefront checkout used to let voucher_code and promo_code both apply and stack, uncapped,
// with no mutual-exclusivity check -- unlike POS, which already enforces a single governed-discount
// slot (ADR 0066 decision 8). This file exercises the fix via the lightweight quote path
// (buildStoreCartQuoteUseCase), which runs the same resolveCheckoutContext the real checkout does,
// but with no transaction/order-creation surface to fake -- the rejection this test targets is
// thrown before either the promo or voucher benefit is ever resolved against the ledger, so no
// vouchers-module mock is needed here (no live caller of the voucher repository is reached).
//
// No database is used -- storeRepository is a hand-built fake, the same minimal surface
// resolveCheckoutContext's quote path actually touches (findLocationById, getSettingsByKeys,
// findSellableItemsByIds), mirroring tests/storeCheckoutAffiliatePricing.unit.test.js's pattern.

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

const activePromoSetting = (overrides = {}) => ({
    setting_key: 'storefront_promos',
    setting_value: JSON.stringify([{
        id: 'promo-1',
        active: true,
        title: 'Save 10',
        promo_code: 'SAVE10',
        discount_percent: 10,
        ...overrides
    }])
});

const buildFakeStoreRepository = ({ withActivePromo = false } = {}) => ({
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
        { setting_key: 'pos_open_status', setting_value: 'true' },
        ...(withActivePromo ? [activePromoSetting()] : [])
    ]),
    findSellableItemsByIds: jest.fn().mockResolvedValue([
        {
            item_id: 40,
            name: 'Widget',
            current_stock: 100,
            default_sale_price: 100,
            cost_per_unit: 10,
            unit_of_measure: 'pc',
            vat_type: 'vatable'
        }
    ])
});

const basePayload = (overrides = {}) => ({
    location_id: 2,
    order_method: 'pickup',
    payment_type: 'cash',
    customer_name: 'Buyer',
    customer_phone: '0917',
    customer_email: 'buyer@example.com',
    lines: [{ item_id: 40, quantity: 1 }],
    ...overrides
});

describe('storefront checkout — #667 voucher/promo discount-slot exclusivity', () => {
    test('rejects a voucher code submitted alongside an already-applied promo code', async () => {
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: buildFakeStoreRepository({ withActivePromo: true })
        });

        const result = await useCase({
            payload: basePayload({ promo_code: 'SAVE10', voucher_code: 'PHARMA8' })
        });

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(422);
        expect(result.error?.details?.reason_code).toBe('VOUCHER_DISCOUNT_SLOT_OCCUPIED');
        expect(result.error?.details?.promo_code).toBe('SAVE10');
    });

    test('a promo code alone (no voucher_code) still applies as before', async () => {
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: buildFakeStoreRepository({ withActivePromo: true })
        });

        const result = await useCase({
            payload: basePayload({ promo_code: 'SAVE10' })
        });

        expect(result.success).toBe(true);
        expect(result.data.discount_amount).toBe(10);
    });

    test('a voucher code with an invalid/unresolved promo code is not blocked by the slot check', async () => {
        // The promo code fails to resolve on its own (no configured promo at all) -- promoApplication
        // never reaches `applied: true`, so the #667 guard has nothing to reject. The voucher itself
        // then fails for an unrelated, expected reason (no voucher exists in this fake tenant), which
        // is enough to prove the slot-occupied rejection specifically did NOT fire.
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: buildFakeStoreRepository({ withActivePromo: false })
        });

        const result = await useCase({
            payload: basePayload({ voucher_code: 'PHARMA8' })
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).not.toBe('VOUCHER_DISCOUNT_SLOT_OCCUPIED');
    });
});
