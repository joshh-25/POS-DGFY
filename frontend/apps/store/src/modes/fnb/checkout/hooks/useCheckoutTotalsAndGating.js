import { useMemo } from 'react';
import { canCheckout, getCheckoutBlockReason } from '../../../../shared/model/checkoutRules.js';
import { DGFY_CONVENIENCE_FEE_LABEL, DGFY_CONVENIENCE_FEE_RATE, ORDER_METHOD_OPTIONS } from '../../../../shared/model/storefrontConstants.js';
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
  isSimpleMode,
  money,
  orderMethod,
  quoteError,
  quoteNeedsRefresh,
  quoteResult,
  selectedStore,
  serviceCartLines,
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
    const totalAmount = quoteResult?.total_amount != null ? Number(quoteResult.total_amount) : subtotal - discountAmount + deliveryFee + serviceFee;
    return {
      subtotal_amount: subtotal,
      discount_amount: discountAmount,
      discount_label: quoteResult?.discount_label || 'Promo Discount',
      discount_rate: quoteResult?.discount_rate != null ? Number(quoteResult.discount_rate) : 0,
      service_fee_amount: serviceFee,
      service_fee_label: quoteResult?.service_fee_label || DGFY_CONVENIENCE_FEE_LABEL,
      delivery_fee: deliveryFee,
      vatable_sales: quoteResult?.vatable_sales != null ? Number(quoteResult.vatable_sales) : 0,
      vat_amount: quoteResult?.vat_amount != null ? Number(quoteResult.vat_amount) : 0,
      vat_exempt_sales: quoteResult?.vat_exempt_sales != null ? Number(quoteResult.vat_exempt_sales) : 0,
      zero_rated_sales: quoteResult?.zero_rated_sales != null ? Number(quoteResult.zero_rated_sales) : 0,
      total_amount: totalAmount
    };
  }, [quoteResult, cartTotal]);
  const activePromoFeedback = checkoutResult?.promo_feedback || quoteResult?.promo_feedback || null;
  const promoStatusMessage = checkoutError || quoteError || activePromoFeedback?.message || '';
  const promoStatusTone = checkoutError || quoteError
    ? 'error'
    : (activePromoFeedback?.applied ? 'success' : 'idle');
  const appliedPromoDiscountText = totalsForDisplay.discount_amount > 0
    ? `${money(totalsForDisplay.discount_amount)} off`
    : '';
  const promoDiscountSummaryRow = totalsForDisplay.discount_amount > 0
    ? { label: totalsForDisplay.discount_label || 'Promo Discount', value: `- ${money(totalsForDisplay.discount_amount)}` }
    : null;
  const activeOrderMethodLabel = ORDER_METHOD_OPTIONS.find((option) => option.value === orderMethod)?.label || 'Checkout';
  const simpleOrderMethodOptions = ORDER_METHOD_OPTIONS.filter((option) => option.value === 'pickup' || option.value === 'delivery');
  const requireQuoteForCheckout = !hasServiceCart && !isFnbMode && !isSimpleMode;
  const checkoutBlockReason = getCheckoutBlockReason({
    selectedStore,
    cartCount,
    checkoutLoading,
    hasStockViolation,
    hasServiceCart,
    accessCapabilities,
    quoteResult,
    quoteNeedsRefresh,
    requireQuote: requireQuoteForCheckout
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
    requireQuote: requireQuoteForCheckout
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
    appliedPromoDiscountText,
    checkoutAllowed,
    checkoutBlockReason,
    fnbCartStatusLabel,
    hasStockViolation,
    promoDiscountSummaryRow,
    promoStatusMessage,
    promoStatusTone,
    requireQuoteForCheckout,
    serviceCartValidationIssues,
    simpleOrderMethodOptions,
    totalsForDisplay
  };
}
