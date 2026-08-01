// Pure affiliate pricing calculation service (Phase 1 of the affiliate pricing rule engine - see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md).
//
// No I/O, no imports from the rest of the backend, and no framework dependency, so this module can
// be ported line-for-line into the frontend live-preview (frontend/src/features/pos/components/
// AffiliatesWorkspacePanel.jsx) without dragging backend-only code across the package boundary.
// Both sides are driven by the same fixture file (backend/tests/fixtures/affiliatePricingCases.json)
// so "the preview matches the final calculation" (external pack Test 16) is an enforced invariant,
// not a hope.
//
// Money is always integer centavos; rates are always basis points (ADR 0036 Decision 2, decision
// B5). The external spec pack's examples use decimal pesos - callers convert at the boundary
// (Math.round(pesos * 100)), this module never touches a float peso value.

export const AFFILIATE_SELLING_PRICE_RULE_TYPES = Object.freeze([
    'BASE_PRICE',
    'PERCENTAGE_MARKUP',
    'FIXED_MARKUP',
    'PERCENTAGE_DISCOUNT',
    'FIXED_DISCOUNT',
    'EXACT_AFFILIATE_PRICE'
]);

// FIXED_AMOUNT commission is intentionally excluded. Per decision B6 it is a configurable extension
// only - not demonstrated anywhere in the source recording, and redundant while commission is
// percentage-of-base. Add it to this list (and the switch in resolveCommissionForSubtotal below)
// if a tenant genuinely needs it later.
export const AFFILIATE_COMMISSION_RULE_TYPES = Object.freeze([
    'NONE',
    'PERCENTAGE_OF_BASE',
    'RESELLER_MARGIN'
]);

// CUSTOM_OR_UNRESOLVED from the external pack is dropped per decision A8 - a persisted
// "we haven't decided" value means unresolvable rows in a money table.
export const AFFILIATE_SETTLEMENT_POLICIES = Object.freeze([
    'MERCHANT_FUNDED',
    'COMMISSION_ADDED_TO_BUYER_PRICE',
    'RESELLER_MARGIN'
]);

export class AffiliatePricingError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'AffiliatePricingError';
        this.code = code;
        this.details = details;
    }
}

const toInt = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : 0;
};

const toNonNegativeInt = (value) => Math.max(0, toInt(value));

const toPositiveQuantity = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 1;
};

// Basis-point math, rounded to the nearest centavo - mirrors the existing convention in
// affiliateCommissionAccrual.js's roundBpsAmount so the two modules can never drift.
const roundBpsAmount = (baseCentavos, rateBps) => (
    Math.round((Number(baseCentavos) || 0) * (Number(rateBps) || 0) / 10000)
);

export const formatCentavosAsPesos = (centavos) => (Number(centavos) / 100).toFixed(2);

// --- Selling-price rule: what the buyer pays ---------------------------------------------------

export const resolveAffiliateUnitPriceCentavos = ({ basePriceCentavos, rule } = {}) => {
    const base = toNonNegativeInt(basePriceCentavos);
    const type = rule?.type;

    switch (type) {
        case 'BASE_PRICE':
            return base;
        case 'PERCENTAGE_MARKUP':
            return base + roundBpsAmount(base, rule?.rateBps);
        case 'FIXED_MARKUP':
            return base + toInt(rule?.amountCentavos);
        case 'PERCENTAGE_DISCOUNT':
            return base - roundBpsAmount(base, rule?.rateBps);
        case 'FIXED_DISCOUNT':
            return base - toInt(rule?.amountCentavos);
        case 'EXACT_AFFILIATE_PRICE':
            return toInt(rule?.amountCentavos);
        default:
            throw new AffiliatePricingError(
                'UNKNOWN_SELLING_PRICE_RULE_TYPE',
                `Unknown selling price rule type: ${type}`,
                { rule }
            );
    }
};

