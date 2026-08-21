// Unit tests for Phase 140 (#821, ADR 0069/0070) -- server-authoritative downpayment resolution at
// quote/checkout. Covers the three resolveCheckoutContext callers:
//   - buildStoreCartQuoteUseCase: the split is computed and exposed (read-only preview, allowed).
//   - buildStoreCheckoutUseCase: a downpayment_required order is rejected 422
//     DOWNPAYMENT_CAPTURE_NOT_AVAILABLE (capture isn't wired until Phase 141, #822).
//   - buildStoreCheckoutPaymentSessionUseCase: same rejection, checked before the full order total
//     would otherwise be authorized online (ADR 0069 clause 1b [binding]).
//
// No database is used anywhere in this file. storeRepository/downpaymentSettingsRepository are
// hand-built fakes -- downpaymentSettingsRepository is dependency-injected (no default), the same
// pattern as tenantRevenueRepository, so a test that omits it exercises the "no ambient repo ->
// full_payment" fallback exactly as every pre-existing store unit test does. Fixture shapes mirror
// tests/storeCheckoutVoucherPromoStacking.unit.test.js (quote) and
// tests/storeCheckoutAffiliatePricing.unit.test.js (checkout).

import { jest } from '@jest/globals';

const {
    buildStoreCartQuoteUseCase,
    buildStoreCheckoutUseCase,
    buildStoreCheckoutPaymentSessionUseCase
} = await import('../src/modules/store/usecases/storeUseCases.js');
const { generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js');
const dbStore = (await import('../src/utils/dbStore.js')).default;

const TENANT_ID = '22222222-2222-4222-8222-222222222222';

const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    }
];

const fakeDownpaymentSettingsRepository = (settings) => ({
    getSettings: jest.fn().mockResolvedValue(settings)
});

const downpaymentRequiredSettings = (overrides = {}) => ({
    tenant_id: TENANT_ID,
    payment_mode: 'downpayment_required',
    downpayment_type: 'percentage',
    downpayment_rate_bps: 2000, // 20%
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true,
    allowed_capture_methods: null,
    ...overrides
});

const fullPaymentSettings = () => ({
    tenant_id: TENANT_ID,
    payment_mode: 'full_payment',
    downpayment_type: null,
    downpayment_rate_bps: null,
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true,
    allowed_capture_methods: null
});

// --- Quote fixture (mirrors storeCheckoutVoucherPromoStacking.unit.test.js) ---

const buildFakeQuoteStoreRepository = () => ({
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
            default_sale_price: 500,
            cost_per_unit: 10,
            unit_of_measure: 'pc',
            vat_type: 'vatable'
        }
    ])
});

const quotePayload = (overrides = {}) => ({
    location_id: 2,
    order_method: 'pickup',
    payment_type: 'cash',
    lines: [{ item_id: 40, quantity: 1 }],
    ...overrides
});

describe('buildStoreCartQuoteUseCase — Phase 140 downpayment resolution', () => {
    test('exposes the computed split when the tenant has downpayment_required configured', async () => {
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: buildFakeQuoteStoreRepository(),
            downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(downpaymentRequiredSettings())
        });

        const result = await dbStore.run({ tenantId: TENANT_ID }, () => useCase({ payload: quotePayload() }));

        expect(result.success).toBe(true);
        expect(result.data.total_amount).toBe(505); // 500 subtotal + 1% (5) service fee, no delivery
        expect(result.data.payment_mode).toBe('downpayment_required');
        expect(result.data.downpayment_amount).toBe(101); // 20% of 505
        expect(result.data.balance_due_amount).toBe(404);
        expect(result.data.downpayment_refundable).toBe(true);
    });

    test('exposes null downpayment fields when the tenant is full_payment', async () => {
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: buildFakeQuoteStoreRepository(),
            downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(fullPaymentSettings())
        });

        const result = await dbStore.run({ tenantId: TENANT_ID }, () => useCase({ payload: quotePayload() }));

        expect(result.success).toBe(true);
        expect(result.data.payment_mode).toBe('full_payment');
        expect(result.data.downpayment_amount).toBeNull();
        expect(result.data.balance_due_amount).toBeNull();
        expect(result.data.downpayment_refundable).toBeNull();
    });

    test('no downpaymentSettingsRepository injected (every pre-Phase-140 caller) resolves to full_payment, not an error', async () => {
        const useCase = buildStoreCartQuoteUseCase({ storeRepository: buildFakeQuoteStoreRepository() });

        const result = await dbStore.run({ tenantId: TENANT_ID }, () => useCase({ payload: quotePayload() }));

        expect(result.success).toBe(true);
        expect(result.data.payment_mode).toBe('full_payment');
        expect(result.data.downpayment_amount).toBeNull();
    });

    test('no ambient tenant at all (repository injected but no dbStore context) also resolves to full_payment', async () => {
        const repo = fakeDownpaymentSettingsRepository(downpaymentRequiredSettings());
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: buildFakeQuoteStoreRepository(),
            downpaymentSettingsRepository: repo
        });

        const result = await useCase({ payload: quotePayload() });

        expect(result.success).toBe(true);
        expect(result.data.payment_mode).toBe('full_payment');
        expect(repo.getSettings).not.toHaveBeenCalled();
    });
});

// --- Checkout fixture (mirrors storeCheckoutAffiliatePricing.unit.test.js) ---

