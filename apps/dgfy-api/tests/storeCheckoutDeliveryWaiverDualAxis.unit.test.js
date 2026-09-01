// Unit tests for Phase 240 (#1331, epic #1321 decision 9) -- the `free_delivery` voucher benefit
// class, code-entered. The headline case is the ticket's own acceptance evidence: a 10%-off item
// voucher AND a typed free-delivery code both apply to the same order.
//
// No database anywhere in this file. storeRepository is a hand-built fake mirroring
// tests/storeCheckoutCalculatedDeliveryFee.unit.test.js's own full-checkout fixture shape
// (findLocationById/getSettingsByKeys/findSellableItemsByIds/beginTransaction/
// createOnlineTransactionWithLines/getOrderById/nextInvoiceNumber/isTrackingPinTaken).
//
// The voucher REPOSITORY (not the use cases) is mocked via jest.unstable_mockModule, so the real
// `redeemVoucherUseCase`/`previewVoucherEligibilityUseCase`/`calculateVoucherBenefit` business logic
// -- including this phase's free_delivery -> 'amount_off' translation, benefitTarget threading, and
// every eligibility/idempotency/exhaustion guard -- runs for real against an in-memory fake, the
// same pattern voucherRedemptionUseCases.usecases.test.js already establishes for that layer alone.

import { jest } from '@jest/globals';

process.env.STOREFRONT_PAYMENT_RETURN_URL = 'https://dgfy.ph/payment-return';

const TENANT_ID = '44444444-4444-4444-8444-444444444444';

const SAVE10_ID = 501;
const FREEDEL_ID = 502;

const makeVoucherFixtures = (overridesByCode = {}) => ({
    SAVE10: {
        voucher_id: SAVE10_ID,
        code: 'SAVE10',
        voucher_kind: 'promo_code',
        title: 'Save 10',
        subtitle: null,
        badge: null,
        benefit_class: 'percent_off',
        benefit_target: 'items',
        percent_off_bps: 1000,
        amount_off_centavos: null,
        fixed_unit_price_centavos: null,
        delivery_amount_off_centavos: null,
        max_discount_centavos: null,
        min_spend_centavos: null,
        min_quantity: null,
        allow_below_cost: false,
        pricelist_id: null,
        valid_from: null,
        valid_until: null,
        valid_time_start: null,
        valid_time_end: null,
        weekday_mask: 127,
        channels_mask: 1, // storefront
        fulfillment_methods_mask: 3, // delivery | pickup
        order_timings_mask: 3,
        max_redemptions: null,
        max_total_discount_centavos: null,
        max_benefit_quantity: null,
        redeemed_count: 0,
        redeemed_value_centavos: 0,
        redeemed_quantity: 0,
        status: 'active',
        version: 0,
        ...(overridesByCode.SAVE10 || {})
    },
    FREEDEL: {
        voucher_id: FREEDEL_ID,
        code: 'FREEDEL',
        voucher_kind: 'delivery_campaign',
        title: 'Free Delivery',
        subtitle: null,
        badge: null,
        benefit_class: 'free_delivery',
        benefit_target: 'delivery',
        percent_off_bps: null,
        amount_off_centavos: null,
        fixed_unit_price_centavos: null,
        delivery_amount_off_centavos: null, // waive the whole fee
        max_discount_centavos: null,
        min_spend_centavos: null,
        min_quantity: null,
        allow_below_cost: false,
        pricelist_id: null,
        valid_from: null,
        valid_until: null,
        valid_time_start: null,
        valid_time_end: null,
        weekday_mask: 127,
        channels_mask: 1,
        fulfillment_methods_mask: 3,
        order_timings_mask: 3,
        max_redemptions: null,
        max_total_discount_centavos: null,
        max_benefit_quantity: null,
        redeemed_count: 0,
        redeemed_value_centavos: 0,
        redeemed_quantity: 0,
        status: 'active',
        version: 0,
        ...(overridesByCode.FREEDEL || {})
    }
});

