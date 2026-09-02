// #1332 (Phase 244, epic #1321 decision 9): the `free_delivery` -> `amount_off` translation,
// extracted out of voucherRedemptionUseCases.js so a second call site (the auto-apply selector,
// autoAppliedCampaignPolicy.js) never has to re-derive it. Two places independently agreeing on the
// "NULL means waive the whole fee" sentinel forever is a drift bug waiting to happen -- this module
// is the one source of truth for that translation.
//
// Zero imports, zero I/O, zero clock -- same purity discipline as `voucherBenefitPolicy.js` and
// `voucherEligibilityPolicy.js`. `free_delivery`'s semantics ("waive up to
// delivery_amount_off_centavos of the benefit base, or the whole base when null") are byte-for-byte
// `voucherBenefitPolicy.js`'s existing 'amount_off' math (`Math.min(amount, benefitBaseCentavos)`),
// so the translation is just "which amount_off_centavos value to pass" -- the math module itself
// gains no fourth benefit class.

// #1331: matches voucherValidator.js's own MAX_CENTAVOS -- comfortably above any real campaign
// budget and comfortably below Number.MAX_SAFE_INTEGER. Used only as the "waive the whole fee"
// sentinel below, never persisted.
export const WAIVE_WHOLE_FEE_SENTINEL_CENTAVOS = 999999999999;

/**
 * Resolve the `amount_off_centavos` value to feed `calculateVoucherBenefit` for a `free_delivery`
 * voucher. NULL/absent `delivery_amount_off_centavos` means "waive the whole fee" -- translated to
 * the sentinel so the existing `Math.min(amount, benefitBaseCentavos)` clamp in
 * `voucherBenefitPolicy.js` does the "whole fee" job with no new code path there.
 *
 * Only meaningful for a `free_delivery` voucher -- callers must not invoke this for any other
 * benefit class (there is no equivalent "waive the whole X" concept for percent_off/amount_off/
 * fixed_price on either axis).
 *
 * @param {{delivery_amount_off_centavos?: number|string|null}} voucher
 * @returns {number}
 */
export const resolveDeliveryAmountOffCentavos = (voucher) => (
    voucher?.delivery_amount_off_centavos != null
        ? Number(voucher.delivery_amount_off_centavos)
        : WAIVE_WHOLE_FEE_SENTINEL_CENTAVOS
);
