// Unit tests for Phase 244 (#1332, epic #1321 decision 9) -- auto-applied free-delivery campaigns.
// Covers the ticket's own headline acceptance evidence (quote and checkout agree byte-for-byte with
// no delivery_voucher_code typed), budget/count exhaustion disappearing identically from both paths,
// and precedence against a typed delivery code / typed item code / pickup order.
//
// Same harness shape as storeCheckoutDeliveryWaiverDualAxis.unit.test.js: the voucher REPOSITORY is
// mocked (not the use cases), so the real selector/use-case/domain logic
// (selectAutoAppliedDeliveryCampaign, resolveAutoAppliedDeliveryCampaignUseCase,
// redeemVoucherUseCase) all run for real against an in-memory fake.

import { jest } from '@jest/globals';

process.env.STOREFRONT_PAYMENT_RETURN_URL = 'https://dgfy.ph/payment-return';

const TENANT_ID = '55555555-5555-4555-8555-555555555555';

const SAVE10_ID = 601;
const FREEDEL_TYPED_ID = 602;
const AUTO_SMALL_ID = 611;
const AUTO_MID_ID = 612;
const AUTO_BEST_ID = 613;
const AUTO_PAUSED_ID = 614;

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

const makeVoucherFixtures = (overridesByCode = {}) => ({
    SAVE10: baseVoucherFields({
        voucher_id: SAVE10_ID,
        code: 'SAVE10',
        voucher_kind: 'promo_code',
        title: 'Save 10',
        benefit_class: 'percent_off',
        benefit_target: 'items',
        percent_off_bps: 1000,
        ...(overridesByCode.SAVE10 || {})
    }),
    FREEDEL_TYPED: baseVoucherFields({
        voucher_id: FREEDEL_TYPED_ID,
        code: 'FREEDELTYPED',
        voucher_kind: 'delivery_campaign',
        title: 'Typed Free Delivery',
        benefit_class: 'free_delivery',
        benefit_target: 'delivery',
        ...(overridesByCode.FREEDEL_TYPED || {})
    }),
    AUTO_SMALL: baseVoucherFields({
        voucher_id: AUTO_SMALL_ID,
        code: 'AUTOSMALL',
        voucher_kind: 'delivery_campaign',
        title: 'Auto Small',
        benefit_class: 'amount_off',
        benefit_target: 'delivery',
        amount_off_centavos: 2000,
        auto_apply: true,
        ...(overridesByCode.AUTO_SMALL || {})
    }),
    AUTO_MID: baseVoucherFields({
        voucher_id: AUTO_MID_ID,
        code: 'AUTOMID',
        voucher_kind: 'delivery_campaign',
        title: 'Auto Mid',
        benefit_class: 'amount_off',
        benefit_target: 'delivery',
        amount_off_centavos: 6000,
        auto_apply: true,
        ...(overridesByCode.AUTO_MID || {})
    }),
    AUTO_BEST: baseVoucherFields({
        voucher_id: AUTO_BEST_ID,
        code: 'AUTOBEST',
        voucher_kind: 'delivery_campaign',
        title: 'Auto Best',
        benefit_class: 'free_delivery',
        benefit_target: 'delivery',
        delivery_amount_off_centavos: null, // waives the whole fee
        auto_apply: true,
        ...(overridesByCode.AUTO_BEST || {})
    }),
    AUTO_PAUSED: baseVoucherFields({
        voucher_id: AUTO_PAUSED_ID,
        code: 'AUTOPAUSED',
        voucher_kind: 'delivery_campaign',
        title: 'Auto Paused (ineligible)',
        benefit_class: 'free_delivery',
        benefit_target: 'delivery',
        auto_apply: true,
        status: 'paused',
        ...(overridesByCode.AUTO_PAUSED || {})
    })
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

const {
    buildStoreCartQuoteUseCase,
    buildStoreCheckoutUseCase
} = await import('../src/modules/store/usecases/storeUseCases.js');
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

// $100 fixed delivery fee (10000 centavos), $10 subtotal.
const baseSettingsRows = () => [
    ...registeredTransactionSettings(),
    { setting_key: 'store_delivery_fee', setting_value: '100' },
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

const buildFakeCheckoutStoreRepository = ({ settingsRows, createdOrderId = 8501 } = {}) => {
    const transaction = {
        finished: false,
        commit: jest.fn(async () => { transaction.finished = 'commit'; }),
        rollback: jest.fn(async () => { transaction.finished = 'rollback'; }),
        LOCK: { UPDATE: 'UPDATE' }
    };
    return {
        beginTransaction: jest.fn().mockResolvedValue(transaction),
        findLocationById: jest.fn().mockResolvedValue(baseLocation()),
        getSettingsByKeys: jest.fn().mockResolvedValue(settingsRows),
        findSellableItemsByIds: jest.fn().mockResolvedValue(baseItem()),
        findTransactionByIdempotencyKey: jest.fn().mockResolvedValue(null),
        createOnlineTransactionWithLines: jest.fn().mockResolvedValue(createdOrderId),
        getOrderById: jest.fn().mockResolvedValue({
            pos_transaction_id: createdOrderId,
            tracking_pin: 'SK-AUTOAPPLY',
            invoice_number: 'INV-000002',
            order_source: 'online_store',
            order_method: 'delivery',
            payment_type: 'cash',
            payment_status: 'unpaid',
            fulfillment_status: 'placed',
            subtotal_amount: 1000,
            discount_amount: 0,
            service_fee_amount: 0,
            delivery_fee: 0,
            total_amount: 1000,
            customer_name: 'Buyer',
            customer_phone: '0917',
            customer_email: null,
            location: { location_id: 3, name: 'Main', address_line: 'Address' },
            lines: []
        }),
        nextInvoiceNumber: jest.fn().mockResolvedValue('INV-000002'),
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
        idempotency_key: `auto-apply-${Math.floor(Math.random() * 1e9)}`,
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

const runQuote = async ({ settingsRows, payloadOverrides = {} }) => {
    const useCase = buildQuoteUseCase(settingsRows);
    return useCase({ payload: deliveryPayload(payloadOverrides) });
};

beforeEach(() => {
    currentFakeVoucherRepository = buildFakeVoucherRepository(Object.values(makeVoucherFixtures()));
});

describe('determinism -- quote and checkout agree byte-for-byte with no delivery_voucher_code typed', () => {
    test('both pick the same (middle-ranked-by-seed-order) winning campaign, at the same waiver, with no code entered', async () => {
        const quote = await runQuote({ settingsRows: baseSettingsRows() });
        expect(quote.success).toBe(true);
        // AUTO_BEST (free_delivery, waives the whole 100) beats AUTO_MID (60) beats AUTO_SMALL (20);
        // AUTO_PAUSED is ineligible and must never be considered.
        expect(quote.data.delivery_fee).toBe(0);
        expect(quote.data.delivery_fee_waiver).toBe(100);
        expect(quote.data.delivery_voucher_feedback).toEqual({
            applied: true,
            voucher_code: 'AUTOBEST',
            auto_applied: true,
            label: 'Auto Best'
        });

        const { result: checkout, storeRepository } = await runCheckout({ settingsRows: baseSettingsRows() });
        expect(checkout.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];

        // Byte-for-byte agreement between the two independent resolutions.
        expect(header.delivery_fee_base).toBe(100);
        expect(header.delivery_fee).toBe(quote.data.delivery_fee);
        expect(header.delivery_fee_waiver).toBe(quote.data.delivery_fee_waiver);
        expect(header.delivery_fee_waiver_voucher_id).toBe(AUTO_BEST_ID);
        expect(checkout.data.delivery_voucher_feedback).toEqual({
            applied: true,
            voucher_code: 'AUTOBEST',
            redemption_id: expect.any(Number),
            auto_applied: true,
            label: 'Auto Best'
        });

        // Exactly one ledger row created by checkout; quote created none.
        expect(currentFakeVoucherRepository.__state.redemptions).toHaveLength(1);
        expect(currentFakeVoucherRepository.__state.redemptions[0].voucher_id).toBe(AUTO_BEST_ID);
    });

    test('the winner is independent of the candidate array order returned by the repository', async () => {
        const fixtures = Object.values(makeVoucherFixtures());
        currentFakeVoucherRepository = buildFakeVoucherRepository([...fixtures].reverse());
        const quote = await runQuote({ settingsRows: baseSettingsRows() });
        expect(quote.data.delivery_voucher_feedback.voucher_code).toBe('AUTOBEST');
    });
});

describe('exhaustion -- a budget-exhausted campaign disappears identically from both paths', () => {
    test('a count-exhausted top campaign disappears; the next-funded campaign auto-applies instead', async () => {
        currentFakeVoucherRepository = buildFakeVoucherRepository(Object.values(makeVoucherFixtures({
            AUTO_BEST: { max_redemptions: 1, redeemed_count: 1 } // already exhausted
        })));

        const quote = await runQuote({ settingsRows: baseSettingsRows() });
        expect(quote.data.delivery_voucher_feedback.voucher_code).toBe('AUTOMID');
        expect(quote.data.delivery_fee_waiver).toBe(60);

        const { result: checkout, storeRepository } = await runCheckout({ settingsRows: baseSettingsRows() });
        expect(checkout.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(header.delivery_fee_waiver_voucher_id).toBe(AUTO_MID_ID);
        expect(header.delivery_fee_waiver).toBe(60);

        // The exhausted campaign's own counters are untouched by this order.
        const exhausted = currentFakeVoucherRepository.__state.vouchers.find((v) => v.voucher_id === AUTO_BEST_ID);
        expect(exhausted.redeemed_count).toBe(1);
    });

    test('when every campaign is exhausted, auto-apply disappears entirely -- full delivery fee charged, no redemption', async () => {
        currentFakeVoucherRepository = buildFakeVoucherRepository(Object.values(makeVoucherFixtures({
            AUTO_BEST: { max_redemptions: 1, redeemed_count: 1 },
            AUTO_MID: { max_redemptions: 1, redeemed_count: 1 },
            AUTO_SMALL: { max_redemptions: 1, redeemed_count: 1 }
        })));

        const quote = await runQuote({ settingsRows: baseSettingsRows() });
        expect(quote.data.delivery_fee).toBe(100);
        expect(quote.data.delivery_fee_waiver).toBe(0);
        expect(quote.data.delivery_voucher_feedback).toBeNull();

        const { result: checkout, storeRepository } = await runCheckout({ settingsRows: baseSettingsRows() });
        expect(checkout.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(header.delivery_fee).toBe(100);
        expect(header.delivery_fee_waiver).toBe(0);
        expect(header.delivery_fee_waiver_voucher_id).toBeNull();
        expect(currentFakeVoucherRepository.__state.redemptions).toHaveLength(0);
    });

    test('peso-budget exhaustion (not just count) filters a campaign the same way', async () => {
        currentFakeVoucherRepository = buildFakeVoucherRepository(Object.values(makeVoucherFixtures({
            // Fully-funded by count, but only 50 centavos of budget left -- less than the 100-peso
            // (10000 centavos... wait, this fixture is in PESO waiver units) waiver it would need.
            AUTO_BEST: { max_total_discount_centavos: 5000, redeemed_value_centavos: 5000 }
        })));

        const quote = await runQuote({ settingsRows: baseSettingsRows() });
        expect(quote.data.delivery_voucher_feedback.voucher_code).toBe('AUTOMID');
    });
});

describe('precedence -- a typed code, an item voucher, and a pickup order', () => {
    test('a typed valid delivery code wins outright; the auto-apply campaign is never touched', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { delivery_voucher_code: 'FREEDELTYPED' }
        });
        expect(result.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(header.delivery_fee_waiver_voucher_id).toBe(FREEDEL_TYPED_ID);

        // No auto-apply campaign redeemed at all.
        const autoRedemptions = currentFakeVoucherRepository.__state.redemptions.filter(
            (r) => [AUTO_SMALL_ID, AUTO_MID_ID, AUTO_BEST_ID].includes(r.voucher_id)
        );
        expect(autoRedemptions).toHaveLength(0);
        const autoBest = currentFakeVoucherRepository.__state.vouchers.find((v) => v.voucher_id === AUTO_BEST_ID);
        expect(autoBest.redeemed_count).toBe(0);
    });

    test('a typed INVALID delivery code fails closed with 422 -- auto-apply does not rescue it', async () => {
        const { result } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { delivery_voucher_code: 'DOES-NOT-EXIST' }
        });
        expect(result.success).toBe(false);
        const autoBest = currentFakeVoucherRepository.__state.vouchers.find((v) => v.voucher_id === AUTO_BEST_ID);
        expect(autoBest.redeemed_count).toBe(0);
    });

    test('a typed item voucher and the auto-applied delivery campaign both apply -- two independent axes', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { voucher_code: 'SAVE10' }
        });
        expect(result.success).toBe(true);
        expect(result.error?.details?.reason_code).not.toBe('VOUCHER_DISCOUNT_SLOT_OCCUPIED');

        const [{ header, discount }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(discount.discount_amount).toBe(100); // 10% of 1000
        expect(header.delivery_fee_waiver_voucher_id).toBe(AUTO_BEST_ID);
        expect(header.delivery_fee_waiver).toBe(100);
        expect(header.delivery_fee).toBe(0);
    });

    test('idempotent replay: retrying with the same idempotency_key redeems the auto campaign exactly once', async () => {
        const storeRepository = buildFakeCheckoutStoreRepository({ settingsRows: baseSettingsRows() });
        const useCase = buildStoreCheckoutUseCase({ storeRepository, revenueSharingEnabled: true });
        const idempotencyKey = 'replay-key-1';

        const payload = withGuestProof(deliveryPayload({ idempotency_key: idempotencyKey }));
        const first = await useCase({ tenantId: TENANT_ID, payload });
        expect(first.success).toBe(true);
        expect(currentFakeVoucherRepository.__state.redemptions).toHaveLength(1);

        // Second attempt: same idempotency key, transaction lookup would normally short-circuit
        // earlier in a real DB -- but exercising the voucher-layer idempotency guard directly is the
        // point here (findTransactionByIdempotencyKey stays mocked to null so this reaches the
        // voucher redemption call again).
        const second = await useCase({ tenantId: TENANT_ID, payload });
        expect(second.success).toBe(true);
        expect(currentFakeVoucherRepository.__state.redemptions).toHaveLength(1);
        const autoBest = currentFakeVoucherRepository.__state.vouchers.find((v) => v.voucher_id === AUTO_BEST_ID);
        expect(autoBest.redeemed_count).toBe(1);
    });

    test('a pickup order never considers auto-apply, even with a funded campaign available', async () => {
        const { result, storeRepository } = await runCheckout({
            settingsRows: baseSettingsRows(),
            payloadOverrides: { order_method: 'pickup', delivery_address: undefined, delivery_latitude: undefined, delivery_longitude: undefined }
        });
        expect(result.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        expect(header.delivery_fee_waiver_voucher_id).toBeNull();
        expect(currentFakeVoucherRepository.__state.redemptions).toHaveLength(0);
    });
});

describe('fail-open on a redemption failure (D2)', () => {
    test('when the winning campaign cannot be reserved at redeem time, checkout still succeeds with no waiver', async () => {
        // Seed AUTO_BEST already exhausted at the repository layer for the RESERVE step specifically,
        // by making reserveRedemption always fail for it while still surfacing as eligible in the
        // (stale) redeemed_count the selector reads -- simulate the "exhausted between read and
        // reserve" race directly.
        const fixtures = Object.values(makeVoucherFixtures());
        const repo = buildFakeVoucherRepository(fixtures);
        const originalReserve = repo.reserveRedemption.bind(repo);
        repo.reserveRedemption = async (voucherId, args) => {
            if (Number(voucherId) === AUTO_BEST_ID) return 0; // simulate the race -- always fails
            return originalReserve(voucherId, args);
        };
        currentFakeVoucherRepository = repo;

        const { result, storeRepository } = await runCheckout({ settingsRows: baseSettingsRows() });
        expect(result.success).toBe(true);
        const [{ header }] = storeRepository.createOnlineTransactionWithLines.mock.calls[0];
        // Fails open: full fee charged, no waiver, no next-candidate retry (AUTO_MID never tried).
        expect(header.delivery_fee).toBe(100);
        expect(header.delivery_fee_waiver).toBe(0);
        expect(header.delivery_fee_waiver_voucher_id).toBeNull();
    });
});