const buildFakeVoucherRepository = (vouchers) => {
    const state = {
        vouchers: vouchers.map((v) => ({ ...v })),
        redemptions: [],
        lines: [],
        nextRedemptionId: 1,
        nextLineId: 1
    };

    const findVoucher = (id) => state.vouchers.find((v) => v.voucher_id === Number(id));

    return {
        __state: state,
        async findByCode(code) {
            const normalized = String(code || '').trim().toUpperCase();
            const row = state.vouchers.find((v) => v.code === normalized);
            return row ? { ...row } : null;
        },
        async findById(id) {
            const row = findVoucher(id);
            return row ? { ...row } : null;
        },
        async listScopes() {
            return [];
        },
        async listItemFolderAdjacency() {
            return [];
        },
        async listItemFolderLinksForItems() {
            return [];
        },
        async listPricelistItemPrices() {
            return {};
        },
        async findPricelistStatus() {
            return null;
        },
        async findRedemptionByIdempotencyKey(key) {
            const row = state.redemptions.find((r) => r.idempotency_key === key);
            return row ? { ...row } : null;
        },
        async reserveRedemption(voucherId, { discountCentavos, quantity } = {}) {
            const voucher = findVoucher(voucherId);
            if (!voucher) return 0;
            const discount = Math.max(0, Math.round(Number(discountCentavos) || 0));
            const qty = Math.max(0, Math.round(Number(quantity) || 0));
            if (voucher.max_redemptions != null && voucher.redeemed_count >= voucher.max_redemptions) return 0;
            if (
                voucher.max_total_discount_centavos != null
                && voucher.redeemed_value_centavos + discount > voucher.max_total_discount_centavos
            ) return 0;
            if (
                voucher.max_benefit_quantity != null
                && voucher.redeemed_quantity + qty > voucher.max_benefit_quantity
            ) return 0;
            voucher.redeemed_count += 1;
            voucher.redeemed_value_centavos += discount;
            voucher.redeemed_quantity += qty;
            voucher.version += 1;
            return 1;
        },
        async createRedemptionLedgerEntry(values) {
            const entry = { voucher_redemption_id: state.nextRedemptionId++, ...values };
            state.redemptions.push(entry);
            return { ...entry };
        },
        async createRedemptionLines(values) {
            const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
                voucher_redemption_line_id: state.nextLineId++,
                ...v
            }));
            state.lines.push(...rows);
            return rows;
        }
    };
};

// The voucher REPOSITORY is mocked (not the use cases) -- `modules/vouchers/index.js` binds
// `redeemVoucherUseCase`/`previewVoucherEligibilityUseCase` against this module's `voucherRepository`
// export at module-eval time, so intercepting it here means the REAL use-case/domain logic runs
// against an in-memory fake, exactly like voucherRedemptionUseCases.usecases.test.js does one layer
// down. Must be declared before any dynamic import of storeUseCases.js (or anything importing it).
let currentFakeVoucherRepository = buildFakeVoucherRepository([]);
jest.unstable_mockModule('../src/modules/vouchers/repositories/voucherRepository.js', () => ({
    voucherRepository: new Proxy({}, {
        get(_target, prop) {
            return (...args) => currentFakeVoucherRepository[prop](...args);
        }
    })
}));

const {
    buildStoreCartQuoteUseCase,
    buildStoreCheckoutUseCase
} = await import('../src/modules/store/usecases/storeUseCases.js');
const { generateStoreGuestCheckoutProof } = await import('../src/modules/store/utils/storeJwtToken.js');
const { DELIVERY_FEE_CALC_VERSION } = await import('../src/modules/deliveryPricing/index.js');

const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } }
        })
    }
];

const activePromoSetting = () => ({
    setting_key: 'storefront_promos',
    setting_value: JSON.stringify([{
        id: 'promo-1', active: true, title: 'Promo', promo_code: 'PROMO1', discount_percent: 5
    }])
});

