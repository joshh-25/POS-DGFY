import { useMemo, useState } from 'react';
import { canCheckout, getCheckoutBlockReason } from '../../../../shared/model/checkoutRules.js';
import { ORDER_METHOD_OPTIONS } from '../../../../shared/model/storefrontConstants.js';
import {
  resolveLocationFulfillmentSupport
} from '../../../../shared/model/storefrontOrderMethodOptions.js';
import {
  resolveStorefrontFnbFulfillmentOptions,
  resolveStorefrontFulfillmentOptions
} from '../../../../shared/model/storefrontFulfillmentOptions.js';
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
  fnbScheduledFor,
  // Phase 150 (#866): the customer's pay-in-full-vs-downpayment election, meaningful only at a
  // payment_mode='customer_choice' store.
  paymentElection,
  quoteError,
  quoteNeedsRefresh,
  quoteResult,
  selectedStore,
  serviceAppointmentAt,
  selectedLocationId,
  serviceCartLines,
  storeLocations,
  storefrontClosedByHours
}) {
  const [currentTime] = useState(() => Date.now());
  const isTotalStale = Boolean(isFnbMode && !hasServiceCart && (quoteNeedsRefresh || !quoteResult));
  const hasStockViolation = useMemo(() => (
    cart.some((line) => Number(line.quantity) > Number(line.max_stock ?? Number.POSITIVE_INFINITY))
  ), [cart]);
  const totalsForDisplay = useMemo(() => {
    const subtotal = quoteResult?.subtotal_amount != null ? Number(quoteResult.subtotal_amount) : cartTotal;
    const discountAmount = quoteResult?.discount_amount != null ? Number(quoteResult.discount_amount) : 0;
    // Phase 333: the Storefront no longer derives a customer-facing DGFY fee
    // locally when a quote is unavailable. Keep the legacy field only for
    // compatibility with quote consumers; it is never rendered to customers.
    const serviceFee = quoteResult?.service_fee_amount != null
      ? Number(quoteResult.service_fee_amount)
      : 0;
    const deliveryFee = quoteResult?.delivery_fee != null ? Number(quoteResult.delivery_fee) : 0;
    // #604's own field is `voucher_discount_amount`, separate from promo's `discount_amount` --
    // the two checkout discounts are independent (see buildFnbCheckoutPayload.js's own note).
    const voucherDiscountAmount = quoteResult?.voucher_discount_amount != null ? Number(quoteResult.voucher_discount_amount) : 0;
    const quotedTotalAmount = quoteResult?.total_amount != null
      ? Number(quoteResult.total_amount)
      : subtotal - discountAmount - voucherDiscountAmount + deliveryFee;
    const currentCartTotal = Math.max(0, Number(cartTotal) || 0);
    const displayDiscountAmount = isTotalStale
      ? Math.min(currentCartTotal, Math.max(0, discountAmount))
      : discountAmount;
    const displayVoucherDiscountAmount = isTotalStale
      ? Math.min(Math.max(0, currentCartTotal - displayDiscountAmount), Math.max(0, voucherDiscountAmount))
      : voucherDiscountAmount;
    const staleDiscounts = displayDiscountAmount + displayVoucherDiscountAmount;
    const totalAmount = isTotalStale ? currentCartTotal - staleDiscounts : quotedTotalAmount;
    return {
      subtotal_amount: isTotalStale ? currentCartTotal : subtotal,
      discount_amount: displayDiscountAmount,
      discount_label: quoteResult?.discount_label || 'Promo Discount',
      discount_rate: quoteResult?.discount_rate != null ? Number(quoteResult.discount_rate) : 0,
      voucher_discount_amount: displayVoucherDiscountAmount,
      service_fee_amount: serviceFee,
      delivery_fee: isTotalStale ? 0 : deliveryFee,
      vatable_sales: !isTotalStale && quoteResult?.vatable_sales != null ? Number(quoteResult.vatable_sales) : 0,
      vat_amount: !isTotalStale && quoteResult?.vat_amount != null ? Number(quoteResult.vat_amount) : 0,
      vat_exempt_sales: !isTotalStale && quoteResult?.vat_exempt_sales != null ? Number(quoteResult.vat_exempt_sales) : 0,
      zero_rated_sales: !isTotalStale && quoteResult?.zero_rated_sales != null ? Number(quoteResult.zero_rated_sales) : 0,
      total_amount: totalAmount,
      // Phase 142 (#823): server-authoritative only -- never derived client-side like the fields
      // above. Passed straight through from the quote response (null when absent, matching the
      // quote's own present-and-null convention -- see storeUseCases.js's Phase 140 comment on
      // why null, never 0 or the total, is load-bearing here).
      payment_mode: isTotalStale ? null : quoteResult?.payment_mode ?? null,
      downpayment_amount: isTotalStale ? null : quoteResult?.downpayment_amount ?? null,
      balance_due_amount: isTotalStale ? null : quoteResult?.balance_due_amount ?? null,
      downpayment_refundable: isTotalStale ? null : quoteResult?.downpayment_refundable ?? null
    };
  }, [cartTotal, isTotalStale, quoteResult]);
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
  const fulfillmentLocation = useMemo(
    () => resolveLocationFulfillmentSupport({ selectedStore, storeLocations, selectedLocationId }),
    [selectedLocationId, selectedStore, storeLocations]
  );
  const simpleOrderMethodOptions = useMemo(
    () => (isFnbMode
      ? resolveStorefrontFnbFulfillmentOptions(fulfillmentLocation)
      : resolveStorefrontFulfillmentOptions(fulfillmentLocation)),
    [fulfillmentLocation, isFnbMode]
  );
  // F&B checkout always requires a fresh quote before submission so displayed fulfillment fees
  // and the payable total come from the same current context. Other product modes retain their
  // client-computable totals fallback except when a downpayment split needs a server quote.
  // Phase 150 (#866): a customer_choice store's split is server-only too, but ONLY once the
  // customer has actually elected "downpayment" -- an election of "full" needs no quote-forcing,
  // exactly like a plain full_payment store.
  const isDownpaymentStore = selectedStore?.payment_mode === 'downpayment_required'
    || (selectedStore?.payment_mode === 'customer_choice' && paymentElection === 'downpayment');
  const requireQuoteForCheckout = !hasServiceCart
    && (isFnbMode || isDownpaymentStore || (!isFnbMode && !isSimpleMode && !isRetailMode));
  const baseCheckoutBlockReason = getCheckoutBlockReason({
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
  const hasValidDineInSchedule = Boolean(
    String(fnbScheduledFor || '').trim()
    && Number.isFinite(new Date(fnbScheduledFor).getTime())
    && new Date(fnbScheduledFor).getTime() > currentTime
  );
  const checkoutBlockReason = baseCheckoutBlockReason || (
    isFnbMode && orderMethod === 'dine_in' && !hasValidDineInSchedule
      ? 'missing_dine_in_schedule'
      : null
  );
  const serviceCartValidationIssues = useMemo(
    () => buildServiceCartValidationIssues(serviceCartLines, serviceAppointmentAt),
    [serviceAppointmentAt, serviceCartLines]
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
  })
    && (!hasServiceCart || serviceCartValidationIssues.length === 0)
    && !(isFnbMode && orderMethod === 'dine_in' && !hasValidDineInSchedule);
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
    isTotalStale,
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
