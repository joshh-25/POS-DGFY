// #746: the single decision for "what total does the cart drawer show, and does it show a discount
// row." All three drawers (default/retail, simple, F&B) call this instead of each keeping their own
// copy of the arithmetic -- the previous three-way duplication is how one wrong gate became three
// wrong gates in a single commit.
//
// Two failure modes are being balanced here, and the balance matters:
//
//  1. HIDING a real discount (#746, twice now). The shopper applied a code, the server confirmed a
//     discount, and the cart shows full price. This is the bug being fixed -- so a merely *stale*
//     discount is still SHOWN, flagged via `isStale` so the surface can say it's updating. An
//     auto re-quote is already in flight by then (see StorefrontApp.jsx's quote-sync effect); going
//     blank in that window is what produced the original report.
//
//  2. Showing a CONFIDENT WRONG total -- specifically ₱0 on a non-empty cart, which is what a naive
//     `Math.max(0, total - discount)` produces once a stale discount outgrows a shrunken cart. This
//     was the legitimate half of PR #753's RF-2 review finding and it must survive this fix. A
//     discount that exceeds the cart it applies to is not a free order, it is a number that no
//     longer means anything -- suppress it rather than render ₱0 for a cashier to read out loud.
export const resolveCartDiscountDisplay = ({
  cartTotal,
  voucherDiscountAmount = 0,
  promoDiscountAmount = 0,
  isQuoteStale = false
} = {}) => {
  const total = Number.isFinite(Number(cartTotal)) ? Number(cartTotal) : 0;
  const voucher = Math.max(0, Number(voucherDiscountAmount) || 0);
  const promo = Math.max(0, Number(promoDiscountAmount) || 0);
  const combined = voucher + promo;

  // Failure mode 2. Note `>` not `>=`: a discount exactly equal to the cart is a legitimate 100%-off
  // voucher, and ₱0 is the correct total for it.
  const exceedsCart = combined > total;
  const showDiscounts = combined > 0 && !exceedsCart;

  return {
    hasVoucherDiscount: showDiscounts && voucher > 0,
    hasPromoDiscount: showDiscounts && promo > 0,
    displayTotal: showDiscounts ? Math.max(0, total - combined) : total,
    // Advisory only -- never suppresses the discount by itself (failure mode 1). Surfaces use it to
    // mark the figure as refreshing rather than to hide it.
    isStale: Boolean(isQuoteStale) && showDiscounts
  };
};

export default { resolveCartDiscountDisplay };
