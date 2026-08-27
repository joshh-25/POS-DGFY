// #622, RF-2 (PR #1095 review): `tests/storeGuestCheckoutProof.test.js` covers
// `assertGuestCheckoutAllowed` in isolation, but that's a decision-function unit test, not proof
// that a `storefront_guest_checkout_enabled: false` setting actually rejects a real caller at each
// of the four enforcement sites before any persistence/payment-session side effect, and still lets
// a DGFY-linked customer through the same door. This file closes that gap directly, one describe
// block per call site, reusing each site's already-proven fixture shape from its neighbouring test
// file rather than inventing a new one:
//   - buildStoreCheckoutUseCase          <- tests/storeCheckoutAffiliatePricing.unit.test.js
//   - buildStoreCheckoutPaymentSessionUseCase <- tests/storeCheckoutDownpaymentResolution.unit.test.js
//   - buildCreateServiceBookingUseCase (single)  <- tests/servicesMode.usecases.test.js
//   - buildCreateServiceBookingBatchUseCase      <- tests/servicesMode.usecases.test.js
//
// Each site asserts three things: a guest (no storeCustomer / no dgfy_account_id) gets 403
// GUEST_CHECKOUT_DISABLED, the write/side-effect mock is never called for that rejected attempt,
// and a DGFY-linked customer (dgfy_account_id set) succeeds through the identical setting.

import { jest } from '@jest/globals';

const TENANT_ID = '33333333-3333-4333-8333-333333333333';

const registeredTransactionSettingsGuestDisabled = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    },
    { setting_key: 'storefront_guest_checkout_enabled', setting_value: 'false' }
];

const dgfyLinkedStoreCustomer = {
    customer_id: 5,
    dgfy_account_id: 'acct-1',
    name: 'Linked Buyer',
    email: 'linked@example.com',
    phone: '0917'
};

describe('#622 guest checkout disabled -- product checkout (buildStoreCheckoutUseCase)', () => {
    let buildStoreCheckoutUseCase;
    let generateStoreGuestCheckoutProof;

    beforeAll(async () => {
        ({ buildStoreCheckoutUseCase } = await import('../src/modules/store/usecases/storeUseCases.js'));
        ({ generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js'));
    });

    const buildFakeStoreRepository = ({ createdOrderId = 9101 } = {}) => {
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
                ...registeredTransactionSettingsGuestDisabled(),
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
                tracking_pin: 'SK-GCTEST',
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
        idempotency_key: `gc-checkout-${Math.floor(Math.random() * 1e9)}`,
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

    test('a guest is rejected 403 GUEST_CHECKOUT_DISABLED before the order is persisted', async () => {
        const repo = buildFakeStoreRepository();
        const useCase = buildStoreCheckoutUseCase({ storeRepository: repo });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload())
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('GUEST_CHECKOUT_DISABLED');
        expect(repo.createOnlineTransactionWithLines).not.toHaveBeenCalled();
        expect(repo.transaction.rollback).toHaveBeenCalled();
    });

    test('a DGFY-linked customer still checks out with the same setting disabled', async () => {
        const repo = buildFakeStoreRepository({ createdOrderId: 9102 });
        const useCase = buildStoreCheckoutUseCase({ storeRepository: repo });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ idempotency_key: 'gc-checkout-linked-1' })),
            storeCustomer: dgfyLinkedStoreCustomer
        });

        expect(result.success).toBe(true);
        expect(repo.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
    });
});

