// Unit tests for Phase 237 (#1329, epic #1321, Wave 0 decision #2 / D2) -- quoted-fee pinning
// across a webhook-replay finalization. Three layers:
//   1. buildStoreCheckoutUseCase's own pinnedDeliveryBreakdown handling (resolveCheckoutContext) --
//      the mechanism itself: honor a valid pin regardless of what a fresh distance resolution would
//      produce, fall through to normal resolution on anything shape/version-invalid, and NEVER hard-
//      invalidate on the advisory TTL.
//   2. finalizePaidCommerceSession.js's plumbing -- reads session.delivery_fee_breakdown and passes
//      it through to storeCheckoutUseCase as the sibling arg, verbatim. storeCheckoutUseCase itself
//      is module-mocked here, mirroring tests/finalizePaidCommerceSession.usecase.test.js exactly --
//      layer 1 above is what actually proves the mechanism works; this layer only proves the wiring.
//   3. #1332 (Phase 244)'s `pinnedDeliveryBreakdown.autoAppliedVoucherId` -- added by RF-2 (PR #1397
//      review). Every test above this point exercises a pin WITHOUT the field (legacy pins /
//      code-entered pins), proving backward compatibility; this layer proves the new positive case:
//      finalize re-resolves and redeems the SAME pinned campaign, preserves the pinned waiver
//      amount, and never re-selects a different (possibly higher-priority) campaign. Unlike layers
//      1-2, this needs a real (faked) voucherRepository -- see storeCheckoutAutoAppliedDelivery.unit
//      .test.js, whose harness this section mirrors, for why only the repository is mocked and not
//      the use cases themselves.
//
// No database anywhere in this file. Fixture shapes mirror
// tests/storeCheckoutRoadDistanceCapture.unit.test.js (checkout),
// tests/finalizePaidCommerceSession.usecase.test.js (finalizer plumbing), and
// tests/storeCheckoutAutoAppliedDelivery.unit.test.js (voucher fixtures/fake repository, layer 3).

import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

const PINNED_CAMPAIGN_ID = 711;
const COMPETING_CAMPAIGN_ID = 712;

const baseVoucherFields = (overrides = {}) => ({
    subtitle: null,
    badge: null,
    percent_off_bps: null,
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
    auto_apply: false,
    ...overrides
});

// Deliberately a WEAKER campaign (a smaller amount-off) than COMPETING below -- the selector's own
// ordering would never pick this one if it were consulted, which is exactly what proves the
// finalize-replay branch never consults the selector at all (RF-2).
const pinnedCampaignFixture = (overrides = {}) => baseVoucherFields({
    voucher_id: PINNED_CAMPAIGN_ID,
    code: 'PINNEDAUTO',
    voucher_kind: 'delivery_campaign',
    title: 'Pinned Auto Campaign',
    benefit_class: 'amount_off',
    benefit_target: 'delivery',
    amount_off_centavos: 2000, // ₱20
    auto_apply: true,
    ...overrides
});

// A campaign that would out-rank the pinned one on every axis the selector cares about (bigger
// discount) if it were live at finalize time -- present specifically so a test can prove it's never
// touched.
const competingCampaignFixture = (overrides = {}) => baseVoucherFields({
    voucher_id: COMPETING_CAMPAIGN_ID,
    code: 'COMPETINGAUTO',
    voucher_kind: 'delivery_campaign',
    title: 'Competing Auto Campaign',
    benefit_class: 'free_delivery',
    benefit_target: 'delivery',
    delivery_amount_off_centavos: null, // waives the whole fee -- strictly better than the pinned one
    auto_apply: true,
    ...overrides
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
        async listAutoApplyDeliveryCampaigns() {
            return state.vouchers
                .filter((v) => v.auto_apply === true && v.benefit_target === 'delivery' && v.status === 'active')
                .map((v) => ({ ...v }));
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
            const entry = { voucher_redemption_id: state.nextRedemptionId++, idempotency_key: values.idempotency_key, ...values };
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
        },
        async attachRedemptionsToTransaction(voucherRedemptionIds, posTransactionId) {
            const ids = (Array.isArray(voucherRedemptionIds) ? voucherRedemptionIds : [voucherRedemptionIds]).map(Number);
            let affected = 0;
            state.redemptions.forEach((r) => {
                if (ids.includes(r.voucher_redemption_id)) {
                    r.pos_transaction_id = Number(posTransactionId);
                    affected += 1;
                }
            });
            return affected;
        }
    };
};

