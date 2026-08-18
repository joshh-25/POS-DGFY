// Use-case tests for src/modules/vouchers/usecases/voucherDisplayUseCases.js (#603, storefront
// catalog display seam).
//
// No database: `repository` is a plain in-memory fake, same pattern as
// voucherRedemptionUseCases.usecases.test.js. This module is deliberately fail-open, so most tests
// assert a graceful `applied: false` fallback rather than a thrown error.

import { buildResolveVoucherDisplayPricesUseCase } from '../src/modules/vouchers/usecases/voucherDisplayUseCases.js';

const VOUCHER_DEFAULTS = {
    voucher_id: 1,
    code: 'SAVE10',
    benefit_class: 'percent_off',
    percent_off_bps: 1000, // 10%
    amount_off_centavos: null,
    fixed_unit_price_centavos: null,
    max_discount_centavos: null,
    min_spend_centavos: null,
    min_quantity: null,
    valid_from: null,
    valid_until: null,
    valid_time_start: null,
    valid_time_end: null,
    weekday_mask: 127,
    channels_mask: 1, // storefront
    fulfillment_methods_mask: 3,
    order_timings_mask: 3,
    max_redemptions: null,
    max_total_discount_centavos: null,
    max_benefit_quantity: null,
    redeemed_count: 0,
    redeemed_value_centavos: 0,
    redeemed_quantity: 0,
    status: 'active',
    version: 0
};

const makeVoucher = (overrides = {}) => ({ ...VOUCHER_DEFAULTS, ...overrides });

const makeFakeRepository = ({ vouchers = [], scopes = [], folders = [], pricelistItemsByPricelistId = {} } = {}) => {
    const state = { vouchers: vouchers.map((v) => ({ ...v })), scopes: scopes.map((s) => ({ ...s })), folders: folders.map((f) => ({ ...f })), pricelistItemsByPricelistId, calls: [] };
    return {
        __state: state,
        async findByCode(code) {
            state.calls.push('findByCode');
            const normalized = String(code || '').trim().toUpperCase();
            const row = state.vouchers.find((v) => v.code === normalized);
            return row ? { ...row } : null;
        },
        async listScopes(voucherIds) {
            state.calls.push('listScopes');
            const ids = new Set((voucherIds || []).map(Number));
            return state.scopes.filter((s) => ids.has(Number(s.voucher_id))).map((s) => ({ ...s }));
        },
        async listItemFolderAdjacency() {
            state.calls.push('listItemFolderAdjacency');
            return state.folders.map((f) => ({ ...f }));
        },
        async listPricelistItemPrices(pricelistId) {
            state.calls.push('listPricelistItemPrices');
            return { ...(state.pricelistItemsByPricelistId[Number(pricelistId)] || {}) };
        }
    };
};

const ITEMS = [
    { item_id: 1, folder_id: null, default_sale_price: 100 },
    { item_id: 2, folder_id: null, default_sale_price: 50 }
];

