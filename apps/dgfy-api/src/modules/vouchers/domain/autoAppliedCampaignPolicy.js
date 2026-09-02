// #1332 (Phase 244, epic #1321 decision 9): the pure auto-applied delivery-campaign selector.
//
// PURITY CONTRACT (stated outright, same discipline `voucherBenefitPolicy.js`'s own header sets):
//   - No I/O of any kind -- no repository, no dbStore, no logger, no fetch. The candidate list is
//     handed in; this module never fetches it (see voucherAutoApplyUseCases.js for the one query).
//   - No ambient clock. `context.now` is REQUIRED and must already be a `Date` -- this function
//     THROWS if it is missing, deliberately not defaulting to `Date.now()` the way
//     `evaluateVoucherEligibility` does. A quote request and a checkout request are two separate
//     HTTP calls; if this module let `now` drift to the ambient clock, a campaign with a
//     `valid_time_end` boundary could select differently between the two with no code defect at
//     all -- exactly the divergence this whole phase exists to prevent (Risk R2 in the Phase 244
//     plan).
//   - Imports only pure same-directory siblings: `evaluateVoucherEligibility`
//     (voucherEligibilityPolicy.js), `calculateVoucherBenefit` (voucherBenefitPolicy.js), and the
//     free_delivery translation (deliveryBenefitTranslation.js). All three are zero-I/O, so the
//     composition here stays fixture-reproducible.
//
// Eligibility filtering lives INSIDE this selector, not in the caller or in SQL (see
// voucherAutoApplyUseCases.js's own header) -- that is the single structural property that makes
// quote/checkout divergence impossible. If the caller pre-filtered, there would be two filter
// implementations to keep in sync forever.
//
// v1 LIMITATION, stated explicitly: this selector does not consult `voucher_scopes` at all -- a
// delivery-targeted benefit has no per-line component by construction
// (`voucherBenefitPolicy.js`'s own "Direction A" note), so scoping a delivery campaign to an item
// folder is not an expressible product concept today. `voucherUseCases.js`'s authoring guards
// reject `auto_apply: true` combined with any `voucher_scopes` row, so this limitation can never
// actually be reached in practice -- it is not silently ignored, it is unrepresentable.

import { evaluateVoucherEligibility } from './voucherEligibilityPolicy.js';
import { calculateVoucherBenefit, VoucherBenefitError } from './voucherBenefitPolicy.js';
import { resolveDeliveryAmountOffCentavos } from './deliveryBenefitTranslation.js';

export class AutoAppliedCampaignPolicyError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'AutoAppliedCampaignPolicyError';
        this.code = code;
        this.details = details;
    }
}

const REJECTION_REASONS = Object.freeze({
    NOT_AUTO_APPLY: 'NOT_AUTO_APPLY',
    NOT_DELIVERY_TARGET: 'NOT_DELIVERY_TARGET',
    NOT_ELIGIBLE: 'NOT_ELIGIBLE',
    ZERO_WAIVER: 'ZERO_WAIVER',
    BENEFIT_CALC_ERROR: 'BENEFIT_CALC_ERROR'
});

export const AUTO_APPLY_REJECTION_REASONS = REJECTION_REASONS;

// `valid_from` (DATEONLY, nullable) normalized so NULL sorts before every real date --
// "no start bound" reads as "started earliest," matching the intent of an unbounded campaign
// beating a scheduled-future one on this tiebreaker. Deliberately NOT `new Date(null)` (epoch 1970
// -- a coincidence, not a contract) and NOT numeric -Infinity coercion; a plain string comparison
// against '' is exact and has no timezone/parsing ambiguity.
const validFromSortKey = (voucher) => {
    if (voucher.valid_from == null) return '';
    const text = String(voucher.valid_from).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
};

/**
 * Strict total order: waiverCentavos DESC, then valid_from ASC (NULL first), then voucher_id ASC.
 * `voucher_id` is the auto-increment primary key, unique within one tenant database, so it is
 * injective over any candidate set drawn from one tenant -- the comparator can never report two
 * distinct candidates as equal. `sorted[0]` is therefore a unique, deterministic winner regardless
 * of the input array's order or `Array#sort`'s stability (R5 in the Phase 244 plan: do not drop the
 * third key "because sort is stable anyway" -- stability is irrelevant here by construction, but a
 * comparator that omitted the tiebreaker would reintroduce input-order dependence for a genuine tie
 * on the first two keys).
 */
