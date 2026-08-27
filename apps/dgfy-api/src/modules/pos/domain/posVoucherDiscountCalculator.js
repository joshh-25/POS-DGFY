// #712: a voucher's per-line discounts are ALREADY authoritative -- computed once by
// `calculateVoucherBenefit` (modules/vouchers/domain/voucherBenefitPolicy.js) inside
// `redeemVoucherUseCase`/`previewVoucherEligibilityUseCase`, including the exact per-line delta a
// `fixed_price` voucher needs (ADR 0066 decision 5) and the below-cost/cap clamping already applied.
//
// `calculatePosDiscount` (./posDiscountCalculator.js) is a DIFFERENT thing: a generic redistributor
// that takes a single rate/amount and proportionally splits it across eligible lines by each line's
// share of the base amount. Feeding a voucher's aggregate discount through that generic splitter
// would silently diverge from the voucher's own per-line math -- most obviously for `fixed_price`,
// where the correct discount is `qty * max(0, base_unit - fixed_unit)` per item, not a proportional
// share of one total. A voucher must never be run through `calculatePosDiscount`; this module builds
// the same RETURN SHAPE directly from the voucher's own `lineAllocations` instead.
//
// VAT: `vat_removed`/`vat_exempt_amount` are only ever nonzero for STATUTORY (senior/pwd) discounts
// in `calculatePosDiscount` -- confirmed by reading it in full. A voucher is never statutory, so both
// stay zero here too; output VAT derives from the discounted subtotal elsewhere, matching ADR 0066
// Consequences item 1 ("VAT moves with the voucher discount", same mechanism as promo).

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const centavosToPeso = (value) => round4(Number(value || 0) / 100);

// `lines`: the same array posUseCases.js already builds for the `calculatePosDiscount` call site --
// prepared checkout lines carrying `item_id`, `quantity`, and `global_discount_base_amount`.
// `voucher`: the applied redemption/preview result returned by `redeemVoucher` (posDiscountPolicy.js),
// i.e. `redeemVoucherUseCase`/`previewVoucherEligibilityUseCase`'s own return shape -- specifically
// `voucher.lineAllocations`, the UNFILTERED, `item_id`-keyed array from `calculateVoucherBenefit`
// (camelCase fields: `item_id`, `quantity`, `discountCentavos`, `eligible`), and
// `voucher.discountCentavos`, the ledger-authoritative aggregate.
export const buildVoucherGovernedCalculation = ({ lines = [], voucher }) => {
    const allocations = Array.isArray(voucher?.lineAllocations) ? voucher.lineAllocations : [];
    const allocationByLineRef = new Map(allocations
        .map((allocation) => [String(allocation?.line_ref || '').trim(), allocation])
        .filter(([lineRef]) => lineRef));
    const legacyAllocations = allocations.filter((allocation) => !String(allocation?.line_ref || '').trim());
    const legacyAllocationsByItemId = new Map();
    legacyAllocations.forEach((allocation) => {
        const itemId = Number(allocation?.item_id);
        legacyAllocationsByItemId.set(itemId, [...(legacyAllocationsByItemId.get(itemId) || []), allocation]);
    });
    const normalizedLines = lines.map((line) => ({
        ...line,
        quantity: Math.max(0, Number(line.quantity) || 0),
        global_discount_base_amount: Math.max(0, Number(line.global_discount_base_amount) || 0)
    }));
    const subtotalAmount = round4(normalizedLines.reduce((sum, line) => sum + line.global_discount_base_amount, 0));

    const calculatedLines = normalizedLines.map((line) => {
        const lineRef = String(line?.line_ref || '').trim();
        const allocation = (lineRef && allocationByLineRef.get(lineRef))
            || legacyAllocationsByItemId.get(Number(line.item_id))?.shift()
            || null;
        const allocationMatchesLine = allocation && Number(allocation.item_id) === Number(line.item_id);
        const isEligible = Boolean(allocationMatchesLine && allocation.eligible);
        const eligibleQuantity = isEligible ? Math.max(0, Number(allocation.quantity) || 0) : 0;
        const globalUnitPrice = line.quantity > 0 ? line.global_discount_base_amount / line.quantity : 0;
        const grossEligibleAmount = round4(eligibleQuantity * globalUnitPrice);
        // The voucher's own centavos-precision discount is the source of truth for this line --
        // never recomputed from a rate here, unlike calculatePosDiscount's percentage/fixed paths.
        const discountAmount = isEligible ? centavosToPeso(allocation.discountCentavos || 0) : 0;
        return {
            ...line,
            eligible_quantity: eligibleQuantity,
            gross_eligible_amount: grossEligibleAmount,
            vat_removed: 0,
            vat_exempt_amount: 0,
            discount_amount: discountAmount,
            eligibility_override_reason: null,
            final_line_amount: round4(line.global_discount_base_amount - discountAmount)
        };
    });

    const discountAmount = round4(calculatedLines.reduce((sum, line) => sum + line.discount_amount, 0));
    const eligibleAmount = round4(calculatedLines.reduce((sum, line) => sum + line.gross_eligible_amount, 0));

    return {
        type: 'voucher',
        method: voucher?.benefitClass === 'percent_off' ? 'percentage' : 'fixed',
        rate: voucher?.benefitClass === 'percent_off'
            ? round4(Number(voucher.percentOffBps || 0) / 100)
            : null,
        subtotal_amount: subtotalAmount,
        eligible_amount: eligibleAmount,
        vat_removed: 0,
        vat_exempt_amount: 0,
        discount_amount: discountAmount,
        total_amount: round4(subtotalAmount - discountAmount),
        lines: calculatedLines
    };
};

export default buildVoucherGovernedCalculation;