// $100 fixed delivery fee, $10 subtotal (1 unit at $1,000 -- see plan §9's exact fixture).
const baseSettingsRows = ({ withPromo = false } = {}) => [
    ...registeredTransactionSettings(),
    { setting_key: 'store_delivery_fee', setting_value: '100' },
    { setting_key: 'pos_open_status', setting_value: 'true' },
    ...(withPromo ? [activePromoSetting()] : [])
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
    default_sale_price: 1000,
    cost_per_unit: 10,
    unit_of_measure: 'pc',
    vat_type: 'vatable'
}]);

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
    lines: [{ item_id: 40, quantity: 1 }],
    ...overrides
});

const buildFakeCheckoutStoreRepository = ({ settingsRows, createdOrderId = 9501 } = {}) => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; }),
        LOCK: { UPDATE: 'UPDATE' }
    };
    const createOnlineTransactionWithLines = jest.fn().mockResolvedValue(createdOrderId);
    return {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        findLocationById: jest.fn().mockResolvedValue(baseLocation()),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows),
        findSellableItemsByIds: jest.fn().mockResolvedValue(baseItem()),
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        createOnlineTransactionWithLines,
        getOrderById: jest.fn().mockResolvedValue({
            pos_transaction_id: createdOrderId,
            tracking_pin: 'SK-DUALAXIS',
            invoice_number: 'INV-000001',
            order_source: 'online_store',
            order_method: 'delivery',
            payment_type: 'cash',
            payment_status: 'unpaid',
            fulfillment_status: 'placed',
            subtotal_amount: 1000,
            discount_amount: 100,
            service_fee_amount: 0,
            delivery_fee: 0,
            total_amount: 900,
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
};

const withGuestProof = (payload) => ({
    ...payload,
    guest_checkout_proof: generateStoreGuestCheckoutProof({
        tenantId: TENANT_ID,
        email: payload.customer_email,
        idempotencyKey: payload.idempotency_key
    })
});

const runCheckout = async ({ settingsRows, payloadOverrides = {} }) => {
    const storeRepository = buildFakeCheckoutStoreRepository({ settingsRows });
    const useCase = buildStoreCheckoutUseCase({ storeRepository, revenueSharingEnabled: true });
    const payload = withGuestProof(deliveryPayload({
        idempotency_key: `dual-axis-${Math.floor(Math.random() * 1e9)}`,
        ...payloadOverrides
    }));
    const result = await useCase({ tenantId: TENANT_ID, payload });
    return { result, storeRepository };
};

const buildQuoteUseCase = (settingsRows) => buildStoreCartQuoteUseCase({
    revenueSharingEnabled: true,
    storeRepository: {
        findSellableItemsByIds: jest.fn().mockResolvedValue(baseItem()),
        findLocationById: jest.fn().mockResolvedValue(baseLocation()),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows)
    }
});

beforeEach(() => {
    currentFakeVoucherRepository = buildFakeVoucherRepository(Object.values(makeVoucherFixtures()));
});

describe('the headline case -- an item voucher and a free-delivery voucher on the same order', () => {
    test('both apply; no VOUCHER_DISCOUNT_SLOT_OCCUPIED; the waiver is exact and the item discount is exact', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { voucher_code: 'SAVE10', delivery_voucher_code: 'FREEDEL' }
        });

        // 1. No rejection, and specifically no VOUCHER_DISCOUNT_SLOT_OCCUPIED anywhere.
        expect(result.success).toBe(true);
        expect(result.error?.details?.reason_code).not.toBe('VOUCHER_DISCOUNT_SLOT_OCCUPIED');

        // 6+7. The single slot holds exactly one row -- the item voucher's -- and the waiver is
        // persisted to the header, not the discount row.
        expect(storeRepository.createOnlineTransactionWithLines).toHaveBeenCalledTimes(1);
        const [{ header, discount }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];

        // 2. Item voucher intact.
        expect(discount).not.toBeNull();
        expect(discount.discount_type).toBe('voucher');
        expect(discount.discount_amount).toBe(100);
        expect(discount.promo_code).toBe('SAVE10');
        expect(discount.promo_code).not.toBe('FREEDEL');
        expect(Object.keys(discount).some((key) => key.startsWith('delivery_fee_waiver'))).toBe(false);

        // 3+4. Waiver applied; breakdown reconciles (base 100, waiver 100, override null, final 0).
        expect(header.delivery_fee_base).toBe(100);
        expect(header.delivery_fee_waiver).toBe(100);
        expect(header.delivery_fee_override).toBeNull();
        expect(header.delivery_fee).toBe(0);
        expect(header.delivery_fee_waiver_voucher_id).toBe(FREEDEL_ID);
        expect(header.delivery_fee_waiver_label_snapshot).toBeTruthy();

        // 5. Total: 1000 - 100 item discount + 0 delivery + 0 service fee (revenueSharingEnabled).
        expect(header.total_amount).toBe(900);
    });
});

