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

export const VOUCHER_BENEFIT_CLASSES = Object.freeze(['percent_off', 'amount_off', 'fixed_price']);

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
    return {
        index,
        item_id: line?.item_id ?? null,
        quantity,
        baseUnitPriceCentavos,
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
    eligibleLines,
    eligibleSubtotalCentavos
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
            rawDiscountCentavos: Math.round((eligibleSubtotalCentavos * bps) / 10000),
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
            rawDiscountCentavos: Math.min(amount, eligibleSubtotalCentavos),
            intrinsicLineDiscounts: null
        };
    }

    // fixed_price. ADR 0066 decision 5: the delta is derived per line and clamped at zero, so a line
    // whose base price has fallen below the pinned price contributes nothing rather than a negative.
    if (fixedUnitPriceCentavos == null) {
        throw new VoucherBenefitError(
            'INVALID_FIXED_UNIT_PRICE_CENTAVOS',
            'fixed_price vouchers require fixed_unit_price_centavos',
            { fixed_unit_price_centavos: null }
        );
    }
    const pinned = toInteger(fixedUnitPriceCentavos);
    if (pinned < 0) {
        throw new VoucherBenefitError(
            'INVALID_FIXED_UNIT_PRICE_CENTAVOS',
            'fixed_unit_price_centavos cannot be negative',
            { fixed_unit_price_centavos: fixedUnitPriceCentavos }
        );
    }

    const intrinsicLineDiscounts = eligibleLines.map((line) => Math.round(
        line.quantity * Math.max(0, line.baseUnitPriceCentavos - pinned)
    ));

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
 *   eligibleSubtotalCentavos: number,
 *   eligibleQuantity: number,
 *   rawDiscountCentavos: number,
 *   discountCentavos: number,
 *   capApplied: boolean,
 *   lineAllocations: Array<Object>
 * }} `discountCentavos` is the authoritative order-level discount (post-cap, post-clamp).
 */
export const calculateVoucherBenefit = ({
    benefitClass,
    percentOffBps = null,
    amountOffCentavos = null,
    fixedUnitPriceCentavos = null,
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

    const normalizedLines = normalizeLines(lines);
    const eligibleLines = normalizedLines.filter((line) => line.eligible);
    const eligibleSubtotalCentavos = eligibleLines.reduce((sum, line) => sum + line.lineSubtotalCentavos, 0);
    const eligibleQuantity = roundQuantity(eligibleLines.reduce((sum, line) => sum + line.quantity, 0));

    const { rawDiscountCentavos, intrinsicLineDiscounts } = resolveRawDiscount({
        benefitClass,
        percentOffBps,
        amountOffCentavos,
        fixedUnitPriceCentavos,
        eligibleLines,
        eligibleSubtotalCentavos
    });

    const cap = maxDiscountCentavos == null ? Number.POSITIVE_INFINITY : toInteger(maxDiscountCentavos);
    const cappedDiscount = Math.min(rawDiscountCentavos, cap);
    const discountCentavos = Math.max(0, Math.min(cappedDiscount, eligibleSubtotalCentavos));
    const capApplied = discountCentavos < rawDiscountCentavos;

    const perLineDiscounts = normalizedLines.map(() => 0);

    if (benefitClass === 'fixed_price' && !capApplied) {
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
        return {
            item_id: line.item_id,
            quantity: line.quantity,
            baseUnitPriceCentavos: line.baseUnitPriceCentavos,
            // DISPLAY ONLY, never authoritative. ADR 0066 decision 1 forbids a voucher writing a unit
            // price anywhere, and decision 6 keeps the resolution seam at the order-level discount
            // slot -- which is exactly why `posDiscountCalculator.js` needs no change for any benefit
            // class. This field exists so a catalog card can render "₱8 with VOUCHER" without any
            // caller mistaking it for a price to persist.
            voucherUnitPriceCentavos: line.quantity > 0
                ? Math.round(((line.quantity * line.baseUnitPriceCentavos) - lineDiscountCentavos) / line.quantity)
                : line.baseUnitPriceCentavos,
            discountCentavos: lineDiscountCentavos
        };
    });

    return {
        benefitClass,
        eligibleSubtotalCentavos,
        eligibleQuantity,
        rawDiscountCentavos,
        discountCentavos,
        capApplied,
        lineAllocations
    };
};