// --- Volume tier resolution: highest crossed threshold wins, never cumulative (decision A6) ----

export const resolveVolumeTierBonusBps = ({ currentQualifiedVolumeCentavos = 0, volumeTiers = [] } = {}) => {
    const volume = toNonNegativeInt(currentQualifiedVolumeCentavos);
    if (!Array.isArray(volumeTiers) || volumeTiers.length === 0) return 0;

    const crossed = volumeTiers
        .filter((tier) => volume >= toNonNegativeInt(tier?.minimumVolumeCentavos))
        .sort((a, b) => toNonNegativeInt(b.minimumVolumeCentavos) - toNonNegativeInt(a.minimumVolumeCentavos));

    if (crossed.length === 0) return 0;
    // Bonus is expressed in percentage points in config (matching the recording's "add 1 percentage
    // point"), translated to bps here so every rate in this module stays in the same unit.
    return toNonNegativeInt(crossed[0]?.bonusPercentagePoints) * 100;
};

// --- Full calculation -----------------------------------------------------------------------

// calculateAffiliateSale(...) -> CalculationBreakdown, per the contract in
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md (originally
// affiliate-pricing-spec/03-engineering-task.md). Object-parameter form rather than the pack's
// positional-argument pseudocode, matching this codebase's prevailing style.
export const calculateAffiliateSale = ({
    basePriceCentavos,
    quantity = 1,
    sellingPriceRule = { type: 'BASE_PRICE' },
    commissionRule = { type: 'NONE' },
    currentQualifiedVolumeCentavos = 0,
    volumeTiers = [],
    settlementPolicy = null
} = {}) => {
    const base = toNonNegativeInt(basePriceCentavos);
    const qty = toPositiveQuantity(quantity);

    const buyerUnitPriceCentavos = resolveAffiliateUnitPriceCentavos({ basePriceCentavos: base, rule: sellingPriceRule });
    if (buyerUnitPriceCentavos < 0) {
        throw new AffiliatePricingError(
            'NEGATIVE_BUYER_PRICE',
            'The resolved buyer price is negative.',
            { basePriceCentavos: base, sellingPriceRule }
        );
    }

    const baseSubtotalCentavos = Math.round(base * qty);
    const buyerTotalCentavos = Math.round(buyerUnitPriceCentavos * qty);
    const unitPriceAdjustmentCentavos = buyerUnitPriceCentavos - base;
    const priceAdjustmentCentavos = buyerTotalCentavos - baseSubtotalCentavos;

    const commissionType = commissionRule?.type;
    if (!AFFILIATE_COMMISSION_RULE_TYPES.includes(commissionType)) {
        throw new AffiliatePricingError(
            'UNKNOWN_COMMISSION_RULE_TYPE',
            `Unknown commission rule type: ${commissionType}`,
            { commissionRule }
        );
    }

    const baseCommissionRateBps = commissionType === 'PERCENTAGE_OF_BASE'
        ? toNonNegativeInt(commissionRule?.rateBps)
        : 0;
    const baseCommissionAmountCentavos = commissionType === 'PERCENTAGE_OF_BASE'
        ? roundBpsAmount(baseSubtotalCentavos, baseCommissionRateBps)
        : 0;

    // Reseller margin: the affiliate's earnings ARE the gap between what the buyer paid and the
    // merchant's base price - not an additional amount stacked on top of a percentage commission.
    const resellerMarginCentavos = commissionType === 'RESELLER_MARGIN'
        ? Math.max(0, buyerTotalCentavos - baseSubtotalCentavos)
        : 0;

    // Volume tier bonus only makes sense as an addition to a percentage-of-base rate - it has
    // nothing to add to for NONE or RESELLER_MARGIN.
    const tierBonusRateBps = commissionType === 'PERCENTAGE_OF_BASE'
        ? resolveVolumeTierBonusBps({ currentQualifiedVolumeCentavos, volumeTiers })
        : 0;
    const tierBonusAmountCentavos = tierBonusRateBps > 0
        ? roundBpsAmount(baseSubtotalCentavos, tierBonusRateBps)
        : 0;

    const totalCommissionRateBps = baseCommissionRateBps + tierBonusRateBps;
    const totalAffiliateEarningsCentavos = commissionType === 'RESELLER_MARGIN'
        ? resellerMarginCentavos
        : baseCommissionAmountCentavos + tierBonusAmountCentavos;

    // Settlement policy resolution. Per decision A2, merchant-funded is the default when a policy
    // isn't explicitly supplied - EXCEPT when a discount and a commission are both simultaneously
    // active, in which case who absorbs the gap is genuinely ambiguous and the engine must not
    // silently invent a merchant net (external pack 04-acceptance-tests.md Test 6 "Important" note;
    // decision A13, pricing fails closed rather than guessing).
    const hasPriceAdjustment = priceAdjustmentCentavos !== 0;
    const hasCommission = totalAffiliateEarningsCentavos !== 0;
    let resolvedSettlementPolicy = settlementPolicy;
    if (!resolvedSettlementPolicy) {
        if (hasPriceAdjustment && hasCommission && commissionType !== 'RESELLER_MARGIN') {
            throw new AffiliatePricingError(
                'UNRESOLVED_SETTLEMENT_POLICY',
                'A settlement policy is required when a buyer price adjustment and a commission are both active.',
                { priceAdjustmentCentavos, totalAffiliateEarningsCentavos }
            );
        }
        resolvedSettlementPolicy = commissionType === 'RESELLER_MARGIN' ? 'RESELLER_MARGIN' : 'MERCHANT_FUNDED';
    } else if (!AFFILIATE_SETTLEMENT_POLICIES.includes(resolvedSettlementPolicy)) {
        throw new AffiliatePricingError(
            'UNKNOWN_SETTLEMENT_POLICY',
            `Unknown settlement policy: ${resolvedSettlementPolicy}`,
            { settlementPolicy }
        );
    }

    // Uniform across all three settlement policies: whatever the buyer paid, minus whatever the
    // affiliate earned, is what the merchant is left with. Under RESELLER_MARGIN this reduces
    // algebraically to the merchant's own base price (merchantBaseAmountCentavos below), which is
    // exactly the external pack's "merchant_base_amount" field for that case.
    const merchantNetCentavos = buyerTotalCentavos - totalAffiliateEarningsCentavos;
    const merchantBaseAmountCentavos = baseSubtotalCentavos;

    return {
        basePriceCentavos: base,
        quantity: qty,
        buyerUnitPriceCentavos,
        buyerTotalCentavos,
        baseSubtotalCentavos,
        priceAdjustmentCentavos,
        unitPriceAdjustmentCentavos,
        resellerMarginCentavos,
        baseCommissionRateBps,
        baseCommissionAmountCentavos,
        tierBonusRateBps,
        tierBonusAmountCentavos,
        totalCommissionRateBps,
        totalAffiliateEarningsCentavos,
        merchantNetCentavos,
        merchantBaseAmountCentavos,
        settlementPolicy: resolvedSettlementPolicy,
        appliedRuleIds: {
            sellingPriceRuleId: sellingPriceRule?.id ?? null,
            commissionRuleId: commissionRule?.id ?? null
        },
        explanation: buildExplanation({
            sellingPriceRule,
            commissionRule,
            buyerUnitPriceCentavos,
            buyerTotalCentavos,
            totalAffiliateEarningsCentavos,
            totalCommissionRateBps,
            merchantNetCentavos,
            resolvedSettlementPolicy
        })
    };
};

const buildExplanation = ({
    sellingPriceRule,
    commissionRule,
    buyerUnitPriceCentavos,
    buyerTotalCentavos,
    totalAffiliateEarningsCentavos,
    totalCommissionRateBps,
    merchantNetCentavos,
    resolvedSettlementPolicy
}) => {
    const buyerPart = `Buyer pays PHP ${formatCentavosAsPesos(buyerTotalCentavos)} `
        + `(unit price PHP ${formatCentavosAsPesos(buyerUnitPriceCentavos)}, rule ${sellingPriceRule?.type || 'BASE_PRICE'}).`;
    const earningsPart = totalAffiliateEarningsCentavos > 0
        ? ` Affiliate earns PHP ${formatCentavosAsPesos(totalAffiliateEarningsCentavos)} `
            + `(${commissionRule?.type || 'NONE'}${totalCommissionRateBps > 0 ? `, ${(totalCommissionRateBps / 100).toFixed(2)}%` : ''}).`
        : ' Affiliate earns no commission on this sale.';
    const merchantPart = ` Merchant nets PHP ${formatCentavosAsPesos(merchantNetCentavos)} under ${resolvedSettlementPolicy}.`;
    return buyerPart + earningsPart + merchantPart;
};

// --- Rule validation -------------------------------------------------------------------------

// Config-time validation for a single selling-price rule. Returns a plain { valid, error_code }
// result rather than throwing, matching the external pack's acceptance-test shape directly and
// keeping this usable for live-preview validation in the frontend without try/catch plumbing.
export const validateAffiliatePriceRule = ({ rule, basePriceCentavos = null, costPerUnitCentavos = null } = {}) => {
    const type = rule?.type;
    if (!AFFILIATE_SELLING_PRICE_RULE_TYPES.includes(type)) {
        return { valid: false, error_code: 'UNKNOWN_SELLING_PRICE_RULE_TYPE' };
    }

    if (type === 'PERCENTAGE_DISCOUNT' && toNonNegativeInt(rule?.rateBps) > 10000) {
        return { valid: false, error_code: 'INVALID_DISCOUNT_PERCENTAGE' };
    }

    if (basePriceCentavos != null) {
        const base = toNonNegativeInt(basePriceCentavos);
        const resolvedUnitPrice = resolveAffiliateUnitPriceCentavos({ basePriceCentavos: base, rule });

        if (resolvedUnitPrice < 0) {
            return { valid: false, error_code: 'NEGATIVE_BUYER_PRICE' };
        }

        // Decision A9: refuse at config time a rule that would sell below the item's own cost.
        // Nothing today stops an owner from accidentally setting a discount so large the product
        // sells below what it cost them - this is the guard added for that.
        if (costPerUnitCentavos != null && resolvedUnitPrice < toNonNegativeInt(costPerUnitCentavos)) {
            return { valid: false, error_code: 'BELOW_COST_FLOOR' };
        }
    }

    return { valid: true, error_code: null };
};

// Config-time validation for a set of volume tiers - duplicate thresholds are rejected outright
// (external pack Test 14) since "the highest tier wins" is undefined when two tiers share a
// threshold.
export const validateVolumeTiers = (volumeTiers = []) => {
    if (!Array.isArray(volumeTiers)) return { valid: false, error_code: 'INVALID_VOLUME_TIERS' };

    const seen = new Set();
    for (const tier of volumeTiers) {
        const threshold = toNonNegativeInt(tier?.minimumVolumeCentavos);
        if (seen.has(threshold)) {
            return { valid: false, error_code: 'DUPLICATE_VOLUME_THRESHOLD' };
        }
        seen.add(threshold);
    }

    return { valid: true, error_code: null };
};

export default {
    AFFILIATE_SELLING_PRICE_RULE_TYPES,
    AFFILIATE_COMMISSION_RULE_TYPES,
    AFFILIATE_SETTLEMENT_POLICIES,
    AffiliatePricingError,
    formatCentavosAsPesos,
    resolveAffiliateUnitPriceCentavos,
    resolveVolumeTierBonusBps,
    calculateAffiliateSale,
    validateAffiliatePriceRule,
    validateVolumeTiers
};
