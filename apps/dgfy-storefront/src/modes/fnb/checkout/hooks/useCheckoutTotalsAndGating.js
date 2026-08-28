import { useMemo } from 'react';
import { canCheckout, getCheckoutBlockReason } from '../../../../shared/model/checkoutRules.js';
import { DGFY_CONVENIENCE_FEE_LABEL, DGFY_CONVENIENCE_FEE_RATE, ORDER_METHOD_OPTIONS } from '../../../../shared/model/storefrontConstants.js';
import {
  buildStorefrontOrderMethodOptions,
  resolveLocationFulfillmentSupport
} from '../../../../shared/model/storefrontOrderMethodOptions.js';
import { round4 } from '../../../../shared/utils/storefrontFormatters.js';
import { buildServiceCartValidationIssues } from '../../../services/booking/model/serviceBookingValidation.js';
import { buildFnbCartStatusLabel } from '../model/fnbCartPresentation.js';

/**
 * Moved verbatim from `StorefrontApp.jsx`: checkout totals (`totalsForDisplay`),
 * promo status/messaging, order-method labels, and checkout gating
 * (`checkoutBlockReason`, `checkoutAllowed`, `fnbCartStatusLabel`). Placed in
 * `modes/fnb/checkout/hooks/` (alongside the other fnb checkout hooks)
 * because it imports `buildFnbCartStatusLabel` from `modes/fnb/checkout/
 * model/*` - `shared/` must not import from `modes/*`.
 *
 * `fnbCartStatusLabel` depends on `storefrontClosedByHours`, which comes
 * from `useStorefrontClosedNotice` - this hook's call site must stay below
 * that one in the shell (same as before the move).
 */