describe('supporting cases', () => {
    test('delivery voucher alone: waiver applies, discount argument is null, no item voucher applied', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { delivery_voucher_code: 'FREEDEL' }
        });

        expect(result.success).toBe(true);
        const [{ header, discount }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(discount).toBeNull();
        expect(header.delivery_fee_waiver).toBe(100);
        expect(header.delivery_fee).toBe(0);
    });

    test('item voucher alone: byte-identity regression -- delivery_fee_waiver stays 0', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { voucher_code: 'SAVE10' }
        });

        expect(result.success).toBe(true);
        const [{ header, discount }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(discount.discount_amount).toBe(100);
        expect(header.delivery_fee_waiver).toBe(0);
        expect(header.delivery_fee_waiver_voucher_id).toBeNull();
        expect(header.delivery_fee).toBe(100);
    });

    test('promo code + delivery voucher: promo occupies the item axis, waiver still applies, no slot-occupied rejection', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows({ withPromo: true }),
            payloadOverrides: { promo_code: 'PROMO1', delivery_voucher_code: 'FREEDEL' }
        });

        expect(result.success).toBe(true);
        expect(result.error?.details?.reason_code).not.toBe('VOUCHER_DISCOUNT_SLOT_OCCUPIED');
        const [{ header, discount }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(discount.promo_code).toBe('PROMO1');
        expect(header.delivery_fee_waiver).toBe(100);
    });

    test('promo + item voucher + delivery voucher: still 422 on the item axis, and no delivery redemption is burned', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows({ withPromo: true }),
            payloadOverrides: { promo_code: 'PROMO1', voucher_code: 'SAVE10', delivery_voucher_code: 'FREEDEL' }
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('VOUCHER_DISCOUNT_SLOT_OCCUPIED');
        expect(storeRepository.createOnlineTransactionWithLines).not.toHaveBeenCalled();
        // The item-axis guard throws before the delivery voucher's own resolution step (§5.1) --
        // no redemption for FREEDEL should have been recorded.
        expect(currentFakeVoucherRepository.__state.redemptions.some((r) => r.voucher_id === FREEDEL_ID)).toBe(false);
    });

    test('partial waiver: delivery_amount_off_centavos caps the waiver below the full fee', async () => {
        currentFakeVoucherRepository = buildFakeVoucherRepository(
            Object.values(makeVoucherFixtures({ FREEDEL: { delivery_amount_off_centavos: 5000 } }))
        );
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows({}).map((row) => (row.setting_key === 'store_delivery_fee' ? { ...row, setting_value: '120' } : row)),
            payloadOverrides: { delivery_voucher_code: 'FREEDEL' }
        });

        expect(result.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(header.delivery_fee_base).toBe(120);
        expect(header.delivery_fee_waiver).toBe(50);
        expect(header.delivery_fee).toBe(70);
    });

    test('over-waiver clamp: a waiver larger than the fee floors at zero, never negative', async () => {
        currentFakeVoucherRepository = buildFakeVoucherRepository(
            Object.values(makeVoucherFixtures({ FREEDEL: { delivery_amount_off_centavos: 20000 } }))
        );
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { delivery_voucher_code: 'FREEDEL' }
        });

        expect(result.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(header.delivery_fee_base).toBe(100);
        expect(header.delivery_fee_waiver).toBe(100);
        expect(header.delivery_fee).toBe(0);
    });

    test('pickup order: the delivery-voucher block is skipped entirely, no redemption burned', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: {
                order_method: 'pickup',
                delivery_address: '',
                delivery_latitude: null,
                delivery_longitude: null,
                delivery_voucher_code: 'FREEDEL'
            }
        });

        expect(result.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(header.delivery_fee_waiver).toBe(0);
        expect(currentFakeVoucherRepository.__state.redemptions).toHaveLength(0);
    });

    test('axis mismatch: an item voucher submitted via delivery_voucher_code is rejected', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { delivery_voucher_code: 'SAVE10' }
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('VOUCHER_BENEFIT_TARGET_MISMATCH');
        expect(storeRepository.createOnlineTransactionWithLines).not.toHaveBeenCalled();
    });

    test('axis mismatch: a delivery voucher submitted via voucher_code is rejected the same way, not INVALID_DELIVERY_FEE_CENTAVOS', async () => {
        const { result } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { voucher_code: 'FREEDEL' }
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('VOUCHER_BENEFIT_TARGET_MISMATCH');
    });

    test('idempotent replay: two resolveCheckoutContext passes with the same checkout idempotency key write exactly one redemption per voucher', async () => {
        // redeemVoucherUseCase's OWN idempotency pre-check (keyed off the checkout-level
        // idempotency_key, independent of the order-level dedup) is what this asserts -- per
        // storeUseCases.js's own comment: "safe to run... including a checkout retry that reaches
        // here before buildStoreCheckoutUseCase's own idempotency-key short-circuit." Both calls here
        // deliberately see findTransactionByIdempotencyKey -> null, so both reach
        // resolveCheckoutContext's own redemption step; only the voucher ledger's own idempotency key
        // is what should prevent a second reservation.
        const storeRepository = buildFakeCheckoutStoreRepository({ settingsRows: baseSettingsRows() });
        const useCase = buildStoreCheckoutUseCase({ storeRepository, revenueSharingEnabled: true });
        const payload = withGuestProof(deliveryPayload({
            idempotency_key: 'dual-axis-replay-1',
            voucher_code: 'SAVE10',
            delivery_voucher_code: 'FREEDEL'
        }));

        const first = await useCase({ tenantId: TENANT_ID, payload });
        expect(first.success).toBe(true);
        const second = await useCase({ tenantId: TENANT_ID, payload });
        expect(second.success).toBe(true);

        const itemRedemptions = currentFakeVoucherRepository.__state.redemptions.filter((r) => r.voucher_id === SAVE10_ID);
        const deliveryRedemptions = currentFakeVoucherRepository.__state.redemptions.filter((r) => r.voucher_id === FREEDEL_ID);
        expect(itemRedemptions).toHaveLength(1);
        expect(deliveryRedemptions).toHaveLength(1);
        // Distinct idempotency keys (Phase 240 plan §4/§13.5) -- the delivery voucher's key carries
        // a ':delivery' segment the item voucher's bare key does not.
        expect(itemRedemptions[0].idempotency_key).not.toBe(deliveryRedemptions[0].idempotency_key);
        expect(deliveryRedemptions[0].idempotency_key).toContain(':delivery:');
        expect(itemRedemptions[0].idempotency_key).not.toContain(':delivery:');
    });
});