const compareCandidates = (a, b) => {
    if (b.waiverCentavos !== a.waiverCentavos) return b.waiverCentavos - a.waiverCentavos;
    const aKey = validFromSortKey(a.voucher);
    const bKey = validFromSortKey(b.voucher);
    if (aKey !== bKey) return aKey < bKey ? -1 : 1;
    return Number(a.voucher.voucher_id) - Number(b.voucher.voucher_id);
};

/**
 * @param {{
 *   candidates: Array<Object>,
 *   context: {
 *     now: Date,
 *     timezone?: string,
 *     channel: 'storefront',
 *     fulfillmentMethod: 'delivery'|'pickup',
 *     orderTiming: 'asap'|'scheduled',
 *     subtotalCentavos: number,
 *     quantity: number,
 *     deliveryFeeCentavos: number,
 *     affiliatePricing?: Object|null
 *   }
 * }} args
 * @returns {{
 *   selected: Object|null,
 *   waiverCentavos: number,
 *   consideredCount: number,
 *   eligibleCount: number,
 *   rejections: Array<{voucher_id: number, reason_code: string}>
 * }}
 */
export const selectAutoAppliedDeliveryCampaign = ({ candidates = [], context = {} } = {}) => {
    if (!(context.now instanceof Date) || Number.isNaN(context.now.getTime())) {
        throw new AutoAppliedCampaignPolicyError(
            'MISSING_CONTEXT_NOW',
            'selectAutoAppliedDeliveryCampaign requires an explicit context.now Date -- no ambient clock fallback.',
            {}
        );
    }

    const rejections = [];
    const reject = (voucher, reasonCode) => {
        rejections.push({ voucher_id: voucher?.voucher_id ?? null, reason_code: reasonCode });
    };

    const eligible = [];
    for (const voucher of Array.isArray(candidates) ? candidates : []) {
        if (voucher?.auto_apply !== true && voucher?.auto_apply !== 1) {
            reject(voucher, REJECTION_REASONS.NOT_AUTO_APPLY);
            continue;
        }
        if (voucher.benefit_target !== 'delivery') {
            reject(voucher, REJECTION_REASONS.NOT_DELIVERY_TARGET);
            continue;
        }

        const evaluation = evaluateVoucherEligibility({ voucher, context });
        if (!evaluation.eligible) {
            reject(voucher, REJECTION_REASONS.NOT_ELIGIBLE);
            continue;
        }

        const isDeliveryBenefit = voucher.benefit_class === 'free_delivery';
        const resolvedAmountOffCentavos = isDeliveryBenefit
            ? resolveDeliveryAmountOffCentavos(voucher)
            : voucher.amount_off_centavos;

        let benefit;
        try {
            benefit = calculateVoucherBenefit({
                benefitClass: isDeliveryBenefit ? 'amount_off' : voucher.benefit_class,
                benefitTarget: 'delivery',
                deliveryFeeCentavos: context.deliveryFeeCentavos ?? null,
                percentOffBps: voucher.percent_off_bps,
                amountOffCentavos: resolvedAmountOffCentavos,
                maxDiscountCentavos: voucher.max_discount_centavos,
                // A delivery-targeted benefit has no per-line component by construction
                // (voucherBenefitPolicy.js's own header, "Direction A") -- there is nothing to
                // apportion, so no lines are ever passed.
                lines: []
            });
        } catch (error) {
            if (error instanceof VoucherBenefitError) {
                reject(voucher, REJECTION_REASONS.BENEFIT_CALC_ERROR);
                continue;
            }
            throw error;
        }

        // A campaign that resolves to a zero waiver is not selected -- offering "free delivery!"
        // that saves nothing is worse than offering nothing, and selecting it would burn a
        // redemption for no benefit. Deliberately asymmetric with the code-entered path, which DOES
        // redeem a zero waiver on a free-mode order -- there the shopper typed a code and is owed an
        // answer; here nobody asked.
        if (!(benefit.discountCentavos > 0)) {
            reject(voucher, REJECTION_REASONS.ZERO_WAIVER);
            continue;
        }

        eligible.push({ voucher, waiverCentavos: benefit.discountCentavos });
    }

    const sorted = [...eligible].sort(compareCandidates);
    const winner = sorted[0] ?? null;

    return {
        selected: winner ? winner.voucher : null,
        waiverCentavos: winner ? winner.waiverCentavos : 0,
        consideredCount: Array.isArray(candidates) ? candidates.length : 0,
        eligibleCount: eligible.length,
        rejections
    };
};
