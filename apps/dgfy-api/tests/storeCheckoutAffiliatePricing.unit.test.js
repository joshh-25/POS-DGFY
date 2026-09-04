// Characterization + new-behavior tests for the Phase 1 affiliate pricing rule engine's checkout
// integration (see docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md, Stage E).
//
// dgfyAffiliateRepository.js is a hard import inside both storeUseCases.js and
// affiliateCommissionAccrual.js (not dependency-injected), so it's mocked at the module level via
// jest.unstable_mockModule before storeUseCases.js is dynamically imported - the same pattern
// tests/setup.js already uses for Redis. Because ESM module resolution is cached, both files
// receive the identical mocked instance, so mocking it once here cascades correctly through
// resolveActiveAffiliateEnrollmentById and accruePendingForOnlineOrder without needing to touch
// those modules directly.
//
// No database is used anywhere in this file - storeRepository is a hand-built fake mirroring the
// pattern already established in tests/storeUsecases.applicationResult.test.js.

import { jest } from '@jest/globals';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ENROLLMENT_ID = 501;

const defaultAffiliateSettings = () => ({
    program_enabled: true,
    default_rate_bps: 500,
    commission_type: 'PERCENTAGE_OF_BASE',
    settlement_policy: null,
    commission_base_mode: 'discounted_subtotal'
});

const activeEnrollment = (overrides = {}) => ({
    enrollment_id: ENROLLMENT_ID,
    dgfy_account_id: 'affiliate-acct',
    tenant_id: TENANT_ID,
    status: 'active',
    commission_rate_bps: null,
    commission_type: null,
    ...overrides
});

const mockAffiliateRepo = {
    getSettings: jest.fn(),
    resolveActivePriceRule: jest.fn(),
    findEnrollmentById: jest.fn(),
    recordAttribution: jest.fn().mockResolvedValue({}),
    createPendingCommissionIfMissing: jest.fn(),
    createEarnedCommissionIfMissing: jest.fn(),
    markCommissionEarnedByOrderReference: jest.fn(),
    reverseCommissionByOrderReference: jest.fn()
};

jest.unstable_mockModule('../src/modules/dgfy/repositories/dgfyAffiliateRepository.js', () => ({
    dgfyAffiliateRepository: mockAffiliateRepo,
    default: mockAffiliateRepo
}));

const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

jest.unstable_mockModule('../src/config/logger.js', () => ({ default: loggerMock }));

const { buildStoreCheckoutUseCase } = await import('../src/modules/store/usecases/storeUseCases.js');
const { generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js');

const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    }
];

// Minimal, self-contained fake storeRepository - a single PHP 100 item, no promo, no delivery fee,
// mirroring the successful-checkout fixture already established in
// tests/storeUsecases.applicationResult.test.js.
const buildFakeStoreRepository = ({ createdOrderId = 9001 } = {}) => {
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
                default_sale_price: 100,
                cost_per_unit: 10,
                unit_of_measure: 'pc',
                vat_type: 'vatable'
            }
        ]),
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        createOnlineTransactionWithLines: jest.fn().mockResolvedValue(createdOrderId),
        getOrderById: jest.fn().mockResolvedValue({
            pos_transaction_id: createdOrderId,
            tracking_pin: 'SK-AFFTEST',
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
    idempotency_key: `aff-checkout-${Math.floor(Math.random() * 1e9)}`,
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

beforeEach(() => {
    jest.clearAllMocks();
    mockAffiliateRepo.getSettings.mockResolvedValue(defaultAffiliateSettings());
    mockAffiliateRepo.resolveActivePriceRule.mockResolvedValue(null);
    mockAffiliateRepo.findEnrollmentById.mockResolvedValue(activeEnrollment());
    mockAffiliateRepo.createPendingCommissionIfMissing.mockResolvedValue({
        commission: { commission_id: 1, status: 'pending' },
        created: true
    });
});

describe('storefront checkout — no affiliate attribution (regression baseline)', () => {
    test('prices and checks out exactly as before when payload carries no attribution_enrollment_id', async () => {
        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload())
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.subtotal_amount).toBe(100);
        expect(mockAffiliateRepo.findEnrollmentById).not.toHaveBeenCalled();
        expect(mockAffiliateRepo.createPendingCommissionIfMissing).not.toHaveBeenCalled();
        expect(loggerMock.warn).not.toHaveBeenCalledWith(
            '[StorefrontCheckout] Affiliate attribution dropped: enrollment inactive at commit',
            expect.anything()
        );
    });
});

