// Phase 140 (#821, ADR 0069/0070). Pure math, no I/O -- resolves what a single order's downpayment
// split should be, given a tenant's downpayment settings and the order's already-discounted total.
// Deliberately mirrors the sibling policy modules in this directory (affiliatePricingPolicy.js,
// voucherBenefitPolicy.js, paymentTimingPolicy.js): one exported function, fully unit-testable
// standalone, no dependency on dbStore/Sequelize/the request lifecycle.
//
// Rounding convention: `Math.round(baseCentavos * rateBps / 10000)`, identical to
// affiliateCommissionAccrual.js's roundBpsAmount and affiliatePricingPolicy.js's own copy of it (both
// carry a comment pinning them to the same expression so the two can never drift) -- this module adds
// a third, not a fourth, convention.

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const toCentavos = (value) => Math.round(round4(value) * 100);
// The one conversion boundary named by ADR 0066 decision 2, same as storeUseCases.js's own
// centavosToPeso -- this module never returns a raw float peso value computed outside toCentavos/here.
const centavosToPeso = (value) => round4(Number(value || 0) / 100);

const FULL_PAYMENT_RESULT = Object.freeze({
    payment_mode: 'full_payment',
    downpayment_amount: null,
    balance_due_amount: null,
    downpayment_refundable: null
});

/**
 * @param {object} params
 * @param {object} params.settings - a downpaymentSettingsRepository.getSettings() result (or its
 *   DEFAULT_SETTINGS shape) -- never null, per that repository's own contract.
 * @param {number} params.totalAmount - the order's total in pesos, AFTER promo/voucher discounts.
 * @param {string} [params.paymentElection] - Phase 150 (#866): the customer's checkout-time choice,
 *   'full' | 'downpayment'. Only consulted when settings.payment_mode is 'customer_choice';
 *   ignored for 'full_payment' (always full) and 'downpayment_required' (always split -- the
 *   merchant, not the customer, decided). Defaults to 'full' when absent -- under-collecting is
 *   the dangerous direction for a merchant expecting a downpayment, so an unresolved/omitted
 *   election fails toward the safer, unambiguous shape rather than guessing a split.
 * @returns {{payment_mode: string, downpayment_amount: number|null, balance_due_amount: number|null,
 *   downpayment_refundable: boolean|null}} payment_mode here is always 'full_payment' or
 *   'downpayment_required' -- this function never returns 'customer_choice'; that value only ever
 *   describes a tenant's settings, never a resolved order.
 */
export const resolveDownpaymentForTotal = ({ settings, totalAmount, paymentElection }) => {
    if (!settings) return FULL_PAYMENT_RESULT;

    const requiresSplit = settings.payment_mode === 'downpayment_required'
        || (settings.payment_mode === 'customer_choice' && paymentElection === 'downpayment');
    if (!requiresSplit) {
        return FULL_PAYMENT_RESULT;
    }

    const totalCentavos = toCentavos(totalAmount);
    if (totalCentavos <= 0) {
        // A zero/negative total has no downpayment to take -- fail toward the simpler, unambiguous
        // shape rather than emitting a downpayment against nothing.
        return FULL_PAYMENT_RESULT;
    }

    const { downpayment_type: type, downpayment_rate_bps: rateBps, downpayment_fixed_centavos: fixedCentavos } = settings;

    let rawCentavos;
    if (type === 'percentage' && Number.isInteger(rateBps) && rateBps > 0) {
        rawCentavos = Math.round((totalCentavos * rateBps) / 10000);
    } else if (type === 'fixed' && Number.isInteger(fixedCentavos) && fixedCentavos > 0) {
        rawCentavos = fixedCentavos;
    } else {
        // A malformed/incomplete effective row (missing type, or a type with no matching amount)
        // must not produce a guessed figure -- fail closed to full_payment rather than invent one.
        // downpaymentSettingsUseCases.js's own write-time validation should make this unreachable in
        // practice, but this module does not trust that as its only guard.
        return FULL_PAYMENT_RESULT;
    }

    // Phase 150 (#865/#866) RF-5: the minimum only ever meant "protect a percentage-mode online
    // capture from being too small to be worth the payment-gateway fee" -- it was never a floor on
    // a fixed amount the merchant chose deliberately. downpaymentSettingsUseCases.js's write-time
    // rule now requires (and downpaymentSettingsForm.js/DownpaymentSettingsPanel.jsx now render) the
    // minimum only for type === 'percentage'; this resolution-time floor must match that, or a
    // tenant still carrying a stale min > fixed from before this change keeps silently overriding
    // its own fixed amount with a value the panel no longer even shows.
    const minCentavos = type === 'percentage'
        && Number.isInteger(settings.min_downpayment_centavos) && settings.min_downpayment_centavos > 0
        ? settings.min_downpayment_centavos
        : 0;
    const flooredCentavos = Math.max(rawCentavos, minCentavos);

    // Clamp to the total: never authorize more than the order is worth, never emit a negative
    // balance. payment_mode still reports downpayment_required -- the merchant's configuration is
    // unchanged, only this particular order's split collapsed to "pay it all now".
    const downpaymentCentavos = Math.min(flooredCentavos, totalCentavos);
    const balanceCentavos = totalCentavos - downpaymentCentavos;

    return {
        payment_mode: 'downpayment_required',
        downpayment_amount: centavosToPeso(downpaymentCentavos),
        balance_due_amount: centavosToPeso(balanceCentavos),
        downpayment_refundable: settings.downpayment_refundable !== false
    };
};