const buildFakeCheckoutStoreRepository = ({ createdOrderId = 9001 } = {}) => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; }),
        LOCK: { UPDATE: 'UPDATE' }
    };
    return {
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
            ...registeredTransactionSettings(),
            { setting_key: 'store_delivery_fee', setting_value: '0' },
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
        createOnlineTransactionWithLines: jest.fn().mockResolvedValue(createdOrderId),
        getOrderById: jest.fn().mockResolvedValue({
            pos_transaction_id: createdOrderId,
            tracking_pin: 'SK-DPTEST',
            invoice_number: 'INV-000001',
            order_source: 'online_store',
            order_method: 'pickup',
            payment_type: 'cash',
            payment_status: 'paid',
            fulfillment_status: 'placed',
            subtotal_amount: 500,
            discount_amount: 0,
            service_fee_amount: 5,
            delivery_fee: 0,
            total_amount: 505,
            customer_name: 'Buyer',
            customer_phone: '0917',
            customer_email: null,
            location: { location_id: 2, name: 'Main', address_line: 'Address' },
            lines: []
        }),
        nextInvoiceNumber: jest.fn().mockResolvedValue('INV-000001'),
        isTrackingPinTaken: jest.fn().mockResolvedValue(false),
        updateSettingByKey: jest.fn().mockResolvedValue({}),
        _transaction: transaction
    };
};

const checkoutPayload = (overrides = {}) => ({
    location_id: 2,
    order_method: 'pickup',
    payment_type: 'cash',
    payment_status: 'paid',
    idempotency_key: `dp-checkout-${Math.floor(Math.random() * 1e9)}`,
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

describe('buildStoreCheckoutUseCase — Phase 140 fail-closed guard (ADR 0070 clause 7)', () => {
    test('rejects 422 DOWNPAYMENT_CAPTURE_NOT_AVAILABLE for a downpayment_required tenant, no order created', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const useCase = buildStoreCheckoutUseCase({
            storeRepository,
            downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(downpaymentRequiredSettings())
        });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(checkoutPayload())
        });

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(422);
        expect(result.error?.details?.reason_code).toBe('DOWNPAYMENT_CAPTURE_NOT_AVAILABLE');
        expect(storeRepository.createOnlineTransactionWithLines).not.toHaveBeenCalled();
        expect(storeRepository._transaction.rollback).toHaveBeenCalled();
        expect(storeRepository._transaction.commit).not.toHaveBeenCalled();
    });

    test('a full_payment tenant checks out normally and totals carry the null downpayment shape', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const useCase = buildStoreCheckoutUseCase({
            storeRepository,
            downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(fullPaymentSettings())
        });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(checkoutPayload())
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.payment_mode).toBe('full_payment');
        expect(result.data.totals.downpayment_amount).toBeNull();
        expect(storeRepository.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
    });

    test('no downpaymentSettingsRepository injected checks out normally (every pre-Phase-140 test path)', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository();
        const useCase = buildStoreCheckoutUseCase({ storeRepository });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(checkoutPayload())
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.payment_mode).toBe('full_payment');
    });
});

// --- Payment-session fixture (mirrors storeDirectGcash.usecase.test.js) ---

describe('buildStoreCheckoutPaymentSessionUseCase — Phase 140 fail-closed guard (ADR 0069 clause 1b)', () => {
    test('rejects 422 DOWNPAYMENT_CAPTURE_NOT_AVAILABLE before authorizing the full total online', async () => {
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
            createSession: jest.fn(),
            updateSessionById: jest.fn()
        };
        const paymongoService = {
            createHostedCheckoutSession: jest.fn(),
            createDirectGcashPaymentIntent: jest.fn(),
            createDirectMayaPaymentIntent: jest.fn()
        };
        const storeRepository = {
            findDefaultActiveLocation: jest.fn().mockResolvedValue({
                location_id: 1,
                is_open: true,
                allow_out_of_stock_sales: true
            }),
            getSettingsByKeys: jest.fn().mockResolvedValue([
                ...registeredTransactionSettings(),
                { setting_key: 'store_delivery_fee', setting_value: '0' },
                { setting_key: 'pos_open_status', setting_value: 'true' }
            ]),
            findSellableItemsByIds: jest.fn().mockResolvedValue([{
                item_id: 1,
                name: 'Test Item',
                default_sale_price: 500,
                sale_price: 500,
                is_available: true,
                availability_status: 'in_stock'
            }])
        };

        const useCase = buildStoreCheckoutPaymentSessionUseCase({
            storeRepository,
            commercePaymentRepository,
            paymongoService,
            commercePaymentsEnabled: true,
            commerceQrphEnabled: true,
            requireCommerceQrphConfig: jest.fn().mockReturnValue([]),
            downpaymentSettingsRepository: fakeDownpaymentSettingsRepository(downpaymentRequiredSettings())
        });

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'dp-store' }, () => useCase({
            payload: {
                store_slug: 'dp-store',
                payment_type: 'qrph',
                idempotency_key: 'dp-payment-session-1',
                customer_name: 'Buyer',
                customer_email: 'buyer@example.com',
                customer_phone: '0917',
                order_method: 'pickup',
                lines: [{ item_id: 1, quantity: 1 }]
            }
        }));

        expect(result.success).toBe(false);
        expect(result.error?.statusCode).toBe(422);
        expect(result.error?.details?.reason_code).toBe('DOWNPAYMENT_CAPTURE_NOT_AVAILABLE');
        expect(commercePaymentRepository.createSession).not.toHaveBeenCalled();
        expect(paymongoService.createHostedCheckoutSession).not.toHaveBeenCalled();
    });
});
