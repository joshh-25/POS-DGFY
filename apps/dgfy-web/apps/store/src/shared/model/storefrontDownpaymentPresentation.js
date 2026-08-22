// Phase 142 (#823): pure presentation helpers for the downpayment checkout flow -- a store with
// payment_mode='downpayment_required' shows a downpayment/balance split everywhere a total would
// normally render (summary, payment step, pending-payment panel, confirmation, tracking). This
// module is the single place that normalizes the three different sources that can carry the split
// at different points in the flow, so every surface reads the same shape instead of re-deriving
// it from whichever response happens to be in scope.
//
// No React here -- shared/ never imports modes/, and this file is imported by mode-specific
// components, so it stays framework-free and independently testable.

/** A store whose payment_mode (catalog response, Phase 142) requires an online downpayment. */
export const isDownpaymentRequiredStore = (selectedStore) => (
  selectedStore?.payment_mode === 'downpayment_required'
);

// Mirrors buildAccessPolicyStorePatch/buildWorkflowCapabilityStorePatch's own convention
// (useStoreCatalogLoader.js) -- a pure patch builder the hook spreads onto selectedStore, kept
// outside the hook so it's directly unit-testable without rendering the whole catalog-load
// machinery. Unlike those two, this is unconditional: payment_mode is always present on the
// catalog response (fail-closed default 'full_payment'), so the patch always applies -- a store
// object that never receives it should not silently leave payment_mode undefined.
export const buildPaymentModeStorePatch = (catalogData = null) => ({
  payment_mode: catalogData?.payment_mode === 'downpayment_required' ? 'downpayment_required' : 'full_payment'
});

// Balance is always collected in person -- ADR 0069 clause 2 [binding], carried forward by ADR
// 0070 -- so the only wording choice is delivery vs. in-person collection at pickup/dine-in.
export const resolveDownpaymentBalanceLabel = (orderMethod) => (
  orderMethod === 'delivery' ? 'Balance due on delivery' : 'Balance due at pickup'
);

const NULL_DISPLAY = Object.freeze({
  active: false,
  downpaymentAmount: null,
  balanceDueAmount: null,
  orderTotalAmount: null,
  refundable: null
});

/**
 * Normalizes whichever of the three downpayment-carrying sources is available into one shape.
 * Precedence: order (post-purchase, most authoritative) > paymentSession (mid-payment, widened
 * serializePaymentSession fields) > quoteResult (pre-payment preview, the checkout quote's own
 * downpayment_amount/balance_due_amount/downpayment_refundable). Only the highest-precedence
 * source that actually carries an active downpayment is used -- sources are not merged.
 */
export const resolveDownpaymentDisplay = ({ order = null, paymentSession = null, quoteResult = null } = {}) => {
  // Presence, not just "is this source active", decides precedence -- once an order or a payment
  // session exists, it is the ground truth for whether a downpayment is in play, even if it says
  // "no" (capture_kind='full' / payment_status!='partially_paid'). Falling through to a
  // lower-precedence source in that case would let a stale quote (still carrying a
  // downpayment_required preview from before the session/order settled otherwise) override a
  // concrete, later fact.
  if (order) {
    if (order.payment_status === 'partially_paid' && order.amount_paid != null) {
      const balanceDueAmount = order.balance_due ?? null;
      const orderTotalAmount = order.total_amount != null
        ? order.total_amount
        : (order.amount_paid != null && balanceDueAmount != null ? order.amount_paid + balanceDueAmount : null);
      return {
        active: true,
        downpaymentAmount: order.amount_paid,
        balanceDueAmount,
        orderTotalAmount,
        refundable: order.downpayment_refundable ?? null
      };
    }
    return NULL_DISPLAY;
  }

  if (paymentSession) {
    if (paymentSession.capture_kind === 'downpayment') {
      return {
        active: true,
        // total_amount keeps its pre-existing meaning on a session: the CAPTURED amount.
        downpaymentAmount: paymentSession.total_amount ?? null,
        balanceDueAmount: paymentSession.balance_due_amount ?? null,
        orderTotalAmount: paymentSession.order_total_amount ?? null,
        refundable: paymentSession.downpayment_refundable ?? null
      };
    }
    return NULL_DISPLAY;
  }

  if (quoteResult && quoteResult.payment_mode === 'downpayment_required') {
    return {
      active: true,
      downpaymentAmount: quoteResult.downpayment_amount ?? null,
      balanceDueAmount: quoteResult.balance_due_amount ?? null,
      orderTotalAmount: quoteResult.total_amount ?? null,
      refundable: quoteResult.downpayment_refundable ?? null
    };
  }

  return NULL_DISPLAY;
};

/** Two OrderSummaryCard-shaped rows ({label, value, emphasis?}), or [] when inactive. */
export const buildDownpaymentTotalsRows = ({ display, money, orderMethod }) => {
  if (!display?.active || typeof money !== 'function') return [];
  return [
    { label: 'Downpayment due now', value: money(display.downpaymentAmount), emphasis: true },
    { label: resolveDownpaymentBalanceLabel(orderMethod), value: money(display.balanceDueAmount) }
  ];
};

// Phase 143 (#824): legal copy for the non-refundable case is BLOCKED on #280 (T&C lawyer
// review still open) -- this is a deliberately neutral placeholder, not reviewed legal language.
// When #824 ships, replace ONLY this string; keep the seam (the `refundable === false` gate, and
// every call site that renders this note) exactly as-is.
const NON_REFUNDABLE_DOWNPAYMENT_NOTE = 'The downpayment reserves your order. Refund terms are provided by the store.';

/** A neutral disclosure line, only when the downpayment is explicitly non-refundable. */
export const buildDownpaymentRefundableNote = (refundable) => (
  refundable === false ? NON_REFUNDABLE_DOWNPAYMENT_NOTE : null
);