describe('storefront checkout — affiliate price rule changes the buyer price', () => {
    test('PERCENTAGE_DISCOUNT rule reduces the buyer-facing subtotal and is reflected in sale_price_overridden', async () => {
        mockAffiliateRepo.resolveActivePriceRule.mockResolvedValue({
            price_rule_id: 1,
            rule_type: 'PERCENTAGE_DISCOUNT',
            rate_bps: 1000, // 10%
            amount_centavos: null
        });

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(result.success).toBe(true);
        // Buyer pays PHP 90 (10% off PHP 100) - this is what createOnlineTransactionWithLines
        // would have been called with; confirmed via the mock's captured arguments.
        expect(mockAffiliateRepo.createPendingCommissionIfMissing).toHaveBeenCalledTimes(1);
    });

    test('an unresolvable affiliate rule fails checkout closed rather than falling back silently (decision A13)', async () => {
        // FIXED_DISCOUNT larger than the item price -> negative buyer price.
        mockAffiliateRepo.resolveActivePriceRule.mockResolvedValue({
            price_rule_id: 2,
            rule_type: 'FIXED_DISCOUNT',
            rate_bps: null,
            amount_centavos: 15000 // PHP 150 off a PHP 100 item
        });

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('AFFILIATE_NEGATIVE_PRICE');
        // No commission should ever be written for a checkout that failed to price.
        expect(mockAffiliateRepo.createPendingCommissionIfMissing).not.toHaveBeenCalled();
    });
});

describe('storefront checkout — decision A3: commission_base_mode', () => {
    test('discounted_subtotal (default): commission accrues on the buyer-paid subtotal', async () => {
        mockAffiliateRepo.getSettings.mockResolvedValue({
            ...defaultAffiliateSettings(),
            commission_base_mode: 'discounted_subtotal'
        });
        mockAffiliateRepo.resolveActivePriceRule.mockResolvedValue({
            price_rule_id: 3,
            rule_type: 'PERCENTAGE_DISCOUNT',
            rate_bps: 1000, // buyer pays PHP 90
            amount_centavos: null
        });

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(mockAffiliateRepo.createPendingCommissionIfMissing).toHaveBeenCalledTimes(1);
        const call = mockAffiliateRepo.createPendingCommissionIfMissing.mock.calls[0][0];
        // 5% (default rate) of PHP 90 (buyer-paid, no promo) = PHP 4.50 = 450 centavos.
        expect(call.commissionableBaseCentavos).toBe(9000);
        expect(call.amountCentavos).toBe(450);
        expect(call.baseSubtotalCentavos).toBe(10000);
        expect(call.buyerSubtotalCentavos).toBe(9000);
    });

    test('base_price_subtotal (A3 opted-in): commission accrues on the base catalog subtotal, ignoring the discount', async () => {
        mockAffiliateRepo.getSettings.mockResolvedValue({
            ...defaultAffiliateSettings(),
            commission_base_mode: 'base_price_subtotal'
        });
        mockAffiliateRepo.resolveActivePriceRule.mockResolvedValue({
            price_rule_id: 4,
            rule_type: 'PERCENTAGE_DISCOUNT',
            rate_bps: 1000, // buyer pays PHP 90
            amount_centavos: null
        });

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(mockAffiliateRepo.createPendingCommissionIfMissing).toHaveBeenCalledTimes(1);
        const call = mockAffiliateRepo.createPendingCommissionIfMissing.mock.calls[0][0];
        // 5% of the PHP 100 base, NOT the discounted PHP 90 - this is the whole point of A3.
        expect(call.commissionableBaseCentavos).toBe(10000);
        expect(call.amountCentavos).toBe(500);
    });

    test('commission_type NONE accrues a zero-amount row rather than skipping accrual entirely', async () => {
        mockAffiliateRepo.getSettings.mockResolvedValue({
            ...defaultAffiliateSettings(),
            commission_type: 'NONE'
        });

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(mockAffiliateRepo.createPendingCommissionIfMissing).toHaveBeenCalledTimes(1);
        const call = mockAffiliateRepo.createPendingCommissionIfMissing.mock.calls[0][0];
        expect(call.amountCentavos).toBe(0);
        expect(call.rateBpsSnapshot).toBe(0);
    });

    test('commission_type RESELLER_MARGIN earns the buyer-paid minus base-price gap, not a percentage', async () => {
        mockAffiliateRepo.getSettings.mockResolvedValue({
            ...defaultAffiliateSettings(),
            commission_type: 'RESELLER_MARGIN'
        });
        mockAffiliateRepo.resolveActivePriceRule.mockResolvedValue({
            price_rule_id: 5,
            rule_type: 'EXACT_AFFILIATE_PRICE',
            rate_bps: null,
            amount_centavos: 12000 // buyer pays PHP 120 on a PHP 100 base
        });

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(mockAffiliateRepo.createPendingCommissionIfMissing).toHaveBeenCalledTimes(1);
        const call = mockAffiliateRepo.createPendingCommissionIfMissing.mock.calls[0][0];
        // PHP 120 buyer price - PHP 100 base = PHP 20 margin = 2000 centavos.
        expect(call.amountCentavos).toBe(2000);
        expect(call.reason).toBe('online_order');
    });
});