let currentFakeVoucherRepository = buildFakeVoucherRepository([]);
jest.unstable_mockModule('../src/modules/vouchers/repositories/voucherRepository.js', () => ({
    voucherRepository: new Proxy({}, {
        get(_target, prop) {
            return (...args) => currentFakeVoucherRepository[prop](...args);
        }
    })
}));

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
        ['negative finalFee', { ...VALID_PIN_AT_5400M, finalFee: -1 }],
        // #1377 review, RF-2: isValidPinnedDeliveryBreakdown used to validate only mode/finalFee/
        // calcVersion -- every field below is now validated too, since all of them get copied
        // verbatim into the persisted order on webhook finalization.
        ['baseFee missing', (() => { const { baseFee, ...rest } = VALID_PIN_AT_5400M; return rest; })()],
        ['baseFee wrong type', { ...VALID_PIN_AT_5400M, baseFee: 'ninety-seven' }],
        ['baseFee negative', { ...VALID_PIN_AT_5400M, baseFee: -1 }],
        ['waiverAmount missing', (() => { const { waiverAmount, ...rest } = VALID_PIN_AT_5400M; return rest; })()],
        ['waiverAmount wrong type', { ...VALID_PIN_AT_5400M, waiverAmount: 'none' }],
        ['waiverAmount negative', { ...VALID_PIN_AT_5400M, waiverAmount: -1 }],
        // overrideAmount: null-vs-zero -- null (no override) is valid, see VALID_PIN_AT_5400M itself;
        // a non-null override must still be a real finite nonnegative number, not a stringified one.
        ['overrideAmount wrong type (stringified number)', { ...VALID_PIN_AT_5400M, overrideAmount: '10' }],
        ['overrideAmount negative', { ...VALID_PIN_AT_5400M, overrideAmount: -1 }],
        ['distanceSource invalid enum value', { ...VALID_PIN_AT_5400M, distanceSource: 'gps' }],
        ['distanceMeters wrong type', { ...VALID_PIN_AT_5400M, distanceMeters: '5400' }],
        ['distanceMeters negative', { ...VALID_PIN_AT_5400M, distanceMeters: -1 }],
        ['fallbackApplied not a boolean', { ...VALID_PIN_AT_5400M, fallbackApplied: 1 }],
        ['outOfRange not a boolean', { ...VALID_PIN_AT_5400M, outOfRange: 'false' }],
        ['pinned_at missing', (() => { const { pinned_at, ...rest } = VALID_PIN_AT_5400M; return rest; })()],
        ['pinned_at unparseable', { ...VALID_PIN_AT_5400M, pinned_at: 'not-a-date' }]
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

    test('a stringified numeric finalFee is rejected, not silently coerced (#1377 post-merge audit, RF-2)', async () => {
        // Number("150") is finite and >= 0, so a finiteness-only check (Number(pin.finalFee), then
        // Number.isFinite) would accept this pin and copy the *string* "150" verbatim into the
        // persisted breakdown -- wrong-typed provenance data, and a fee that never went through
        // fresh resolution. The fresh resolution at 5400m calculated-mode prices at ₱97, a
        // different value, so a wrongly-accepted pin is detectable: its fee (150) would diverge
        // from what fresh resolution actually produces (97).
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 5400, source: 'road' });
        const { useCase, createOnlineTransactionWithLines } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });
        const stringifiedFeePin = { ...VALID_PIN_AT_5400M, finalFee: '150' };

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: stringifiedFeePin
        });

        expect(result.success).toBe(true);
        // Falls through to fresh resolution (₱97) -- never the stringified pin's "150".
        expect(result.data.totals.delivery_fee).toBe(97);
        expect(result.data.totals.delivery_fee).not.toBe(150);
        const persistedHeader = createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedHeader.delivery_fee).toBe(97);
        expect(typeof persistedHeader.delivery_fee).toBe('number');
    });

    test('overrideAmount: 0 (a real override to zero, not "no override") is honored, not treated as invalid', async () => {
        // Guards against a subtle falsy-coercion bug (e.g. `if (!pin.overrideAmount)`) that would
        // treat a legitimate zero override the same as `null` (no override) and reject/ignore it.
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: null, source: 'unavailable' });
        const { useCase, createOnlineTransactionWithLines } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });
        const zeroOverridePin = { ...VALID_PIN_AT_5400M, overrideAmount: 0, finalFee: 0 };

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: zeroOverridePin
        });

        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(0);
        const persistedHeader = createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedHeader.delivery_fee).toBe(0);
        expect(persistedHeader.delivery_fee_override).toBe(0);
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

