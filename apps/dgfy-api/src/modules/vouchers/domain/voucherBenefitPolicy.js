// Pure voucher benefit math. Zero imports by design, matching
// `modules/shared/utils/affiliatePricingPolicy.js` -- nothing here reaches a database, a clock, or a
// request, so every case is reproducible from a fixture file.
//
// Governed by ADR 0066 (docs/architecture/adr/0066-voucher-sale-time-price-resolution.md):
//   - Decision 1 `[binding]`: a voucher NEVER mutates a persisted unit price. `voucherUnitPriceCentavos`
//     below is a display value derived from the allocated discount, never something to write back to
//     `items.default_sale_price` or `pos_transaction_lines.sale_price`.
//   - Decision 2 `[binding]`: money is integer centavos, rates are basis points. No floats leave this
//     module.
//   - Decision 5 `[default]`: `fixed_price` is stored as intent (`fixed_unit_price_centavos`) and
//     rendered as a derived delta `Σ qty × max(0, base_unit − fixed_unit)`, clamped at zero when the
//     base price has fallen below the pinned price.
//
// #1326 / epic #1321 decision 9: the `benefit_target` axis ('items' | 'delivery'). `benefitTarget`
// defaults to 'items' at the JS level -- NOT a DB column default, there is no `benefit_target` column
// yet (#240) -- so every existing caller and every existing voucher resolves exactly as before, byte
// for byte, with no migration. Related: ADR 0078's note on ADR 0066 Decision 8.
//
// ADR 0066 Decision 1 `[binding]` ("a voucher NEVER mutates a persisted unit price") is preserved
// across this axis BY CONSTRUCTION, not by a guard, in both directions:
//   - Direction A (a delivery-targeted voucher can't touch a unit price): the only mutable per-line
//     money channel is the local `perLineDiscounts` array, written in exactly two places inside the
//     `benefitClass === 'fixed_price'` / else arms below. Putting `benefitTarget === 'delivery'` as
//     the FIRST arm of that if/else-if/else makes both write sites unreachable on the delivery path
//     via mutual exclusion, not a runtime check.
//   - Direction B (an items-targeted voucher can't reach the delivery fee): `deliveryFeeCentavos` has
//     EXACTLY ONE read site in this module -- the `benefitTarget === 'delivery'` arm of the
//     `benefitBaseCentavos` ternary below. It is never passed into `resolveRawDiscount`, never stored
//     on a line, never present on the 'items' path's return shape. A later refactor that hoists the
//     fee into `resolveRawDiscount` would silently destroy this invariant -- don't.
//   - Corollary: `fixed_price` is rejected outright for `benefitTarget: 'delivery'` (see the guard in
//     `calculateVoucherBenefit`) -- the one benefit class defined as a per-unit price pin can never be
//     aimed at a fee that has no units.
//
// Below-cost detection (#697) is deliberately benefit-class-agnostic: it compares the resolved,
// post-cap, post-clamp `voucherUnitPriceCentavos` against an optional per-line `costPerUnitCentavos`
// -- not `fixedUnitPriceCentavos` alone -- because a deep `percent_off` or `amount_off` can sell
// below cost exactly as easily as a mispriced `fixed_price` line. A line with no known cost
// (`costPerUnitCentavos == null`, matching `Item.cost_per_unit`'s `allowNull: true`) is skipped
// rather than treated as a violation. Returned on the result as `belowCostLines`, never thrown --
// this module has no opinion on fail-open vs fail-closed; that split is the caller's job (checkout
// fails closed, catalog display fails open, per ADR 0066 decision 3).

export const VOUCHER_BENEFIT_CLASSES = Object.freeze(['percent_off', 'amount_off', 'fixed_price']);

// #1326: the benefit-target axis. 'items' is the JS-level default (see calculateVoucherBenefit) --
// not a DB default, there is no `benefit_target` column yet.
export const VOUCHER_BENEFIT_TARGETS = Object.freeze(['items', 'delivery']);

export class VoucherBenefitError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'VoucherBenefitError';
        this.code = code;
        this.details = details;
    }
}

const toInteger = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : 0;
};

const toNonNegativeInteger = (value) => Math.max(0, toInteger(value));

// Quantities may be fractional (weighed goods), so they are the one number here that is not an
// integer. Rounded to 6 decimal places when summed so float dust never leaks into a response body.
const roundQuantity = (value) => Math.round((Number(value) || 0) * 1e6) / 1e6;