describe('free-mode tenant (baseFee === 0) -- #1389 review fixup, RF-1', () => {
    // resolveStoreDeliveryFee returns baseFee: 0 for 'free' mode (storeUseCases.js's own comment:
    // "0 and null are distinct there -- 0 is a legal base for a free-delivery tenant"). Before this
    // fixup, the call-site guard was `delivery.baseFee > 0`, which skipped validation, axis-mismatch
    // checking, AND redemption entirely for every one of these cases -- silently ignoring a
    // mismatched code instead of failing closed, and skipping the required exactly-once redemption
    // on the pinned replay path.
    const freeModeSettingsRows = () => [
        ...registeredTransactionSettings(),
        { setting_key: 'store_delivery_fee_mode', setting_value: 'free' },
        { setting_key: 'pos_open_status', setting_value: 'true' }
    ];

    test('(a) a valid delivery-targeted voucher: redemption happens, waiverAmount is 0, no error', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: freeModeSettingsRows(),
            payloadOverrides: { delivery_voucher_code: 'FREEDEL' }
        });

        expect(result.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(header.delivery_fee_base).toBe(0);
        expect(header.delivery_fee_waiver).toBe(0);
        expect(header.delivery_fee).toBe(0);
        expect(header.delivery_fee_waiver_voucher_id).toBe(FREEDEL_ID);
        expect(
            currentFakeVoucherRepository.__state.redemptions.filter((r) => r.voucher_id === FREEDEL_ID)
        ).toHaveLength(1);
    });

    test('(b) an item-targeted code entered in the delivery field is still rejected as a mismatch', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: freeModeSettingsRows(),
            payloadOverrides: { delivery_voucher_code: 'SAVE10' }
        });

        expect(result.success).toBe(false);
        expect(result.error?.details?.reason_code).toBe('VOUCHER_BENEFIT_TARGET_MISMATCH');
        expect(storeRepository.createOnlineTransactionWithLines).not.toHaveBeenCalled();
        // Not asserting on the fake voucher repository's redemption ledger here: the mismatch throw
        // (storeUseCases.js) happens AFTER redeemVoucherUseCase's own reservation/ledger write for
        // the entered code, same as the pre-existing (non-free-mode) mismatch path -- see the
        // 'axis mismatch' test in "supporting cases" above, which doesn't assert this either. In
        // production this is rolled back by the checkout's own DB transaction; this in-memory fake
        // doesn't model that rollback, so asserting on it here would test the fake, not the fix.
    });

    // (c) pickup + delivery_voucher_code present, no redemption burned -- already covered by
    // "supporting cases" > 'pickup order: the delivery-voucher block is skipped entirely...' above.
    // That test's guard (orderMethod !== 'delivery') is unaffected by this fixup: pickup orders skip
    // the block regardless of baseFee, both before and after this change.

    test('pinned QRPh/webhook replay: a free-mode zero-base pin still performs the required exactly-once redemption', async () => {
        const freeModePin = Object.freeze({
            mode: 'free',
            baseFee: 0,
            waiverAmount: 0,
            overrideAmount: null,
            finalFee: 0,
            distanceMeters: null,
            distanceSource: 'none',
            fallbackApplied: false,
            outOfRange: false,
            calcVersion: DELIVERY_FEE_CALC_VERSION,
            pinned_at: new Date().toISOString()
        });
        const storeRepository = buildFakeCheckoutStoreRepository({ settingsRows: freeModeSettingsRows() });
        const useCase = buildStoreCheckoutUseCase({ storeRepository, revenueSharingEnabled: true });
        const payload = withGuestProof(deliveryPayload({
            idempotency_key: `dual-axis-free-pin-${Math.floor(Math.random() * 1e9)}`,
            delivery_voucher_code: 'FREEDEL'
        }));

        const result = await useCase({ tenantId: TENANT_ID, payload, pinnedDeliveryBreakdown: freeModePin });

        expect(result.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(header.delivery_fee_base).toBe(0);
        expect(header.delivery_fee_waiver).toBe(0);
        expect(header.delivery_fee).toBe(0);
        expect(header.delivery_fee_waiver_voucher_id).toBe(FREEDEL_ID);
        expect(
            currentFakeVoucherRepository.__state.redemptions.filter((r) => r.voucher_id === FREEDEL_ID)
        ).toHaveLength(1);
    });
});

describe('cart quote: the delivery waiver is visible at quote time', () => {
    test('delivery_fee_waiver and delivery_voucher_feedback surface on the quote response', async () => {
        const useCase = buildQuoteUseCase(baseSettingsRows());
        const result = await useCase({
            payload: deliveryPayload({ voucher_code: 'SAVE10', delivery_voucher_code: 'FREEDEL' })
        });

        expect(result.success).toBe(true);
        expect(result.data.delivery_fee).toBe(0);
        expect(result.data.delivery_fee_waiver).toBe(100);
        expect(result.data.voucher_feedback).toEqual({ applied: true, voucher_code: 'SAVE10' });
        expect(result.data.delivery_voucher_feedback).toEqual({ applied: true, voucher_code: 'FREEDEL' });
    });
});
