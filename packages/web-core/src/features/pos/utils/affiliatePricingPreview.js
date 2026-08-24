// Frontend mirror of backend/src/modules/shared/utils/affiliatePricingPolicy.js, for the live
// preview in AffiliatesWorkspacePanel.jsx (Phase 1 of the affiliate pricing rule engine - see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md).
//
// Ported rather than cross-imported: frontend/ and backend/ are separate npm workspaces with
// separate build systems (Vite vs Node), so importing across the package boundary is not viable.
// Kept deliberately in lockstep with the backend module - both are driven by the same acceptance
// fixtures (see affiliatePricingPreview.test.js, which asserts the copied fixture file is
// byte-identical to the backend's original), which is what actually proves "the mobile preview
// matches the final calculation" (external spec pack Test 16) rather than just asserting it in
// prose. Volume tiers are intentionally omitted here - Phase 1 doesn't expose tier configuration in
// this panel, so the preview only needs the selling-price and commission math.
//
// Money is always integer centavos; rates are always basis points (ADR 0036 Decision 2, decision
// B5) - identical convention to the backend module.

export const AFFILIATE_SELLING_PRICE_RULE_TYPES = Object.freeze([
    'BASE_PRICE',
    'PERCENTAGE_MARKUP',
    'FIXED_MARKUP',
    'PERCENTAGE_DISCOUNT',
    'FIXED_DISCOUNT',
    'EXACT_AFFILIATE_PRICE'
]);

export const AFFILIATE_COMMISSION_RULE_TYPES = Object.freeze([
    'NONE',
    'PERCENTAGE_OF_BASE',
    'RESELLER_MARGIN'
]);

export const AFFILIATE_SETTLEMENT_POLICIES = Object.freeze([
    'MERCHANT_FUNDED',
    'COMMISSION_ADDED_TO_BUYER_PRICE',
    'RESELLER_MARGIN'
]);

export class AffiliatePricingError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'AffiliatePricingError';
        this.code = code;
    }
}

const toInt = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : 0;
};

const toNonNegativeInt = (value) => Math.max(0, toInt(value));

const roundBpsAmount = (baseCentavos, rateBps) => (
    Math.round((Number(baseCentavos) || 0) * (Number(rateBps) || 0) / 10000)
);

export const formatCentavosAsPesos = (centavos) => (Number(centavos) / 100).toFixed(2);

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
            throw new AffiliatePricingError('UNKNOWN_SELLING_PRICE_RULE_TYPE', `Unknown selling price rule type: ${type}`);
    }
};

// calculateAffiliateSale, without volume tiers (see file header). Same field names as the backend
// module wherever the two overlap, so a caller migrating a payload between them needs no mapping.
export const calculateAffiliateSale = ({
    basePriceCentavos,
    quantity = 1,
    sellingPriceRule = { type: 'BASE_PRICE' },
    commissionRule = { type: 'NONE' },
    settlementPolicy = null
} = {}) => {
    const base = toNonNegativeInt(basePriceCentavos);
    const qty = Number(quantity) > 0 ? Number(quantity) : 1;

    const buyerUnitPriceCentavos = resolveAffiliateUnitPriceCentavos({ basePriceCentavos: base, rule: sellingPriceRule });
    if (buyerUnitPriceCentavos < 0) {
        throw new AffiliatePricingError('NEGATIVE_BUYER_PRICE', 'The resolved buyer price is negative.');
    }

    const baseSubtotalCentavos = Math.round(base * qty);
    const buyerTotalCentavos = Math.round(buyerUnitPriceCentavos * qty);
    const priceAdjustmentCentavos = buyerTotalCentavos - baseSubtotalCentavos;

    const commissionType = commissionRule?.type;
    if (!AFFILIATE_COMMISSION_RULE_TYPES.includes(commissionType)) {
        throw new AffiliatePricingError('UNKNOWN_COMMISSION_RULE_TYPE', `Unknown commission rule type: ${commissionType}`);
    }

    const baseCommissionRateBps = commissionType === 'PERCENTAGE_OF_BASE' ? toNonNegativeInt(commissionRule?.rateBps) : 0;
    const baseCommissionAmountCentavos = commissionType === 'PERCENTAGE_OF_BASE'
        ? roundBpsAmount(baseSubtotalCentavos, baseCommissionRateBps)
        : 0;
    const resellerMarginCentavos = commissionType === 'RESELLER_MARGIN'
        ? Math.max(0, buyerTotalCentavos - baseSubtotalCentavos)
        : 0;
    const totalAffiliateEarningsCentavos = commissionType === 'RESELLER_MARGIN'
        ? resellerMarginCentavos
        : baseCommissionAmountCentavos;

    const hasPriceAdjustment = priceAdjustmentCentavos !== 0;
    const hasCommission = totalAffiliateEarningsCentavos !== 0;
    let resolvedSettlementPolicy = settlementPolicy;
    if (!resolvedSettlementPolicy) {
        if (hasPriceAdjustment && hasCommission && commissionType !== 'RESELLER_MARGIN') {
            throw new AffiliatePricingError(
                'UNRESOLVED_SETTLEMENT_POLICY',
                'A settlement policy is required when a buyer price adjustment and a commission are both active.'
            );
        }
        resolvedSettlementPolicy = commissionType === 'RESELLER_MARGIN' ? 'RESELLER_MARGIN' : 'MERCHANT_FUNDED';
    }

    const merchantNetCentavos = buyerTotalCentavos - totalAffiliateEarningsCentavos;
    const merchantBaseAmountCentavos = baseSubtotalCentavos;

    return {
        basePriceCentavos: base,
        quantity: qty,
        buyerUnitPriceCentavos,
        buyerTotalCentavos,
        baseSubtotalCentavos,
        priceAdjustmentCentavos,
        resellerMarginCentavos,
        baseCommissionRateBps,
        baseCommissionAmountCentavos,
        totalAffiliateEarningsCentavos,
        merchantNetCentavos,
        merchantBaseAmountCentavos,
        settlementPolicy: resolvedSettlementPolicy
    };
};

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
        if (costPerUnitCentavos != null && resolvedUnitPrice < toNonNegativeInt(costPerUnitCentavos)) {
            return { valid: false, error_code: 'BELOW_COST_FLOOR' };
        }
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
    calculateAffiliateSale,
    validateAffiliatePriceRule
};
