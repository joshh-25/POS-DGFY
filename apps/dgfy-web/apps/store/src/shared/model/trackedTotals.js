// RF-1 (PR #753 review): the client's pre-submission totalsForDisplay is what SimpleCheckoutSuccessStep.jsx/
// FnbCheckoutConfirmation.jsx and the downloadable receipt image actually read via
// checkoutResult.totals -- it must be overlaid with the server-persisted order's own fields once
// checkout returns, not left as the client's pre-submission guess.
//
// Phase 142 (#823): widened to also carry amount_paid/balance_due through -- previously only
// total_amount was overlaid, silently discarding the two fields a downpayment order's
// confirmation screen needs (SimpleCheckoutSuccessStep.jsx/FnbCheckoutConfirmation.jsx read them
// via resolveDownpaymentDisplay({ order: checkoutResult?.order }), not via .totals, but this
// object is also what a future consumer of checkoutResult.totals would reach for -- keeping it
// complete rather than silently dropping fields the order actually has is the point of this fix).
// Previously duplicated verbatim in shared/hooks/useCheckoutSubmission.js and
// modes/fnb/checkout/hooks/useFnbCheckoutSubmission.js; extracted here so both share one
// implementation.
export const resolveTrackedTotals = (order, fallbackTotals) => {
  const serverTotal = Number(order?.total_amount);
  return {
    ...fallbackTotals,
    ...(Number.isFinite(serverTotal) ? { total_amount: serverTotal } : {}),
    amount_paid: order?.amount_paid ?? null,
    balance_due: order?.balance_due ?? null
  };
};