describe('#622 guest checkout disabled -- online payment session (buildStoreCheckoutPaymentSessionUseCase)', () => {
    let buildStoreCheckoutPaymentSessionUseCase;
    let generateStoreGuestCheckoutProof;
    let dbStore;

    beforeAll(async () => {
        process.env.STOREFRONT_PAYMENT_RETURN_URL = 'https://dgfy.ph/payment-return';
        ({ buildStoreCheckoutPaymentSessionUseCase } = await import('../src/modules/store/usecases/storeUseCases.js'));
        ({ generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js'));
        dbStore = (await import('../src/utils/dbStore.js')).default;
    });

    const buildFixtures = () => {
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
            createSession: jest.fn((attrs) => Promise.resolve({ session_id: 601, ...attrs })),
            updateSessionById: jest.fn((sessionId, attrs) => Promise.resolve({ session_id: sessionId, ...attrs }))
        };
        const paymongoService = {
            createHostedCheckoutSession: jest.fn(),
            createDirectGcashPaymentIntent: jest.fn(),
            createDirectMayaPaymentIntent: jest.fn(),
            createQrphPaymentIntent: jest.fn().mockResolvedValue({
                payment_intent_id: 'pi_gc_fixture',
                checkout_url: 'https://paymongo.example/checkout/pi_gc_fixture',
                qr_code_image_url: null,
                expires_at: new Date('2026-08-22T00:00:00Z')
            })
        };
        const storeRepository = {
            findDefaultActiveLocation: jest.fn().mockResolvedValue({
                location_id: 1,
                is_open: true,
                allow_out_of_stock_sales: true
            }),
            getSettingsByKeys: jest.fn().mockResolvedValue([
                ...registeredTransactionSettingsGuestDisabled(),
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
            requireCommerceQrphConfig: jest.fn().mockReturnValue([])
        });
        return { useCase, commercePaymentRepository, paymongoService };
    };

    const payloadFor = (idempotencyKey, email = 'buyer@example.com') => ({
        store_slug: 'gc-store',
        payment_type: 'qrph',
        idempotency_key: idempotencyKey,
        customer_name: 'Buyer',
        customer_email: email,
        customer_phone: '0917',
        order_method: 'pickup',
        lines: [{ item_id: 1, quantity: 1 }],
        guest_checkout_proof: generateStoreGuestCheckoutProof({
            tenantId: TENANT_ID,
            email,
            idempotencyKey
        })
    });

    test('a guest is rejected 403 GUEST_CHECKOUT_DISABLED before a payment session is created', async () => {
        const { useCase, commercePaymentRepository, paymongoService } = buildFixtures();

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'gc-store' }, () => useCase({
            payload: payloadFor('gc-payment-session-guest-1')
        }));

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('GUEST_CHECKOUT_DISABLED');
        expect(commercePaymentRepository.createSession).not.toHaveBeenCalled();
        expect(paymongoService.createQrphPaymentIntent).not.toHaveBeenCalled();
    });

    test('a DGFY-linked customer still gets a payment session with the same setting disabled', async () => {
        const { useCase, commercePaymentRepository } = buildFixtures();

        const result = await dbStore.run({ tenantId: TENANT_ID, tenantToken: 'gc-store' }, () => useCase({
            payload: payloadFor('gc-payment-session-linked-1', dgfyLinkedStoreCustomer.email),
            storeCustomer: dgfyLinkedStoreCustomer
        }));

        expect(result.success).toBe(true);
        expect(commercePaymentRepository.createSession).toHaveBeenCalledTimes(1);
    });
});

