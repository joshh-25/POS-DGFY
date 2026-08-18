// Use-case tests for src/modules/vouchers/usecases/voucherRedemptionUseCases.js (Phase 105, #455).
//
// No database: `repository` is a plain in-memory fake, same pattern as
// voucherUseCases.usecases.test.js and employeeCredit's own usecase tests. `reserveRedemption` in
// the fake faithfully replicates the real guarded-UPDATE semantics (three exhaustion checks, one
// atomic decision) against in-memory state, so the exhaustion-guard tests below exercise the same
// branch logic `voucherRedemptionUseCases.js` uses to map a `0`-affected-rows result to a reason
// code.

import {
    buildPreviewVoucherEligibilityUseCase,
    buildRedeemVoucherUseCase
} from '../src/modules/vouchers/usecases/voucherRedemptionUseCases.js';
import { VoucherReasonCode } from '../src/modules/vouchers/domain/voucherErrors.js';

const FAKE_TRANSACTION = { id: 'fake-tx' };

const VOUCHER_DEFAULTS = {
    voucher_id: 1,
    code: 'SAVE10',
    benefit_class: 'percent_off',
    percent_off_bps: 1000,
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

const CONTEXT = {
    channel: 'storefront',
    fulfillmentMethod: 'delivery',
    orderTiming: 'asap',
    subtotalCentavos: 10000,
    quantity: 2
};

const LINES = [{ item_id: 1, quantity: 2, sale_price: 50, line_subtotal: 100 }];

const makeFakeRepository = ({ vouchers = [], scopes = [], folders = [], items = [] } = {}) => {
    const state = {
        vouchers: vouchers.map((v) => ({ ...v })),
        scopes: scopes.map((s) => ({ ...s })),
        folders: folders.map((f) => ({ ...f })),
        items: items.map((i) => ({ ...i })),
        redemptions: [],
        lines: [],
        nextRedemptionId: 1,
        nextLineId: 1,
        calls: []
    };

    const findVoucher = (id) => state.vouchers.find((v) => v.voucher_id === Number(id));

    const repository = {
        __state: state,

        async findByCode(code) {
            state.calls.push('findByCode');
            const normalized = String(code || '').trim().toUpperCase();
            const row = state.vouchers.find((v) => v.code === normalized);
            return row ? { ...row } : null;
        },

        async findById(id) {
            state.calls.push('findById');
            const row = findVoucher(id);
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

        async listItemFolderLinksForItems(itemIds) {
            state.calls.push('listItemFolderLinksForItems');
            const ids = new Set((itemIds || []).map(Number));
            return state.items.filter((i) => ids.has(Number(i.item_id))).map((i) => ({ ...i }));
        },

        async findRedemptionByIdempotencyKey(key) {
            state.calls.push('findRedemptionByIdempotencyKey');
            const row = state.redemptions.find((r) => r.idempotency_key === key);
            return row ? { ...row } : null;
        },

        async reserveRedemption(voucherId, { discountCentavos, quantity } = {}) {
            state.calls.push('reserveRedemption');
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
            state.calls.push('createRedemptionLedgerEntry');
            const entry = { voucher_redemption_id: state.nextRedemptionId++, ...values };
            state.redemptions.push(entry);
            return { ...entry };
        },

        async createRedemptionLines(values) {
            state.calls.push('createRedemptionLines');
            const rows = (Array.isArray(values) ? values : [values]).map((v) => ({
                voucher_redemption_line_id: state.nextLineId++,
                ...v
            }));
            state.lines.push(...rows);
            return rows;
        }
    };

    return repository;
};

const expectVoucherError = async (promise, reasonCode) => {
    await expect(promise).rejects.toMatchObject({
        name: 'DomainError',
        details: expect.objectContaining({ reason_code: reasonCode })
    });
};

describe('buildPreviewVoucherEligibilityUseCase', () => {
    it('is a no-op for an empty code', async () => {
        const repository = makeFakeRepository();
        const preview = buildPreviewVoucherEligibilityUseCase({ repository });
        const result = await preview({ code: '', context: CONTEXT, lines: LINES });
        expect(result).toEqual({ applied: false, voucherId: null, code: null, benefitClass: null, discountCentavos: 0, lineAllocations: [] });
    });

    it('fails closed with VOUCHER_NOT_FOUND for an entered-but-unknown code', async () => {
        const repository = makeFakeRepository({ vouchers: [] });
        const preview = buildPreviewVoucherEligibilityUseCase({ repository });
        await expectVoucherError(
            preview({ code: 'NOPE', context: CONTEXT, lines: LINES }),
            VoucherReasonCode.VOUCHER_NOT_FOUND
        );
    });

    it('computes the benefit without reserving anything', async () => {
        const repository = makeFakeRepository({ vouchers: [makeVoucher()] });
        const preview = buildPreviewVoucherEligibilityUseCase({ repository });
        const result = await preview({ code: 'save10', context: CONTEXT, lines: LINES });

        expect(result.applied).toBe(true);
        expect(result.discountCentavos).toBe(1000); // 10% of 10000 centavos
        expect(repository.__state.calls).not.toContain('reserveRedemption');
        expect(repository.__state.redemptions).toHaveLength(0);
    });

    // #697: the preview path shares `resolveEligibleBenefit` with redeem, so it fails closed on the
    // same below-cost condition -- a cart quote must never promise a discount checkout will refuse.
    it('fails closed on a below-cost line, same as redemption', async () => {
        const voucher = makeVoucher({ benefit_class: 'fixed_price', percent_off_bps: null, fixed_unit_price_centavos: 100 });
        const repository = makeFakeRepository({ vouchers: [voucher] });
        const preview = buildPreviewVoucherEligibilityUseCase({ repository });
        // sale_price 50 pesos / cost_snapshot 30 pesos -> pinned price 1 peso undercuts the 30-peso cost.
        const belowCostLines = [{ item_id: 1, quantity: 2, sale_price: 50, cost_snapshot: 30, line_subtotal: 100 }];
        await expectVoucherError(
            preview({ code: 'save10', context: CONTEXT, lines: belowCostLines }),
            VoucherReasonCode.VOUCHER_PRICE_BELOW_COST
        );
    });

    // RF-3 (PR #699 review): the preview path shares `resolveEligibleBenefit` with redeem, so an
    // `allow_below_cost: true` voucher must quote successfully here too, not just at redemption --
    // otherwise a cart preview would refuse a discount checkout would actually honor.
    it('succeeds on a below-cost line when allow_below_cost is true, same as redemption', async () => {
        const voucher = makeVoucher({
            benefit_class: 'fixed_price',
            percent_off_bps: null,
            fixed_unit_price_centavos: 100,
            allow_below_cost: true
        });
        const repository = makeFakeRepository({ vouchers: [voucher] });
        const preview = buildPreviewVoucherEligibilityUseCase({ repository });
        const belowCostLines = [{ item_id: 1, quantity: 2, sale_price: 50, cost_snapshot: 30, line_subtotal: 100 }];
        const result = await preview({ code: 'save10', context: CONTEXT, lines: belowCostLines });
        expect(result.applied).toBe(true);
    });
});

describe('buildRedeemVoucherUseCase', () => {
    it('throws when called without an open transaction', async () => {
        const repository = makeFakeRepository({ vouchers: [makeVoucher()] });
        const redeem = buildRedeemVoucherUseCase({ repository });
        await expect(redeem({ code: 'SAVE10', context: CONTEXT, lines: LINES, idempotencyKey: 'abc12345' }))
            .rejects.toMatchObject({ name: 'DomainError' });
    });

    it('is a no-op for an empty code even with a transaction', async () => {
        const repository = makeFakeRepository({ vouchers: [makeVoucher()] });
        const redeem = buildRedeemVoucherUseCase({ repository });
        const result = await redeem({
            code: '', context: CONTEXT, lines: LINES, idempotencyKey: 'abc12345', transaction: FAKE_TRANSACTION
        });
        expect(result.applied).toBe(false);
        expect(repository.__state.calls).toHaveLength(0);
    });

    it('reserves, writes the ledger entry, and writes per-line allocations in order', async () => {
        const repository = makeFakeRepository({ vouchers: [makeVoucher()] });
        const redeem = buildRedeemVoucherUseCase({ repository });
        const result = await redeem({
            code: 'SAVE10',
            context: CONTEXT,
            lines: LINES,
            idempotencyKey: 'checkout-key-1',
            transaction: FAKE_TRANSACTION
        });

        expect(result.applied).toBe(true);
        expect(result.idempotentReplay).toBe(false);
        expect(result.discountCentavos).toBe(1000);
        expect(result.redemptionId).toBe(1);

        expect(repository.__state.calls).toEqual([
            'findByCode',
            'listScopes',
            'findRedemptionByIdempotencyKey',
            'reserveRedemption',
            'createRedemptionLedgerEntry',
            'createRedemptionLines'
        ]);

        const voucher = repository.__state.vouchers[0];
        expect(voucher.redeemed_count).toBe(1);
        expect(voucher.redeemed_value_centavos).toBe(1000);

        expect(repository.__state.redemptions).toHaveLength(1);
        expect(repository.__state.redemptions[0].idempotency_key).toBe('storefront:checkout-key-1:1');
        expect(repository.__state.lines).toHaveLength(1);
        expect(repository.__state.lines[0].base_unit_price_centavos).toBe(5000);
        expect(repository.__state.lines[0].voucher_unit_price_centavos).toBe(4500);
        expect(repository.__state.lines[0].discount_centavos).toBe(1000);
    });

    it('is idempotent: a replayed checkout key returns the existing row and does not re-mutate', async () => {
        const repository = makeFakeRepository({ vouchers: [makeVoucher()] });
        const redeem = buildRedeemVoucherUseCase({ repository });
        const args = {
            code: 'SAVE10',
            context: CONTEXT,
            lines: LINES,
            idempotencyKey: 'checkout-key-1',
            transaction: FAKE_TRANSACTION
        };

        const first = await redeem(args);
        const second = await redeem(args);

        expect(second.idempotentReplay).toBe(true);
        expect(second.redemptionId).toBe(first.redemptionId);
        expect(second.discountCentavos).toBe(first.discountCentavos);

        // Counters moved exactly once, and exactly one ledger row exists.
        expect(repository.__state.vouchers[0].redeemed_count).toBe(1);
        expect(repository.__state.redemptions).toHaveLength(1);
        expect(repository.__state.calls.filter((call) => call === 'reserveRedemption')).toHaveLength(1);
        expect(repository.__state.calls.filter((call) => call === 'createRedemptionLedgerEntry')).toHaveLength(1);
    });

    it('rejects a fixed_price voucher under an active affiliate attribution', async () => {
        const voucher = makeVoucher({
            benefit_class: 'fixed_price',
            percent_off_bps: null,
            fixed_unit_price_centavos: 4000
        });
        const repository = makeFakeRepository({ vouchers: [voucher] });
        const redeem = buildRedeemVoucherUseCase({ repository });
        await expectVoucherError(
            redeem({
                code: 'SAVE10',
                context: { ...CONTEXT, affiliatePricing: { sellingPriceRule: {} } },
                lines: LINES,
                idempotencyKey: 'checkout-key-2',
                transaction: FAKE_TRANSACTION
            }),
            VoucherReasonCode.VOUCHER_FIXED_PRICE_AFFILIATE_CONFLICT
        );
        expect(repository.__state.calls).not.toContain('reserveRedemption');
    });

    it('fails closed when the folder scope matches none of the cart items', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher()],
            scopes: [{ voucher_id: 1, scope_type: 'item_folder', scope_ref_id: 5 }],
            folders: [{ folder_id: 5, parent_id: null }],
            items: [{ item_id: 1, folder_id: 999 }] // cart item 1 is NOT under folder 5
        });
        const redeem = buildRedeemVoucherUseCase({ repository });
        await expectVoucherError(
            redeem({
                code: 'SAVE10',
                context: CONTEXT,
                lines: LINES,
                idempotencyKey: 'checkout-key-3',
                transaction: FAKE_TRANSACTION
            }),
            VoucherReasonCode.VOUCHER_SCOPE_NO_ELIGIBLE_ITEMS
        );
    });

    it('resolves a folder scope through a descendant folder', async () => {
        const repository = makeFakeRepository({
            vouchers: [makeVoucher()],
            scopes: [{ voucher_id: 1, scope_type: 'item_folder', scope_ref_id: 5 }],
            folders: [
                { folder_id: 5, parent_id: null },
                { folder_id: 6, parent_id: 5 }
            ],
            items: [{ item_id: 1, folder_id: 6 }] // cart item 1 sits under a DESCENDANT of folder 5
        });
        const redeem = buildRedeemVoucherUseCase({ repository });
        const result = await redeem({
            code: 'SAVE10',
            context: CONTEXT,
            lines: LINES,
            idempotencyKey: 'checkout-key-4',
            transaction: FAKE_TRANSACTION
        });
        expect(result.applied).toBe(true);
        expect(result.discountCentavos).toBe(1000);
    });

    describe('#697 below-cost guard', () => {
        const belowCostLines = [{ item_id: 1, quantity: 2, sale_price: 50, cost_snapshot: 30, line_subtotal: 100 }];

        it('fails closed with VOUCHER_PRICE_BELOW_COST when allow_below_cost is false (the default)', async () => {
            const voucher = makeVoucher({ benefit_class: 'fixed_price', percent_off_bps: null, fixed_unit_price_centavos: 100 });
            const repository = makeFakeRepository({ vouchers: [voucher] });
            const redeem = buildRedeemVoucherUseCase({ repository });
            await expectVoucherError(
                redeem({
                    code: 'SAVE10', context: CONTEXT, lines: belowCostLines, idempotencyKey: 'k-below-cost', transaction: FAKE_TRANSACTION
                }),
                VoucherReasonCode.VOUCHER_PRICE_BELOW_COST
            );
            expect(repository.__state.calls).not.toContain('reserveRedemption');
        });

        it('succeeds when allow_below_cost is true', async () => {
            const voucher = makeVoucher({
                benefit_class: 'fixed_price',
                percent_off_bps: null,
                fixed_unit_price_centavos: 100,
                allow_below_cost: true
            });
            const repository = makeFakeRepository({ vouchers: [voucher] });
            const redeem = buildRedeemVoucherUseCase({ repository });
            const result = await redeem({
                code: 'SAVE10', context: CONTEXT, lines: belowCostLines, idempotencyKey: 'k-allowed', transaction: FAKE_TRANSACTION
            });
            expect(result.applied).toBe(true);
        });

        it('is class-agnostic: a deep percent_off below cost also fails closed', async () => {
            const voucher = makeVoucher({ percent_off_bps: 9000 }); // 90% off
            const repository = makeFakeRepository({ vouchers: [voucher] });
            const redeem = buildRedeemVoucherUseCase({ repository });
            await expectVoucherError(
                redeem({
                    code: 'SAVE10', context: CONTEXT, lines: belowCostLines, idempotencyKey: 'k-percent-below-cost', transaction: FAKE_TRANSACTION
                }),
                VoucherReasonCode.VOUCHER_PRICE_BELOW_COST
            );
        });

        it('does not block a line with no recorded cost', async () => {
            const voucher = makeVoucher({ benefit_class: 'fixed_price', percent_off_bps: null, fixed_unit_price_centavos: 0 });
            const repository = makeFakeRepository({ vouchers: [voucher] });
            const redeem = buildRedeemVoucherUseCase({ repository });
            const noCostLines = [{ item_id: 1, quantity: 1, sale_price: 50, cost_snapshot: null, line_subtotal: 50 }];
            const result = await redeem({
                code: 'SAVE10', context: CONTEXT, lines: noCostLines, idempotencyKey: 'k-no-cost', transaction: FAKE_TRANSACTION
            });
            expect(result.applied).toBe(true);
        });
    });

    describe('the three exhaustion guards', () => {
        it('maps a reached redemption-count limit to VOUCHER_REDEMPTION_LIMIT_REACHED', async () => {
            const repository = makeFakeRepository({
                vouchers: [makeVoucher({ max_redemptions: 1, redeemed_count: 1 })]
            });
            const redeem = buildRedeemVoucherUseCase({ repository });
            await expectVoucherError(
                redeem({
                    code: 'SAVE10', context: CONTEXT, lines: LINES, idempotencyKey: 'k-count', transaction: FAKE_TRANSACTION
                }),
                VoucherReasonCode.VOUCHER_REDEMPTION_LIMIT_REACHED
            );
        });

        it('maps an exceeded discount budget to VOUCHER_BUDGET_EXHAUSTED', async () => {
            const repository = makeFakeRepository({
                vouchers: [makeVoucher({ max_total_discount_centavos: 500, redeemed_value_centavos: 0 })]
            });
            const redeem = buildRedeemVoucherUseCase({ repository });
            // Discount will be 1000 centavos, which exceeds the 500 budget.
            await expectVoucherError(
                redeem({
                    code: 'SAVE10', context: CONTEXT, lines: LINES, idempotencyKey: 'k-budget', transaction: FAKE_TRANSACTION
                }),
                VoucherReasonCode.VOUCHER_BUDGET_EXHAUSTED
            );
        });

        it('maps an exceeded benefit-quantity limit to VOUCHER_QUANTITY_LIMIT_REACHED', async () => {
            const repository = makeFakeRepository({
                vouchers: [makeVoucher({ max_benefit_quantity: 1, redeemed_quantity: 0 })]
            });
            const redeem = buildRedeemVoucherUseCase({ repository });
            // The cart line's quantity is 2, which exceeds the max_benefit_quantity of 1.
            await expectVoucherError(
                redeem({
                    code: 'SAVE10', context: CONTEXT, lines: LINES, idempotencyKey: 'k-qty', transaction: FAKE_TRANSACTION
                }),
                VoucherReasonCode.VOUCHER_QUANTITY_LIMIT_REACHED
            );
        });
    });
});