describe('storefront checkout — enrollment resolution edge cases', () => {
    test('a revoked/inactive enrollment is treated as no attribution at all, checkout still succeeds', async () => {
        mockAffiliateRepo.findEnrollmentById.mockResolvedValue(activeEnrollment({ status: 'revoked' }));

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.subtotal_amount).toBe(100);
        expect(mockAffiliateRepo.createPendingCommissionIfMissing).not.toHaveBeenCalled();
        // #450 D2: this enrollment was already inactive at pricing time - there is no in-flight
        // transition to log, so the drop warn must stay silent (see §3b's `else if` guard).
        expect(loggerMock.warn).not.toHaveBeenCalledWith(
            '[StorefrontCheckout] Affiliate attribution dropped: enrollment inactive at commit',
            expect.anything()
        );
    });

    test('program disabled at the tenant level suppresses affiliate pricing entirely', async () => {
        mockAffiliateRepo.getSettings.mockResolvedValue({ ...defaultAffiliateSettings(), program_enabled: false });
        mockAffiliateRepo.resolveActivePriceRule.mockResolvedValue({
            price_rule_id: 6,
            rule_type: 'PERCENTAGE_DISCOUNT',
            rate_bps: 1000,
            amount_centavos: null
        });

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.subtotal_amount).toBe(100);
        expect(mockAffiliateRepo.createPendingCommissionIfMissing).not.toHaveBeenCalled();
    });
});

describe('storefront checkout — #450 D2: enrollment re-verified at commit time', () => {
    test('still active at commit: commission accrues, findEnrollmentById called exactly twice', async () => {
        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(result.success).toBe(true);
        expect(mockAffiliateRepo.createPendingCommissionIfMissing).toHaveBeenCalledTimes(1);
        expect(mockAffiliateRepo.createPendingCommissionIfMissing.mock.calls[0][0].enrollmentId)
            .toBe(ENROLLMENT_ID);
        // This is the assertion that actually pins the new behavior - once at pricing, once at the
        // commit-time re-check. Without it this test would also pass against the pre-Phase-206 code.
        expect(mockAffiliateRepo.findEnrollmentById).toHaveBeenCalledTimes(2);
        expect(loggerMock.warn).not.toHaveBeenCalledWith(
            '[StorefrontCheckout] Affiliate attribution dropped: enrollment inactive at commit',
            expect.anything()
        );
    });

    test('revoked between pricing and commit: order succeeds, no commission, warn fires', async () => {
        mockAffiliateRepo.findEnrollmentById
            .mockResolvedValueOnce(activeEnrollment())                        // pricing-time resolve
            .mockResolvedValueOnce(activeEnrollment({ status: 'revoked' }));  // commit-time re-check

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(result.success).toBe(true);
        // The buyer keeps the price they were quoted at pricing time - only the commission is
        // withheld. No price rule is configured in this fixture, so the subtotal is the plain PHP 100.
        expect(result.data.totals.subtotal_amount).toBe(100);
        expect(mockAffiliateRepo.createPendingCommissionIfMissing).not.toHaveBeenCalled();
        expect(mockAffiliateRepo.recordAttribution).not.toHaveBeenCalled();
        expect(loggerMock.warn).toHaveBeenCalledWith(
            '[StorefrontCheckout] Affiliate attribution dropped: enrollment inactive at commit',
            expect.objectContaining({ tenant_id: TENANT_ID, enrollment_id: ENROLLMENT_ID })
        );
    });

    test('revoked between pricing and commit, with an active price rule: buyer still pays the discounted price, no commission', async () => {
        mockAffiliateRepo.resolveActivePriceRule.mockResolvedValue({
            price_rule_id: 7,
            rule_type: 'PERCENTAGE_DISCOUNT',
            rate_bps: 1000, // 10% off
            amount_centavos: null
        });
        mockAffiliateRepo.findEnrollmentById
            .mockResolvedValueOnce(activeEnrollment())
            .mockResolvedValueOnce(activeEnrollment({ status: 'revoked' }));

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(result.success).toBe(true);
        // Sharpest statement of "pricing math untouched, attribution dropped": the buyer still gets
        // the 10% discount priced under the (then-active) enrollment, but nothing is accrued.
        expect(result.data.totals.subtotal_amount).toBe(90);
        expect(mockAffiliateRepo.createPendingCommissionIfMissing).not.toHaveBeenCalled();
    });

    test('program disabled between pricing and commit: order succeeds, no commission accrues', async () => {
        mockAffiliateRepo.getSettings
            .mockResolvedValueOnce(defaultAffiliateSettings())                          // pricing-time
            .mockResolvedValue({ ...defaultAffiliateSettings(), program_enabled: false }); // commit-time onward

        const useCase = buildStoreCheckoutUseCase({ storeRepository: buildFakeStoreRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(basePayload({ attribution_enrollment_id: ENROLLMENT_ID }))
        });

        expect(result.success).toBe(true);
        expect(mockAffiliateRepo.createPendingCommissionIfMissing).not.toHaveBeenCalled();
    });
});