/**
 * Distribute an integer total across integer weights with no rounding loss.
 *
 * Largest-remainder (Hare quota) apportionment: floor every exact share, then hand the leftover
 * centavos out one at a time, largest fractional part first. Ties break on weight descending, then
 * original index ascending, so the result is deterministic for a given input rather than dependent on
 * sort stability.
 *
 * Invariant, asserted by the unit tests on every case: `sum(result) === max(0, round(totalCentavos))`
 * whenever at least one weight is positive.
 */
export const allocateByLargestRemainder = ({ totalCentavos, weights } = {}) => {
    const rawWeights = Array.isArray(weights) ? weights : [];
    const total = toNonNegativeInteger(totalCentavos);
    const normalizedWeights = rawWeights.map(toNonNegativeInteger);
    const out = normalizedWeights.map(() => 0);

    const positiveIndexes = [];
    normalizedWeights.forEach((weight, index) => {
        if (weight > 0) positiveIndexes.push(index);
    });

    if (total === 0 || positiveIndexes.length === 0) return out;

    const weightSum = positiveIndexes.reduce((sum, index) => sum + normalizedWeights[index], 0);
    const exactShares = new Map();

    positiveIndexes.forEach((index) => {
        const exact = (normalizedWeights[index] * total) / weightSum;
        exactShares.set(index, exact);
        out[index] = Math.floor(exact);
    });

    let remainder = total - positiveIndexes.reduce((sum, index) => sum + out[index], 0);

    const ordered = [...positiveIndexes].sort((a, b) => {
        const fractionA = exactShares.get(a) - out[a];
        const fractionB = exactShares.get(b) - out[b];
        if (fractionB !== fractionA) return fractionB - fractionA;
        if (normalizedWeights[b] !== normalizedWeights[a]) return normalizedWeights[b] - normalizedWeights[a];
        return a - b;
    });

    // Cycles rather than walking `ordered` once: floating-point error in `exactShares` can, in
    // principle, push the remainder to exactly `ordered.length`, and the sum invariant matters more
    // than handing any single line two extra centavos.
    let cursor = 0;
    while (remainder > 0) {
        out[ordered[cursor % ordered.length]] += 1;
        remainder -= 1;
        cursor += 1;
    }

    return out;
};

const normalizeLines = (lines) => (Array.isArray(lines) ? lines : []).map((line, index) => {
    const quantity = Math.max(0, Number(line?.quantity) || 0);
    const baseUnitPriceCentavos = toNonNegativeInteger(line?.baseUnitPriceCentavos);
    // Cost is optional -- `Item.cost_per_unit` is `allowNull: true`, and a line with no recorded
    // cost must not be treated as a violation (matching the affiliate guard's own null-skip).
    const costPerUnitCentavos = line?.costPerUnitCentavos == null ? null : toNonNegativeInteger(line.costPerUnitCentavos);
    return {
        index,
        line_ref: String(line?.line_ref || '').trim() || null,
        item_id: line?.item_id ?? null,
        quantity,
        baseUnitPriceCentavos,
        costPerUnitCentavos,
        // Eligibility is decided upstream (scope resolution); a line is eligible unless explicitly
        // marked otherwise, so a caller that does not scope at all gets whole-order behavior.
        eligible: line?.eligible !== false,
        lineSubtotalCentavos: Math.round(quantity * baseUnitPriceCentavos)
    };
});