export function useCheckoutTotalsAndGating({
  accessCapabilities,
  cart,
  cartCount,
  cartTotal,
  checkoutError,
  checkoutLoading,
  checkoutResult,
  hasServiceCart,
  isFnbMode,
  isRetailMode,
  isSimpleMode,
  money,
  orderMethod,
  // Phase 150 (#866): the customer's pay-in-full-vs-downpayment election, meaningful only at a
  // payment_mode='customer_choice' store.
  paymentElection,
  quoteError,
  quoteNeedsRefresh,
  quoteResult,
  selectedStore,
  selectedLocationId,
  serviceCartLines,
  storeLocations,
  storefrontClosedByHours
}) {
  const hasStockViolation = useMemo(() => (
    cart.some((line) => Number(line.quantity) > Number(line.max_stock ?? Number.POSITIVE_INFINITY))
  ), [cart]);
  const totalsForDisplay = useMemo(() => {
    const subtotal = quoteResult?.subtotal_amount != null ? Number(quoteResult.subtotal_amount) : cartTotal;
    const discountAmount = quoteResult?.discount_amount != null ? Number(quoteResult.discount_amount) : 0;
    const serviceFee = quoteResult?.service_fee_amount != null
      ? Number(quoteResult.service_fee_amount)
      : round4(Math.max(0, subtotal) * DGFY_CONVENIENCE_FEE_RATE);
    const deliveryFee = quoteResult?.delivery_fee != null ? Number(quoteResult.delivery_fee) : 0;
    // #604's own field is `voucher_discount_amount`, separate from promo's `discount_amount` --
    // the two checkout discounts are independent (see buildFnbCheckoutPayload.js's own note).
    const voucherDiscountAmount = quoteResult?.voucher_discount_amount != null ? Number(quoteResult.voucher_discount_amount) : 0;
    const totalAmount = quoteResult?.total_amount != null ? Number(quoteResult.total_amount) : subtotal - discountAmount - voucherDiscountAmount + deliveryFee + serviceFee;
    return {
      subtotal_amount: subtotal,
      discount_amount: discountAmount,
      discount_label: quoteResult?.discount_label || 'Promo Discount',
      discount_rate: quoteResult?.discount_rate != null ? Number(quoteResult.discount_rate) : 0,
      voucher_discount_amount: voucherDiscountAmount,
      service_fee_amount: serviceFee,
      service_fee_label: quoteResult?.service_fee_label || DGFY_CONVENIENCE_FEE_LABEL,
      delivery_fee: deliveryFee,
      vatable_sales: quoteResult?.vatable_sales != null ? Number(quoteResult.vatable_sales) : 0,
      vat_amount: quoteResult?.vat_amount != null ? Number(quoteResult.vat_amount) : 0,
      vat_exempt_sales: quoteResult?.vat_exempt_sales != null ? Number(quoteResult.vat_exempt_sales) : 0,
      zero_rated_sales: quoteResult?.zero_rated_sales != null ? Number(quoteResult.zero_rated_sales) : 0,
      total_amount: totalAmount,
      // Phase 142 (#823): server-authoritative only -- never derived client-side like the fields
      // above. Passed straight through from the quote response (null when absent, matching the
      // quote's own present-and-null convention -- see storeUseCases.js's Phase 140 comment on
      // why null, never 0 or the total, is load-bearing here).
      payment_mode: quoteResult?.payment_mode ?? null,
      downpayment_amount: quoteResult?.downpayment_amount ?? null,
      balance_due_amount: quoteResult?.balance_due_amount ?? null,
      downpayment_refundable: quoteResult?.downpayment_refundable ?? null
    };
  }, [quoteResult, cartTotal]);
  const activePromoFeedback = checkoutResult?.promo_feedback || quoteResult?.promo_feedback || null;
  const promoStatusMessage = checkoutError || quoteError || activePromoFeedback?.message || '';
  const promoStatusTone = checkoutError || quoteError
    ? 'error'
    : (activePromoFeedback?.applied ? 'success' : 'idle');
  // #746: these four derived display values feed VoucherCodePanel/PromoCodePanel and the checkout
  // summary, while the cart drawer's total is decided by resolveCartDiscountDisplay. When the two
  // disagree the shopper sees "Discount applied: PHPX off" sitting above a total that ignores it --
  // which is exactly what "the code is accepted but the discount never appears" looked like. Apply
  // the same exceeds-cart suppression the drawer uses so the panel can never claim a discount the
  // total refuses to honour.
  const combinedDiscountAmount = Math.max(0, Number(totalsForDisplay.discount_amount) || 0)
    + Math.max(0, Number(totalsForDisplay.voucher_discount_amount) || 0);
  const discountsExceedCart = combinedDiscountAmount > (Number(cartTotal) || 0);
  const appliedPromoDiscountText = totalsForDisplay.discount_amount > 0 && !discountsExceedCart
    ? `${money(totalsForDisplay.discount_amount)} off`
    : '';
  const promoDiscountSummaryRow = totalsForDisplay.discount_amount > 0 && !discountsExceedCart
    ? { label: totalsForDisplay.discount_label || 'Promo Discount', value: `- ${money(totalsForDisplay.discount_amount)}` }
    : null;
  // #672: symmetric to the promo trio above. voucher_feedback carries no `.message` field
  // (unlike promo_feedback), so the applied-state message is a fixed string here.
  const activeVoucherFeedback = checkoutResult?.voucher_feedback || quoteResult?.voucher_feedback || null;
  const voucherStatusMessage = checkoutError || quoteError || (activeVoucherFeedback?.applied ? 'Voucher code applied.' : '');
  const voucherStatusTone = checkoutError || quoteError
    ? 'error'
    : (activeVoucherFeedback?.applied ? 'success' : 'idle');
  const appliedVoucherDiscountText = totalsForDisplay.voucher_discount_amount > 0 && !discountsExceedCart
    ? `${money(totalsForDisplay.voucher_discount_amount)} off`
    : '';
  const voucherDiscountSummaryRow = totalsForDisplay.voucher_discount_amount > 0 && !discountsExceedCart
    ? { label: 'Voucher Discount', value: `- ${money(totalsForDisplay.voucher_discount_amount)}` }
    : null;
  const activeOrderMethodLabel = ORDER_METHOD_OPTIONS.find((option) => option.value === orderMethod)?.label || 'Checkout';
  // #1093: the mode's delivery/pickup candidate set, narrowed to what the resolved
  // fulfillment location actually supports -- mirrors the server's own checkout-time
  // enforcement (assertCheckoutLocationOperationalReadiness, storeUseCases.js).
  const simpleOrderMethodOptions = buildStorefrontOrderMethodOptions(
    ORDER_METHOD_OPTIONS.filter((option) => option.value === 'pickup' || option.value === 'delivery'),
    resolveLocationFulfillmentSupport({ selectedStore, storeLocations, selectedLocationId })
  );
  // Phase 142 (#823): fnb/simple/retail's product checkout normally never requires a quote (each
  // has its own client-computable totals fallback) -- but a downpayment-required store's payment
  // split is server-only, so those three modes DO require the quote in that one case. Reads the
  // catalog-resolved payment_mode directly (not totalsForDisplay.payment_mode, which is quote-
  // sourced and therefore not yet known before the first quote lands -- the exact thing this gate
  // exists to force).
  // Phase 150 (#866): a customer_choice store's split is server-only too, but ONLY once the
  // customer has actually elected "downpayment" -- an election of "full" needs no quote-forcing,
  // exactly like a plain full_payment store.
  const isDownpaymentStore = selectedStore?.payment_mode === 'downpayment_required'
    || (selectedStore?.payment_mode === 'customer_choice' && paymentElection === 'downpayment');
  const requireQuoteForCheckout = !hasServiceCart
    && (isDownpaymentStore || (!isFnbMode && !isSimpleMode && !isRetailMode));
  const checkoutBlockReason = getCheckoutBlockReason({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    hasServiceCart,
    accessCapabilities,
    quoteResult,
    quoteNeedsRefresh,
    requireQuote: requireQuoteForCheckout,
    paymentElection,
    hasAvailableFulfillmentMethod: simpleOrderMethodOptions.some((option) => option.available)
  });
  const serviceCartValidationIssues = useMemo(
    () => buildServiceCartValidationIssues(serviceCartLines),
    [serviceCartLines]
  );
  const checkoutAllowed = canCheckout({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    hasServiceCart,
    accessCapabilities,
    quoteResult,
    quoteNeedsRefresh,
    requireQuote: requireQuoteForCheckout,
    paymentElection,
    hasAvailableFulfillmentMethod: simpleOrderMethodOptions.some((option) => option.available)
  }) && (!hasServiceCart || serviceCartValidationIssues.length === 0);
  const fnbCartStatusLabel = useMemo(() => buildFnbCartStatusLabel({
    cartCount,
    storefrontClosedByHours,
    hasStockViolation,
    isFnbMode,
    quoteResult,
    quoteNeedsRefresh,
    checkoutAllowed
  }), [cartCount, storefrontClosedByHours, hasStockViolation, isFnbMode, quoteResult, quoteNeedsRefresh, checkoutAllowed]);

  return {
    activeOrderMethodLabel,
    activePromoFeedback,
    activeVoucherFeedback,
    appliedPromoDiscountText,
    appliedVoucherDiscountText,
    checkoutAllowed,
    checkoutBlockReason,
    fnbCartStatusLabel,
    hasStockViolation,
    promoDiscountSummaryRow,
    promoStatusMessage,
    promoStatusTone,
    voucherDiscountSummaryRow,
    voucherStatusMessage,
    voucherStatusTone,
    requireQuoteForCheckout,
    serviceCartValidationIssues,
    simpleOrderMethodOptions,
    totalsForDisplay
  };
}