describe('#622 guest checkout disabled -- single service booking (buildCreateServiceBookingUseCase)', () => {
    let buildCreateServiceBookingUseCase;
    let generateStoreGuestCheckoutProof;
    let dbStore;

    const serviceItem = {
        item_id: 10,
        name: 'Consultation',
        default_sale_price: 750,
        vat_type: 'vatable',
        serviceDetail: {
            service_detail_id: 5,
            service_category: 'General',
            duration_minutes: 60,
            buffer_before_minutes: 0,
            buffer_after_minutes: 0,
            lead_time_minutes: 0,
            bookable: true,
            payment_policy: 'customer_choice'
        }
    };

    beforeAll(async () => {
        ({ buildCreateServiceBookingUseCase } = await import('../src/modules/services/usecases/serviceUseCases.js'));
        ({ generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js'));
        dbStore = (await import('../src/utils/dbStore.js')).default;
    });

    const transaction = () => ({
        finished: false,
        commit: jest.fn(async function commit() { this.finished = 'commit'; }),
        rollback: jest.fn(async function rollback() { this.finished = 'rollback'; })
    });

    const buildRepository = (tx) => ({
        beginTransaction: jest.fn(async () => tx),
        getSettingsByKeys: jest.fn(async () => registeredTransactionSettingsGuestDisabled()),
        findServiceItemById: jest.fn(async () => serviceItem),
        listActiveAssignmentsForService: jest.fn(async () => []),
        findConflictingBookings: jest.fn(async () => []),
        findStoreCustomerByEmail: jest.fn(async () => null),
        isBookingReferenceTaken: jest.fn(async () => false),
        createBooking: jest.fn(async (payload) => ({ booking_id: 501, ...payload })),
        getBookingById: jest.fn(async (id) => ({
            booking_id: id,
            public_reference: 'SV-GC1',
            service_item_id: 10,
            serviceItem,
            quantity: 1,
            start_at: new Date('2026-06-01T09:00:00Z'),
            end_at: new Date('2026-06-01T10:00:00Z'),
            status: 'requested',
            payment_timing: 'postpaid',
            payment_status: 'unpaid'
        }))
    });

    const runWithProof = (useCase, { payload, storeCustomer }) => {
        const email = String(payload.customer_email || storeCustomer?.email || 'guest@example.com').trim().toLowerCase();
        const idempotencyKey = String(payload.idempotency_key || '').trim();
        return dbStore.run({ tenantId: TENANT_ID }, () => useCase({
            payload: {
                ...payload,
                guest_checkout_proof: generateStoreGuestCheckoutProof({ tenantId: TENANT_ID, email, idempotencyKey })
            },
            source: 'storefront',
            storeCustomer
        }));
    };

    test('a guest is rejected 403 GUEST_CHECKOUT_DISABLED before the booking is persisted', async () => {
        const tx = transaction();
        const repo = buildRepository(tx);
        const useCase = buildCreateServiceBookingUseCase({ serviceRepository: repo });

        const result = await runWithProof(useCase, {
            payload: {
                service_item_id: 10,
                quantity: 1,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'gc-booking-guest-1'
            }
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('GUEST_CHECKOUT_DISABLED');
        expect(repo.createBooking).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    test('a DGFY-linked customer still books with the same setting disabled', async () => {
        const tx = transaction();
        const repo = buildRepository(tx);
        const useCase = buildCreateServiceBookingUseCase({ serviceRepository: repo });

        const result = await runWithProof(useCase, {
            payload: {
                service_item_id: 10,
                quantity: 1,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: dgfyLinkedStoreCustomer.name,
                customer_email: dgfyLinkedStoreCustomer.email,
                idempotency_key: 'gc-booking-linked-1'
            },
            storeCustomer: dgfyLinkedStoreCustomer
        });

        expect(result.success).toBe(true);
        expect(repo.createBooking).toHaveBeenCalledTimes(1);
        expect(tx.commit).toHaveBeenCalled();
    });
});

describe('#622 guest checkout disabled -- batch service booking (buildCreateServiceBookingBatchUseCase)', () => {
    let buildCreateServiceBookingBatchUseCase;
    let generateStoreGuestCheckoutProof;
    let dbStore;

    const serviceItem = {
        item_id: 10,
        name: 'Consultation',
        default_sale_price: 750,
        vat_type: 'vatable',
        serviceDetail: {
            service_detail_id: 5,
            service_category: 'General',
            duration_minutes: 60,
            buffer_before_minutes: 0,
            buffer_after_minutes: 0,
            lead_time_minutes: 0,
            bookable: true,
            payment_policy: 'customer_choice'
        }
    };

    beforeAll(async () => {
        ({ buildCreateServiceBookingBatchUseCase } = await import('../src/modules/services/usecases/serviceUseCases.js'));
        ({ generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js'));
        dbStore = (await import('../src/utils/dbStore.js')).default;
    });

    const transaction = () => ({
        finished: false,
        commit: jest.fn(async function commit() { this.finished = 'commit'; }),
        rollback: jest.fn(async function rollback() { this.finished = 'rollback'; })
    });

    const buildRepository = (tx) => ({
        beginTransaction: jest.fn(async () => tx),
        getSettingsByKeys: jest.fn(async () => registeredTransactionSettingsGuestDisabled()),
        findServiceItemById: jest.fn(async () => serviceItem),
        listActiveAssignmentsForService: jest.fn(async () => []),
        findConflictingBookings: jest.fn(async () => []),
        findStoreCustomerByEmail: jest.fn(async () => null),
        isBookingReferenceTaken: jest.fn(async () => false),
        createBooking: jest.fn(async (payload) => ({ booking_id: 601, ...payload })),
        getBookingById: jest.fn(async (id) => ({
            booking_id: id,
            public_reference: 'SV-GCB1',
            service_item_id: 10,
            serviceItem,
            quantity: 1,
            start_at: new Date('2026-06-01T09:00:00Z'),
            end_at: new Date('2026-06-01T10:00:00Z'),
            status: 'requested',
            payment_timing: 'postpaid',
            payment_status: 'unpaid'
        }))
    });

    const runWithProof = (useCase, { payload, storeCustomer }) => {
        const email = String(payload.customer_email || storeCustomer?.email || 'guest@example.com').trim().toLowerCase();
        const idempotencyKey = String(payload.idempotency_key || '').trim();
        return dbStore.run({ tenantId: TENANT_ID }, () => useCase({
            payload: {
                ...payload,
                guest_checkout_proof: generateStoreGuestCheckoutProof({ tenantId: TENANT_ID, email, idempotencyKey })
            },
            source: 'storefront',
            storeCustomer
        }));
    };

    test('a guest batch is rejected 403 GUEST_CHECKOUT_DISABLED before any booking is persisted', async () => {
        const tx = transaction();
        const repo = buildRepository(tx);
        const useCase = buildCreateServiceBookingBatchUseCase({ serviceRepository: repo });

        const result = await runWithProof(useCase, {
            payload: {
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'gc-batch-guest-1',
                bookings: [{ service_item_id: 10, quantity: 1, start_at: '2026-06-01T09:00:00Z' }]
            }
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('GUEST_CHECKOUT_DISABLED');
        expect(repo.createBooking).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    test('a DGFY-linked customer batch still books with the same setting disabled', async () => {
        const tx = transaction();
        const repo = buildRepository(tx);
        const useCase = buildCreateServiceBookingBatchUseCase({ serviceRepository: repo });

        const result = await runWithProof(useCase, {
            payload: {
                customer_name: dgfyLinkedStoreCustomer.name,
                customer_email: dgfyLinkedStoreCustomer.email,
                idempotency_key: 'gc-batch-linked-1',
                bookings: [{ service_item_id: 10, quantity: 1, start_at: '2026-06-01T09:00:00Z' }]
            },
            storeCustomer: dgfyLinkedStoreCustomer
        });

        expect(result.success).toBe(true);
        expect(repo.createBooking).toHaveBeenCalledTimes(1);
        expect(tx.commit).toHaveBeenCalled();
    });
});