const resolveRawDiscount = ({
    benefitClass,
    percentOffBps,
    amountOffCentavos,
    fixedUnitPriceCentavos,
    fixedUnitPriceByItemId,
    eligibleLines,
    // #1326: the shared benefit base -- the eligible item subtotal on the 'items' path, the delivery
    // fee on the 'delivery' path. Renamed from `eligibleSubtotalCentavos`; internal-only, this
    // function is not exported. See `calculateVoucherBenefit`'s `benefitBaseCentavos` local for how
    // this is chosen -- both the percent_off and amount_off clamps below must read the SAME base the
    // final order-level clamp uses, or a delivery voucher silently computes against the wrong number.
    benefitBaseCentavos
}) => {
    if (benefitClass === 'percent_off') {
        const bps = toInteger(percentOffBps);
        if (!(bps > 0) || bps > 10000) {
            throw new VoucherBenefitError(
                'INVALID_PERCENT_OFF_BPS',
                'percent_off vouchers require percent_off_bps between 1 and 10000',
                { percent_off_bps: percentOffBps ?? null }
            );
        }
        return {
            rawDiscountCentavos: Math.round((benefitBaseCentavos * bps) / 10000),
            intrinsicLineDiscounts: null
        };
    }

    if (benefitClass === 'amount_off') {
        const amount = toInteger(amountOffCentavos);
        if (!(amount > 0)) {
            throw new VoucherBenefitError(
                'INVALID_AMOUNT_OFF_CENTAVOS',
                'amount_off vouchers require a positive amount_off_centavos',
                { amount_off_centavos: amountOffCentavos ?? null }
            );
        }
        return {
            rawDiscountCentavos: Math.min(amount, benefitBaseCentavos),
            intrinsicLineDiscounts: null
        };
    }

    // fixed_price. ADR 0066 decision 5: the delta is derived per line and clamped at zero, so a line
    // whose base price has fallen below the pinned price contributes nothing rather than a negative.
    //
    // #696: a fixed_price voucher pins EITHER one price for every line (fixedUnitPriceCentavos) OR a
    // per-item price via a pricelist (fixedUnitPriceByItemId) -- never both; the caller enforces the
    // XOR, this module just resolves whichever arrived. A line with no entry in the map contributes
    // no discount rather than erroring: "not on this pricelist" is a legitimate, silent zero, not a
    // config error -- the map's keys are the eligible item set, so an eligible-but-unpriced line
    // should not normally occur, but a defensive zero is cheaper than a defensive throw here.
    if (fixedUnitPriceCentavos == null && !fixedUnitPriceByItemId) {
        throw new VoucherBenefitError(
            'INVALID_FIXED_UNIT_PRICE_CENTAVOS',
            'fixed_price vouchers require fixed_unit_price_centavos or a per-item pricelist',
            { fixed_unit_price_centavos: null }
        );
    }

    const resolvePinnedForLine = (line) => {
        if (!fixedUnitPriceByItemId) return toInteger(fixedUnitPriceCentavos);
        const hasEntry = Object.prototype.hasOwnProperty.call(fixedUnitPriceByItemId, line.item_id);
        return hasEntry ? toInteger(fixedUnitPriceByItemId[line.item_id]) : null;
    };

    // Validate every candidate pin up front rather than per-line during the map below, so a single
    // negative price anywhere in a pricelist fails the whole resolution with one clear error instead
    // of silently skipping just that line.
    const pinsToValidate = fixedUnitPriceByItemId
        ? Object.values(fixedUnitPriceByItemId)
        : [fixedUnitPriceCentavos];
    if (pinsToValidate.some((value) => toInteger(value) < 0)) {
        throw new VoucherBenefitError(
            'INVALID_FIXED_UNIT_PRICE_CENTAVOS',
            'fixed_unit_price_centavos cannot be negative',
            { fixed_unit_price_centavos: fixedUnitPriceCentavos, fixed_unit_price_by_item_id: fixedUnitPriceByItemId ?? null }
        );
    }

    const intrinsicLineDiscounts = eligibleLines.map((line) => {
        const pinned = resolvePinnedForLine(line);
        if (pinned == null) return 0;
        return Math.round(line.quantity * Math.max(0, line.baseUnitPriceCentavos - pinned));
    });

    return {
        rawDiscountCentavos: intrinsicLineDiscounts.reduce((sum, value) => sum + value, 0),
        intrinsicLineDiscounts
    };
};

/**
 * Resolve a voucher's benefit against a set of prepared lines.
 *
 * @returns {{
 *   benefitClass: string,
 *   benefitTarget: string,
 *   benefitBaseCentavos: number,
 *   eligibleSubtotalCentavos: number,
 *   eligibleQuantity: number,
 *   rawDiscountCentavos: number,
 *   discountCentavos: number,
 *   capApplied: boolean,
 *   lineAllocations: Array<Object>,
 *   belowCostLines: Array<{item_id: *, voucherUnitPriceCentavos: number, costPerUnitCentavos: number}>
 * }} `discountCentavos` is the authoritative order-level discount (post-cap, post-clamp).
 *   `belowCostLines` (#697) is non-throwing -- empty unless a line's resolved `voucherUnitPriceCentavos`
 *   undercuts its supplied `costPerUnitCentavos`. The caller decides whether that blocks (checkout,
 *   fail closed) or is ignored/logged (catalog display, fail open).
 *   `capApplied` (#1326): its meaning widens with `benefitTarget: 'delivery'` to also cover "the fee
 *   ceiling clamped it" (`benefitBaseCentavos`, not just `maxDiscountCentavos`) -- same field, not
 *   renamed, just a broader "something clamped the raw discount" reading.
 */
