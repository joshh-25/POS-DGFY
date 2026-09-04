// #626, RF-1 (PR #1194 review): the PR claims server-side enforcement for a disabled store's cash
// payment (storeUseCases.js:3066), but the tests it shipped with only cover policy normalization
// and storefront option filtering -- not `buildStoreCheckoutUseCase` itself. This file closes that
// gap directly, mirroring the shape `tests/guestCheckoutDisabledEnforcement.usecase.test.js`
// already proved out for the neighbouring `assertGuestCheckoutAllowed` guard at the same call site:
// a `storefront_cash_payment_enabled: false` request with `payment_type: 'cash'` is rejected with
// HTTP 422 / `details.reason_code: STORE_CASH_DISABLED` before any persistence, with the
// transaction rolled back; the enabled and unset (fail-open) paths both retain existing behavior,
// creating the order and committing the transaction.

import { jest } from '@jest/globals';

const TENANT_ID = '44444444-4444-4444-8444-444444444444';

const registeredTransactionSettings = (extra = []) => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    },
    ...extra
];

describe('#626 cash payment disabled -- product checkout (buildStoreCheckoutUseCase)', () => {
    let buildStoreCheckoutUseCase;
    let generateStoreGuestCheckoutProof;

    beforeAll(async () => {
        ({ buildStoreCheckoutUseCase } = await import('../src/modules/store/usecases/storeUseCases.js'));
        ({ generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js'));
    });

    const buildFakeStoreRepository = ({ createdOrderId = 9201, settingRows = [] } = {}) => {
        const transaction = {
            finished: false,
            commit: jest.fn(async () => { transaction.finished = 'commit'; }),
            rollback: jest.fn(async () => { transaction.finished = 'rollback'; }),
            LOCK: { UPDATE: 'UPDATE' }
        };
        return {
            transaction,
            beginTransaction: jest.fn().mockResolvedValue(transaction),
            findLocationById: jest.fn().mockResolvedValue({
                location_id: 2,
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
                ...registeredTransactionSettings(settingRows),
                { setting_key: 'store_delivery_fee', setting_value: '0' },
                { setting_key: 'pos_open_status', setting_value: 'true' }
            ]),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 40,
                name: 'Widget',
                current_stock: 100,
                default_sale_price: 100,
                cost_per_unit: 10,
                unit_of_measure: 'pc',
                vat_type: 'vatable'
            }]),
            findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
            createOnlineTransactionWithLines: jest.fn().mockResolvedValue(createdOrderId),
            getOrderById: jest.fn().mockResolvedValue({
                pos_transaction_id: createdOrderId,
                tracking_pin: 'SK-CASHTEST',
                invoice_number: 'INV-000001',
                order_source: 'online_store',
                order_method: 'pickup',
                payment_type: 'cash',
                payment_status: 'paid',
                fulfillment_status: 'placed',
                subtotal_amount: 100,
                discount_amount: 0,
                service_fee_amount: 1,
                delivery_fee: 0,
                total_amount: 101,
                customer_name: 'Buyer',
                customer_phone: '0917',
                customer_email: null,
                location: { location_id: 2, name: 'Main', address_line: 'Address' },
                lines: []
            }),
            nextInvoiceNumber: jest.fn().mockResolvedValue('INV-000001'),
            isTrackingPinTaken: jest.fn().mockResolvedValue(false),
            updateSettingByKey: jest.fn().mockResolvedValue({})
        };
    };

    const basePayload = (overrides = {}) => ({
        location_id: 2,
        order_method: 'pickup',
        payment_type: 'cash',
        payment_status: 'paid',
        payment_reference: 'CLIENT-SUPPLIED-REFERENCE',
        payment_provider: 'client-supplied-provider',
        idempotency_key: `cash-checkout-${Math.floor(Math.random() * 1e9)}`,
        customer_name: 'Buyer',
        customer_phone: '0917',
        customer_email: 'buyer@example.com',
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

    test('a cash order is rejected 422 STORE_CASH_DISABLED before the order is persisted', async () => {
        const repo = buildFakeStoreRepository({
            settingRows: [{ setting_key: 'storefront_cash_payment_enabled', setting_value: 'false' }]
        });
        const useCase = buildStoreCheckoutUseCase({ storeRepository: repo });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: basePayload()
        });

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(422);
        expect(result.error?.details?.reason_code).toBe('STORE_CASH_DISABLED');
        expect(repo.createOnlineTransactionWithLines).not.toHaveBeenCalled();
        expect(repo.transaction.rollback).toHaveBeenCalled();
        expect(repo.transaction.commit).not.toHaveBeenCalled();
    });

    test('a cash order still checks out when the setting is explicitly enabled', async () => {
        const repo = buildFakeStoreRepository({
            createdOrderId: 9202,
            settingRows: [{ setting_key: 'storefront_cash_payment_enabled', setting_value: 'true' }]
        });
        const useCase = buildStoreCheckoutUseCase({ storeRepository: repo });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ idempotency_key: 'cash-checkout-enabled-1' }))
        });

        expect(result.success).toBe(true);
        expect(repo.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
        expect(repo.transaction.commit).toHaveBeenCalled();
        expect(repo.transaction.rollback).not.toHaveBeenCalled();
    });

    test('a cash order still checks out when the setting is unset (fail-open default)', async () => {
        const repo = buildFakeStoreRepository({ createdOrderId: 9203, settingRows: [] });
        const useCase = buildStoreCheckoutUseCase({ storeRepository: repo });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ idempotency_key: 'cash-checkout-unset-1' }))
        });

        expect(result.success).toBe(true);
        expect(repo.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
        expect(repo.transaction.commit).toHaveBeenCalled();
        expect(repo.transaction.rollback).not.toHaveBeenCalled();
    });
});
