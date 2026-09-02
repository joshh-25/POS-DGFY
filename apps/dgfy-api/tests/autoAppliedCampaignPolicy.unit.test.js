// Unit tests for Phase 244 (#1332, epic #1321 decision 9)'s pure auto-applied delivery-campaign
// selector, `autoAppliedCampaignPolicy.js`. Zero mocks -- fixture-driven, matching the discipline
// `voucherEligibilityPolicy.unit.test.js`/`voucherBenefitPolicy` tests already establish for this
// module's sibling pure-domain files.

import { describe, expect, it } from '@jest/globals';
import {
    selectAutoAppliedDeliveryCampaign,
    AutoAppliedCampaignPolicyError,
    AUTO_APPLY_REJECTION_REASONS
} from '../src/modules/vouchers/domain/autoAppliedCampaignPolicy.js';

const NOW = new Date('2026-09-02T04:00:00.000Z'); // Wednesday, 12:00 Asia/Manila

const baseVoucher = (overrides = {}) => ({
    voucher_id: 1,
    code: 'AUTO1',
    title: 'Auto Campaign',
    badge: null,
    auto_apply: true,
    benefit_class: 'free_delivery',
    benefit_target: 'delivery',
    delivery_amount_off_centavos: null,
    percent_off_bps: null,
    amount_off_centavos: null,
    max_discount_centavos: null,
    status: 'active',
    valid_from: null,
    valid_until: null,
    valid_time_start: null,
    valid_time_end: null,
    weekday_mask: 127,
    channels_mask: 1,
    fulfillment_methods_mask: 1, // delivery only
    order_timings_mask: 3,
    min_spend_centavos: null,
    min_quantity: null,
    max_redemptions: null,
    max_total_discount_centavos: null,
    max_benefit_quantity: null,
    redeemed_count: 0,
    redeemed_value_centavos: 0,
    redeemed_quantity: 0,
    ...overrides
});

const baseContext = (overrides = {}) => ({
    now: NOW,
    timezone: 'Asia/Manila',
    channel: 'storefront',
    fulfillmentMethod: 'delivery',
    orderTiming: 'asap',
    subtotalCentavos: 100000,
    quantity: 2,
    deliveryFeeCentavos: 5000,
    affiliatePricing: null,
    ...overrides
});