export const calculateVoucherBenefit = ({
    benefitClass,
    // #1326 / epic #1321 decision 9: the benefit-target axis. 'items' is the JS-level default, so
    // every existing caller and every existing voucher resolves exactly as before with no DDL and no
    // migration -- see this file's header, and ADR 0078's Related note on ADR 0066 Decision 8. #240's
    // migration story is a one-line change AT THE CALL SITE
    // (`benefitTarget: voucher.benefit_target ?? 'items'`), not a change to this default -- there is
    // no domain-level default to remove later.
    benefitTarget = 'items',
    // Only ever read on the 'delivery' arm below (see `benefitBaseCentavos`). An items-targeted
    // voucher structurally cannot reach this value -- ADR 0066 Decision 1, by construction, see the
    // file header. `null` and `0` are distinct: `0` is a legal base (a free-delivery tenant), `null`
    // means "no base supplied" and fails closed below.
    deliveryFeeCentavos = null,
    percentOffBps = null,
    amountOffCentavos = null,
    fixedUnitPriceCentavos = null,
    // #696: optional per-item fixed-price map, `{ [item_id]: unitPriceCentavos }`. Only meaningful
    // for benefitClass 'fixed_price'; mutually exclusive with fixedUnitPriceCentavos at the caller
    // level (voucherUseCases.js's applyBenefitConfig enforces the XOR, not here).
    fixedUnitPriceByItemId = null,
    maxDiscountCentavos = null,
    lines = []
} = {}) => {
    if (!VOUCHER_BENEFIT_CLASSES.includes(benefitClass)) {
        throw new VoucherBenefitError(
            'UNKNOWN_BENEFIT_CLASS',
            `Unknown voucher benefit class: ${benefitClass}`,
            { benefit_class: benefitClass ?? null }
        );
    }
    if (!VOUCHER_BENEFIT_TARGETS.includes(benefitTarget)) {
        throw new VoucherBenefitError(
            'UNKNOWN_BENEFIT_TARGET',
            `Unknown voucher benefit target: ${benefitTarget}`,
            { benefit_target: benefitTarget ?? null }
        );
    }
    if (benefitTarget === 'delivery' && benefitClass === 'fixed_price') {
        throw new VoucherBenefitError(
            'BENEFIT_TARGET_CLASS_UNSUPPORTED',
            'fixed_price is a per-line unit-price pin and has no delivery-fee analogue',
            { benefit_class: benefitClass, benefit_target: benefitTarget }
        );
    }
    if (benefitTarget === 'delivery' && deliveryFeeCentavos == null) {
        throw new VoucherBenefitError(
            'INVALID_DELIVERY_FEE_CENTAVOS',
            'delivery-targeted vouchers require a delivery_fee_centavos base',
            { delivery_fee_centavos: null }
        );
    }

    const normalizedLines = normalizeLines(lines);
    const eligibleLines = normalizedLines.filter((line) => line.eligible);
    const eligibleSubtotalCentavos = eligibleLines.reduce((sum, line) => sum + line.lineSubtotalCentavos, 0);
    const eligibleQuantity = roundQuantity(eligibleLines.reduce((sum, line) => sum + line.quantity, 0));

    // #1326: the benefit base. For 'items' this is byte-identically the eligible item subtotal --
    // every existing case computes the same numbers it did before. For 'delivery' the base becomes
    // the passed delivery fee and the item subtotal plays no part in the money math at all.
    const benefitBaseCentavos = benefitTarget === 'delivery'
        ? toNonNegativeInteger(deliveryFeeCentavos)
        : eligibleSubtotalCentavos;

    const { rawDiscountCentavos, intrinsicLineDiscounts } = resolveRawDiscount({
        benefitClass,
        percentOffBps,
        amountOffCentavos,
        fixedUnitPriceCentavos,
        fixedUnitPriceByItemId,
        eligibleLines,
        benefitBaseCentavos
    });

    const cap = maxDiscountCentavos == null ? Number.POSITIVE_INFINITY : toInteger(maxDiscountCentavos);
    const cappedDiscount = Math.min(rawDiscountCentavos, cap);
    const discountCentavos = Math.max(0, Math.min(cappedDiscount, benefitBaseCentavos));
    const capApplied = discountCentavos < rawDiscountCentavos;

    const perLineDiscounts = normalizedLines.map(() => 0);

    if (benefitTarget === 'delivery') {
        // #1326: a delivery-targeted benefit has no per-line component by construction. Deliberately
        // NOT an allocateByLargestRemainder call with zero weights -- there is nothing to apportion,
        // and leaving perLineDiscounts untouched is what makes ADR 0066 Decision 1 structural rather
        // than incidental (see this file's header note on Direction A).
    } else if (benefitClass === 'fixed_price' && !capApplied) {
        // Already exact -- the intrinsic per-line deltas sum to the discount, so re-allocating would
        // only introduce rounding noise.
        eligibleLines.forEach((line, position) => {
            perLineDiscounts[line.index] = intrinsicLineDiscounts[position];
        });
    } else {
        const allocationWeights = eligibleLines.map((line, position) => (
            benefitClass === 'fixed_price'
                ? intrinsicLineDiscounts[position]
                : line.lineSubtotalCentavos
        ));
        const allocated = allocateByLargestRemainder({
            totalCentavos: discountCentavos,
            weights: allocationWeights
        });
        eligibleLines.forEach((line, position) => {
            perLineDiscounts[line.index] = allocated[position];
        });
    }

    const lineAllocations = normalizedLines.map((line) => {
        const lineDiscountCentavos = perLineDiscounts[line.index];
        const voucherUnitPriceCentavos = line.quantity > 0
            ? Math.round(((line.quantity * line.baseUnitPriceCentavos) - lineDiscountCentavos) / line.quantity)
            : line.baseUnitPriceCentavos;
        return {
            line_ref: line.line_ref,
            item_id: line.item_id,
            quantity: line.quantity,
            baseUnitPriceCentavos: line.baseUnitPriceCentavos,
            // DISPLAY ONLY, never authoritative. ADR 0066 decision 1 forbids a voucher writing a unit
            // price anywhere, and decision 6 keeps the resolution seam at the order-level discount
            // slot -- which is exactly why `posDiscountCalculator.js` needs no change for any benefit
            // class. This field exists so a catalog card can render "₱8 with VOUCHER" without any
            // caller mistaking it for a price to persist. It also doubles as the below-cost
            // comparison point (#697) -- see `belowCostLines` below.
            voucherUnitPriceCentavos,
            discountCentavos: lineDiscountCentavos,
            // Carried through from the normalized input line rather than recomputed, so a caller
            // building a fiscal audit-row allocation (#667 Phase 110) can tell which lines this
            // voucher actually priced without re-deriving eligibility or re-multiplying qty*price.
            // Additive -- no existing caller destructures this object exhaustively.
            eligible: line.eligible,
            lineSubtotalCentavos: line.lineSubtotalCentavos
        };
    });

    // #697: benefit-class-agnostic below-cost detection, computed against the same resolved
    // `voucherUnitPriceCentavos` every `lineAllocations` entry already carries, so a deep
    // `percent_off`/`amount_off` is caught exactly like a mispriced `fixed_price`. Only lines with a
    // known, eligible, discounted price participate -- an ineligible line was never priced by this
    // voucher, and a line with no discount can't have gone below cost as a result of this voucher.
    const belowCostLines = eligibleLines
        .filter((line) => line.costPerUnitCentavos != null && perLineDiscounts[line.index] > 0)
        .map((line) => ({
            item_id: line.item_id,
            voucherUnitPriceCentavos: lineAllocations[line.index].voucherUnitPriceCentavos,
            costPerUnitCentavos: line.costPerUnitCentavos
        }))
        .filter((entry) => entry.voucherUnitPriceCentavos < entry.costPerUnitCentavos);

    return {
        benefitClass,
        // #1326: additive -- verified no existing caller destructures this object exhaustively. #240's
        // ledger writer needs to tell an items redemption from a delivery one without re-deriving it.
        benefitTarget,
        benefitBaseCentavos,
        eligibleSubtotalCentavos,
        eligibleQuantity,
        rawDiscountCentavos,
        discountCentavos,
        capApplied,
        lineAllocations,
        belowCostLines
    };
};