describe('resolveVoucherDisplayPricesUseCase', () => {
    it('returns not-applied for an empty code without touching the repository', async () => {
        const repository = makeFakeRepository({});
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: '', items: ITEMS });
        expect(result.applied).toBe(false);
        expect(repository.__state.calls).toEqual([]);
    });

    it('fails open (not-applied) when the code does not resolve', async () => {
        const repository = makeFakeRepository({});
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'MISSING', items: ITEMS });
        expect(result.applied).toBe(false);
        expect(result.pricesByItemId).toEqual({});
    });

    it('resolves percent_off prices for every unscoped item at quantity 1', async () => {
        const repository = makeFakeRepository({ vouchers: [makeVoucher()] });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'save10', items: ITEMS });

        expect(result.applied).toBe(true);
        expect(result.badgeOnly).toBe(false);
        expect(result.pricesByItemId[1]).toEqual({ original_price: 100, voucher_price: 90 });
        expect(result.pricesByItemId[2]).toEqual({ original_price: 50, voucher_price: 45 });
    });

    it('resolves fixed_price prices, clamped so a line never goes negative', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({ benefit_class: 'fixed_price', percent_off_bps: null, fixed_unit_price_centavos: 7000 })]
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'SAVE10', items: ITEMS });

        expect(result.applied).toBe(true);
        // item 1: 100 -> 70 (fixed price below catalog price)
        expect(result.pricesByItemId[1]).toEqual({ original_price: 100, voucher_price: 70 });
        // item 2: catalog price 50 is already below the fixed 70 -- decision 5, clamp at zero
        // discount, no entry (discountCentavos <= 0 is skipped).
        expect(result.pricesByItemId[2]).toBeUndefined();
    });

    it('marks amount_off as badge-only -- no per-item price rewrite', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({ benefit_class: 'amount_off', percent_off_bps: null, amount_off_centavos: 2000 })]
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'SAVE10', items: ITEMS });

        expect(result.applied).toBe(true);
        expect(result.badgeOnly).toBe(true);
        expect(result.pricesByItemId).toEqual({});
    });

    it('fails open (not-applied) on a campaign-level gate failure -- expired voucher', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({ valid_until: '2000-01-01' })]
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'SAVE10', items: ITEMS });

        expect(result.applied).toBe(false);
        expect(result.reasonCode).toBe('VOUCHER_EXPIRED');
    });

    it('fails open on channel mismatch (a POS-only voucher shown on storefront)', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({ channels_mask: 2 })] // pos only
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'SAVE10', items: ITEMS, channel: 'storefront' });

        expect(result.applied).toBe(false);
        expect(result.reasonCode).toBe('VOUCHER_CHANNEL_NOT_ELIGIBLE');
    });

    it('does NOT block on fulfillment/order-timing/min-spend/min-quantity/exhaustion reasons -- unknowable pre-cart', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({
                fulfillment_methods_mask: 0, // would block every fulfillment method if evaluated
                order_timings_mask: 0,
                min_spend_centavos: 999999,
                min_quantity: 999,
                max_redemptions: 1,
                redeemed_count: 1 // exhaustion preview would say "reached" -- must not gate display
            })]
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'SAVE10', items: ITEMS });

        expect(result.applied).toBe(true);
        expect(result.pricesByItemId[1]).toEqual({ original_price: 100, voucher_price: 90 });
    });

    it('refuses a fixed_price voucher under active affiliate attribution (ADR 0066 decision 7)', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({ benefit_class: 'fixed_price', percent_off_bps: null, fixed_unit_price_centavos: 7000 })]
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'SAVE10', items: ITEMS, affiliatePricingActive: true });

        expect(result.applied).toBe(false);
        expect(result.reasonCode).toBe('VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT');
    });

    // #696: a pricelist-backed voucher uses the price map as its scope -- voucher_scopes is never
    // consulted when one is attached.
    it('resolves per-item pricelist prices and ignores voucher_scopes entirely', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({
                benefit_class: 'fixed_price',
                percent_off_bps: null,
                fixed_unit_price_centavos: null,
                pricelist_id: 7
            })],
            scopes: [{ voucher_id: 1, scope_type: 'item', scope_ref_id: 999 }],
            pricelistItemsByPricelistId: { 7: { 1: 7000, 2: 4000 } }
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'SAVE10', items: ITEMS });

        expect(result.applied).toBe(true);
        expect(result.pricesByItemId[1]).toEqual({ original_price: 100, voucher_price: 70 });
        // item 2's pin (4000 centavos = ₱40) undercuts its ₱50 catalog price too, so it also prices.
        expect(result.pricesByItemId[2]).toEqual({ original_price: 50, voucher_price: 40 });
        expect(repository.__state.calls).toContain('listPricelistItemPrices');
        expect(repository.__state.calls).not.toContain('listScopes');
    });

    it('excludes an item outside the voucher\'s folder scope', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher()],
            scopes: [{ voucher_id: 1, scope_type: 'item_folder', scope_ref_id: 10 }],
            folders: [{ folder_id: 10, parent_id: null }]
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        // item 1 is in the scoped folder, item 2 is not.
        const result = await resolve({
            code: 'SAVE10',
            items: [
                { item_id: 1, folder_id: 10, default_sale_price: 100 },
                { item_id: 2, folder_id: 20, default_sale_price: 50 }
            ]
        });

        expect(result.applied).toBe(true);
        expect(result.pricesByItemId[1]).toEqual({ original_price: 100, voucher_price: 90 });
        expect(result.pricesByItemId[2]).toBeUndefined();
    });

    // #697: fail open, per item, on a below-cost resolution -- the rest of the batch is unaffected.
    it('fails open per item on a below-cost voucher price, leaving other items priced', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({ benefit_class: 'fixed_price', percent_off_bps: null, fixed_unit_price_centavos: 500 })]
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({
            code: 'SAVE10',
            items: [
                // 100 pesos -> pinned 5 pesos undercuts an 8-peso cost.
                { item_id: 1, folder_id: null, default_sale_price: 100, cost_per_unit: 8 },
                // 50 pesos -> pinned 5 pesos is still above a 1-peso cost, stays priced.
                { item_id: 2, folder_id: null, default_sale_price: 50, cost_per_unit: 1 }
            ]
        });

        expect(result.applied).toBe(true);
        expect(result.pricesByItemId[1]).toBeUndefined();
        expect(result.pricesByItemId[2]).toEqual({ original_price: 50, voucher_price: 5 });
    });

    // #697/RF-2 (PR #699 review): a voucher explicitly configured to allow below-cost pricing
    // must show that price on the storefront too -- checkout (voucherRedemptionUseCases.js) would
    // honor it, so hiding it here would contradict what the customer actually pays.
    it('shows the voucher price when allow_below_cost is true, even though it undercuts cost', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({
                benefit_class: 'fixed_price',
                percent_off_bps: null,
                fixed_unit_price_centavos: 500,
                allow_below_cost: true
            })]
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({
            code: 'SAVE10',
            items: [
                // 100 pesos -> pinned 5 pesos undercuts an 8-peso cost, but allow_below_cost is true.
                { item_id: 1, folder_id: null, default_sale_price: 100, cost_per_unit: 8 }
            ]
        });

        expect(result.applied).toBe(true);
        expect(result.pricesByItemId[1]).toEqual({ original_price: 100, voucher_price: 5 });
    });

    it('does not block a below-cost line when cost_per_unit is unknown', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher({ benefit_class: 'fixed_price', percent_off_bps: null, fixed_unit_price_centavos: 500 })]
        });
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({
            code: 'SAVE10',
            items: [{ item_id: 1, folder_id: null, default_sale_price: 100, cost_per_unit: null }]
        });

        expect(result.applied).toBe(true);
        expect(result.pricesByItemId[1]).toEqual({ original_price: 100, voucher_price: 5 });
    });

    it('fails open when the repository throws resolving the voucher code', async () => {
        const repository = {
            async findByCode() {
                throw new Error('DB unavailable');
            }
        };
        const resolve = buildResolveVoucherDisplayPricesUseCase({ repository });
        const result = await resolve({ code: 'SAVE10', items: ITEMS });

        expect(result.applied).toBe(false);
        expect(result.pricesByItemId).toEqual({});
    });
});