describe('selectAutoAppliedDeliveryCampaign', () => {
    it('returns no selection for an empty candidate list', () => {
        const result = selectAutoAppliedDeliveryCampaign({ candidates: [], context: baseContext() });
        expect(result.selected).toBeNull();
        expect(result.waiverCentavos).toBe(0);
        expect(result.consideredCount).toBe(0);
        expect(result.eligibleCount).toBe(0);
    });

    it('selects a single eligible campaign, waiving the whole fee when delivery_amount_off_centavos is null', () => {
        const voucher = baseVoucher();
        const result = selectAutoAppliedDeliveryCampaign({ candidates: [voucher], context: baseContext() });
        expect(result.selected?.voucher_id).toBe(1);
        expect(result.waiverCentavos).toBe(5000);
    });

    it('throws when context.now is missing -- no ambient clock fallback', () => {
        expect(() => selectAutoAppliedDeliveryCampaign({
            candidates: [baseVoucher()],
            context: { ...baseContext(), now: undefined }
        })).toThrow(AutoAppliedCampaignPolicyError);
    });

    it('throws when context.now is not a valid Date', () => {
        expect(() => selectAutoAppliedDeliveryCampaign({
            candidates: [baseVoucher()],
            context: { ...baseContext(), now: new Date('not-a-date') }
        })).toThrow(AutoAppliedCampaignPolicyError);
    });

    describe('ordering', () => {
        it('picks the larger waiver when two campaigns are both eligible', () => {
            const smaller = baseVoucher({ voucher_id: 1, delivery_amount_off_centavos: 2000 });
            const larger = baseVoucher({ voucher_id: 2, delivery_amount_off_centavos: 4000 });
            const result = selectAutoAppliedDeliveryCampaign({ candidates: [smaller, larger], context: baseContext() });
            expect(result.selected.voucher_id).toBe(2);
            expect(result.waiverCentavos).toBe(4000);
        });

        it('breaks a waiver tie on the earlier valid_from', () => {
            const later = baseVoucher({ voucher_id: 1, valid_from: '2026-06-01' });
            const earlier = baseVoucher({ voucher_id: 2, valid_from: '2026-01-01' });
            const result = selectAutoAppliedDeliveryCampaign({ candidates: [later, earlier], context: baseContext() });
            expect(result.selected.voucher_id).toBe(2);
        });

        it('treats a null valid_from as earliest -- it wins over any real date on a waiver tie', () => {
            const dated = baseVoucher({ voucher_id: 1, valid_from: '2026-01-01' });
            const unbounded = baseVoucher({ voucher_id: 2, valid_from: null });
            const result = selectAutoAppliedDeliveryCampaign({ candidates: [dated, unbounded], context: baseContext() });
            expect(result.selected.voucher_id).toBe(2);
        });

        it('breaks a waiver + valid_from tie on the lower voucher_id', () => {
            const a = baseVoucher({ voucher_id: 5 });
            const b = baseVoucher({ voucher_id: 2 });
            const result = selectAutoAppliedDeliveryCampaign({ candidates: [a, b], context: baseContext() });
            expect(result.selected.voucher_id).toBe(2);
        });

        it('is a strict total order: the same 5-candidate set produces the identical winner across every shuffle', () => {
            const candidates = [
                baseVoucher({ voucher_id: 1, delivery_amount_off_centavos: 1000 }),
                baseVoucher({ voucher_id: 2, delivery_amount_off_centavos: 3000, valid_from: '2026-02-01' }),
                baseVoucher({ voucher_id: 3, delivery_amount_off_centavos: 3000, valid_from: '2026-01-01' }),
                baseVoucher({ voucher_id: 4, delivery_amount_off_centavos: 3000, valid_from: '2026-01-01' }),
                baseVoucher({ voucher_id: 5, delivery_amount_off_centavos: 4500 })
            ];
            // Expected winner: highest waiver (5, 4500) -- id 5.
            const permutations = [
                candidates,
                [...candidates].reverse(),
                [candidates[2], candidates[0], candidates[4], candidates[1], candidates[3]],
                [candidates[4], candidates[3], candidates[2], candidates[1], candidates[0]],
                [candidates[1], candidates[4], candidates[0], candidates[3], candidates[2]],
                [candidates[3], candidates[1], candidates[4], candidates[2], candidates[0]]
            ];
            const winners = permutations.map((set) => selectAutoAppliedDeliveryCampaign({
                candidates: set,
                context: baseContext()
            }).selected.voucher_id);
            expect(new Set(winners).size).toBe(1);
            expect(winners[0]).toBe(5);
        });

        it('with the top waiver removed, the tie among ids 3 and 4 (same waiver, same valid_from) resolves to the lower id', () => {
            const candidates = [
                baseVoucher({ voucher_id: 3, delivery_amount_off_centavos: 3000, valid_from: '2026-01-01' }),
                baseVoucher({ voucher_id: 4, delivery_amount_off_centavos: 3000, valid_from: '2026-01-01' })
            ];
            const result = selectAutoAppliedDeliveryCampaign({ candidates, context: baseContext() });
            expect(result.selected.voucher_id).toBe(3);
        });
    });

    describe('filters -- one rejection reason each', () => {
        const cases = [
            ['auto_apply is false', { auto_apply: false }, AUTO_APPLY_REJECTION_REASONS.NOT_AUTO_APPLY],
            ['benefit_target is items', { benefit_target: 'items' }, AUTO_APPLY_REJECTION_REASONS.NOT_DELIVERY_TARGET],
            ['status is paused', { status: 'paused' }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            ['valid_until has passed', { valid_until: '2020-01-01' }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            ['valid_from is in the future', { valid_from: '2099-01-01' }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            // 127 (0b1111111) minus bit 8 (Wednesday, VOUCHER_WEEKDAY_BITS index 3) = 119.
            ['weekday_mask excludes Wednesday', { weekday_mask: 119 }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            ['channels_mask excludes storefront', { channels_mask: 2 }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            ['fulfillment_methods_mask excludes delivery', { fulfillment_methods_mask: 2 }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            ['order_timings_mask excludes asap', { order_timings_mask: 2 }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            ['min_spend_centavos unmet', { min_spend_centavos: 999999 }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            ['min_quantity unmet', { min_quantity: 99 }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            ['max_redemptions already reached', { max_redemptions: 1, redeemed_count: 1 }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE],
            ['max_total_discount_centavos already exhausted', { max_total_discount_centavos: 100, redeemed_value_centavos: 100 }, AUTO_APPLY_REJECTION_REASONS.NOT_ELIGIBLE]
        ];

        it.each(cases)('%s', (_label, overrides, expectedReason) => {
            const voucher = baseVoucher(overrides);
            const result = selectAutoAppliedDeliveryCampaign({ candidates: [voucher], context: baseContext() });
            expect(result.selected).toBeNull();
            expect(result.rejections).toEqual([{ voucher_id: 1, reason_code: expectedReason }]);
        });
    });

    it('does not select a campaign that resolves to a zero waiver on a zero-fee order', () => {
        const voucher = baseVoucher({ delivery_amount_off_centavos: null });
        const result = selectAutoAppliedDeliveryCampaign({
            candidates: [voucher],
            context: baseContext({ deliveryFeeCentavos: 0 })
        });
        expect(result.selected).toBeNull();
        expect(result.rejections).toEqual([{ voucher_id: 1, reason_code: AUTO_APPLY_REJECTION_REASONS.ZERO_WAIVER }]);
    });

    it('resolves a partial waiver correctly (delivery_amount_off_centavos less than the base fee)', () => {
        const voucher = baseVoucher({ delivery_amount_off_centavos: 3000 });
        const result = selectAutoAppliedDeliveryCampaign({
            candidates: [voucher],
            context: baseContext({ deliveryFeeCentavos: 5000 })
        });
        expect(result.waiverCentavos).toBe(3000);
    });

    it('clamps an over-waiver to the base fee and orders by the CLAMPED value, not the raw configured amount', () => {
        const overWaiver = baseVoucher({ voucher_id: 1, delivery_amount_off_centavos: 9000 }); // clamps to 5000
        const smallerReal = baseVoucher({ voucher_id: 2, delivery_amount_off_centavos: 6000 }); // clamps to 5000 too
        const genuinelySmaller = baseVoucher({ voucher_id: 3, delivery_amount_off_centavos: 4000 });
        const result = selectAutoAppliedDeliveryCampaign({
            candidates: [overWaiver, smallerReal, genuinelySmaller],
            context: baseContext({ deliveryFeeCentavos: 5000 })
        });
        expect(result.waiverCentavos).toBe(5000);
        // Ties on the clamped 5000 broken by voucher_id -- id 1 wins over id 2.
        expect(result.selected.voucher_id).toBe(1);
    });

    it('percent_off targeting delivery is a valid, expressible auto-apply combination', () => {
        const voucher = baseVoucher({
            benefit_class: 'percent_off',
            percent_off_bps: 5000,
            delivery_amount_off_centavos: null
        });
        const result = selectAutoAppliedDeliveryCampaign({
            candidates: [voucher],
            context: baseContext({ deliveryFeeCentavos: 5000 })
        });
        expect(result.selected?.voucher_id).toBe(1);
        expect(result.waiverCentavos).toBe(2500);
    });

    it('is independent of input order for a non-trivial three-candidate set (regression guard for #391 divergence class)', () => {
        const cheap = baseVoucher({ voucher_id: 10, delivery_amount_off_centavos: 1000 });
        const mid = baseVoucher({ voucher_id: 20, delivery_amount_off_centavos: 3000 });
        const best = baseVoucher({ voucher_id: 30, delivery_amount_off_centavos: 5000 });
        const first = selectAutoAppliedDeliveryCampaign({ candidates: [cheap, mid, best], context: baseContext() });
        const second = selectAutoAppliedDeliveryCampaign({ candidates: [best, cheap, mid], context: baseContext() });
        const third = selectAutoAppliedDeliveryCampaign({ candidates: [mid, best, cheap], context: baseContext() });
        expect(first.selected.voucher_id).toBe(30);
        expect(second.selected.voucher_id).toBe(30);
        expect(third.selected.voucher_id).toBe(30);
    });
});