describe('resolveCheckoutContext pinnedDeliveryBreakdown.autoAppliedVoucherId -- webhook-finalize re-redeems the pinned campaign (RF-2, PR #1397 review)', () => {
    const PINNED_AUTO_APPLY_PIN = Object.freeze({
        ...VALID_PIN_AT_5400M,
        waiverAmount: 20,
        finalFee: 77, // 97 base - 20 pinned waiver
        autoAppliedVoucherId: PINNED_CAMPAIGN_ID
    });

    beforeEach(() => {
        currentFakeVoucherRepository = buildFakeVoucherRepository([
            pinnedCampaignFixture(),
            competingCampaignFixture()
        ]);
    });

    test('redeems the SAME pinned campaign exactly once, persists the pinned waiver amount, and never selects the competing campaign', async () => {
        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 5400, source: 'road' });
        const { useCase, createOnlineTransactionWithLines } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: PINNED_AUTO_APPLY_PIN
        });

        expect(result.success).toBe(true);
        // (a) the pinned waiver amount is persisted, NOT a freshly-recomputed one -- if the finalize
        // path re-ran the selector fresh, the free-delivery COMPETING campaign would win and waive
        // the whole ₱97, not just the pinned ₱20.
        expect(result.data.totals.delivery_fee).toBe(77);
        const persistedHeader = createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedHeader.delivery_fee).toBe(77);
        expect(persistedHeader.delivery_fee_waiver).toBe(20);
        expect(persistedHeader.delivery_fee_waiver_voucher_id).toBe(PINNED_CAMPAIGN_ID);

        // (a) the same voucher id from the pin is what gets redeemed, exactly once.
        const pinnedRedemptions = currentFakeVoucherRepository.__state.redemptions.filter(
            (r) => r.voucher_id === PINNED_CAMPAIGN_ID
        );
        expect(pinnedRedemptions).toHaveLength(1);

        // (c) the competing campaign -- which would win the selector's own ordering outright -- is
        // never touched: no redemption, no counter increment. The finalize-replay branch fetches the
        // pinned campaign directly by id and never consults the selector at all.
        const competingRedemptions = currentFakeVoucherRepository.__state.redemptions.filter(
            (r) => r.voucher_id === COMPETING_CAMPAIGN_ID
        );
        expect(competingRedemptions).toHaveLength(0);
        const competing = currentFakeVoucherRepository.__state.vouchers.find(
            (v) => v.voucher_id === COMPETING_CAMPAIGN_ID
        );
        expect(competing.redeemed_count).toBe(0);
    });

    test('D2 fail-open on finalize: if the pinned campaign fails to redeem, checkout still succeeds with no waiver and never falls back to a different campaign', async () => {
        // Simulate the pinned campaign losing a redemption race (e.g. exhausted between the original
        // quote/payment-session creation and this webhook finalize) -- same technique as the
        // fresh-resolution D2 test in storeCheckoutAutoAppliedDelivery.unit.test.js.
        const repo = buildFakeVoucherRepository([pinnedCampaignFixture(), competingCampaignFixture()]);
        const originalReserve = repo.reserveRedemption.bind(repo);
        repo.reserveRedemption = async (voucherId, args) => {
            if (Number(voucherId) === PINNED_CAMPAIGN_ID) return 0; // simulate the race -- always fails
            return originalReserve(voucherId, args);
        };
        currentFakeVoucherRepository = repo;

        const roadDistanceProvider = fakeRoadDistanceProvider({ distanceMeters: 5400, source: 'road' });
        const { useCase, createOnlineTransactionWithLines } = buildCheckoutFixture({
            settingsRows: calculatedModeSettingsRows(),
            roadDistanceProvider
        });

        const result = await useCase({
            tenantId: TENANT_ID,
            payload: withGuestProof(deliveryPayload()),
            pinnedDeliveryBreakdown: PINNED_AUTO_APPLY_PIN
        });

        // Fails open -- money is already captured at the pinned amount by the time finalize runs
        // (this is the webhook-replay branch, not a fresh quote), so `delivery` itself is never
        // rebuilt here regardless of redemption outcome ("`delivery` stays exactly as the pin gave
        // it", storeUseCases.js's own comment on this branch) -- the persisted fee/waiver amounts
        // stay exactly what was pinned (77 / 20). What DOES change on failure is
        // `deliveryWaiverApplication` itself: it's never set, so no redemption is recorded and
        // `delivery_fee_waiver_voucher_id` comes back null -- proving this failure is never papered
        // over by falling back to re-selecting the competing campaign as a substitute.
        expect(result.success).toBe(true);
        expect(result.data.totals.delivery_fee).toBe(77);
        const persistedHeader = createOnlineTransactionWithLines.mock.calls[0][0].header;
        expect(persistedHeader.delivery_fee).toBe(77);
        expect(persistedHeader.delivery_fee_waiver).toBe(20);
        expect(persistedHeader.delivery_fee_waiver_voucher_id).toBeNull();
        expect(currentFakeVoucherRepository.__state.redemptions).toHaveLength(0);
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
