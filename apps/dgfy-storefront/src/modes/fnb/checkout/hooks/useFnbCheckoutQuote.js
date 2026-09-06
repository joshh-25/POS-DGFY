import { useCallback, useRef } from 'react';

import { buildFnbCheckoutPayload } from '../model/buildFnbCheckoutPayload.js';
import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../../../packages/web-core/src/observability/analyticsEvents.js';

const getValidationField = (error) => {
  const validationErrors = [
    error?.details,
    error?.payload?.errors,
    error?.errors,
  ].find(Array.isArray) || [];
  const first = validationErrors[0] || {};
  return String(first?.field || first?.path || '').trim();
};

const isDeferredCustomerValidation = (error) => {
  const code = String(error?.errorCode || '').trim().toUpperCase();
  if (code !== 'VALIDATION_FAILED') return false;
  const field = getValidationField(error);
  if (['customer_name', 'customer_phone', 'customer_email', 'delivery_address'].includes(field)) return true;
  const message = String(error?.message || '').toLowerCase();
  return ['customer_name', 'customer_phone', 'customer_email', 'delivery_address'].some((key) => message.includes(key));
};

/**
 * Owns F&B quote and promo application behavior. The root shell supplies the
 * existing storefront dependencies while this hook keeps F&B policy isolated.
 */
export function useFnbCheckoutQuote({
  accessCapabilities,
  cart,
  cartSignature,
  checkoutPermitted,
  checkoutPromoCode,
  checkoutVoucherCode,
  customerEmail,
  customerName,
  customerPhone,
  customerPin,
  deliveryAddress,
  fnbScheduleMode,
  fnbScheduledFor,
  fnbSpecialInstructions,
  isDeliveryOrder,
  // #746: requestQuote previously used readStoreAuthToken() unconditionally, the same as a guest.
  // A signed-in DGFY customer's identity lives on their account, not in these local form fields --
  // without their real token the server's optionalStoreCustomer middleware never resolves it, so
  // the quote falls back to requiring customer_name/phone/email exactly as it does for a guest who
  // hasn't typed anything yet. The actual checkout-submission hooks
  // (useFnbCheckoutSubmission.js, useCheckoutSubmission.js) already select the right token this way
  // -- requestQuote was the one path that never did.
  isDgfyCustomerSignedIn,
  normalizeErrorMessage,
  orderMethod,
  // Phase 150 (#866): the customer's pay-in-full-vs-downpayment election, meaningful only at a
  // payment_mode='customer_choice' store -- see storefrontPaymentElection.js.
  paymentElection,
  readDgfyAuthToken,
  readStoreAuthToken,
  requestJson,
  selectedLocationId,
  selectedStore,
  setCheckoutPromoCode,
  setCheckoutVoucherCode,
  setQuotedCartSignature,
  setQuoteError,
  setQuoteNeedsRefresh,
  setQuoteResult,
  storefrontClosedByHours,
  storefrontHoursLabel,
  toast,
  buildStockExceededMessage,
  extractStockViolation,
}) {
  const quoteRequestIdRef = useRef(0);

  // #672: voucherCode is a second, independent override alongside promoCode -- the two checkout
  // discounts are separate fields (see buildFnbCheckoutPayload.js), so each needs its own override
  // rather than reusing promoCode's single positional slot.
  const buildPayload = useCallback(({
    promoCode = checkoutPromoCode,
    voucherCode = checkoutVoucherCode,
    cartOverride = cart
  } = {}) => buildFnbCheckoutPayload({
    selectedLocationId,
    selectedStore,
    orderMethod,
    customerName,
    customerPhone,
    customerEmail,
    isDeliveryOrder,
    deliveryAddress,
    customerPin,
    promoCode,
    voucherCode,
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    cart: cartOverride,
    paymentElection,
  }), [
    cart,
    checkoutPromoCode,
    checkoutVoucherCode,
    customerEmail,
    customerName,
    customerPhone,
    customerPin,
    deliveryAddress,
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    isDeliveryOrder,
    orderMethod,
    paymentElection,
    selectedLocationId,
    selectedStore,
  ]);

  const requestQuote = useCallback(async ({
    promoCodeOverride = checkoutPromoCode,
    voucherCodeOverride = checkoutVoucherCode,
    successMessage = '',
    silent = false
  } = {}) => {
    if (!selectedStore) return null;

    // #746: snapshot the cart fingerprint the request is built from, BEFORE awaiting. Recording it
    // after the response would attribute the quote to whatever the cart looks like when the network
    // finally returns -- which is exactly the cart edit that should have invalidated it.
    const signatureAtRequest = cartSignature;
    const requestId = quoteRequestIdRef.current + 1;
    quoteRequestIdRef.current = requestId;

    const data = await requestJson('/api/v1/store/cart/quote', {
      method: 'POST',
      storeSlug: selectedStore.slug,
      authToken: isDgfyCustomerSignedIn ? (readDgfyAuthToken() || readStoreAuthToken()) : readStoreAuthToken(),
      body: buildPayload({ promoCode: promoCodeOverride, voucherCode: voucherCodeOverride }),
    });
    // A fast remove/re-apply sequence can leave more than one quote request in flight. Only the
    // latest mutation may publish a result; otherwise an older discounted response can resurrect
    // the voucher after the shopper has already removed it.
    if (requestId !== quoteRequestIdRef.current) return null;
    setQuoteResult(data);
    setQuotedCartSignature(signatureAtRequest);
    setQuoteNeedsRefresh(false);
    if (!silent) {
      toast.success(data?.promo_feedback?.message || successMessage || 'Totals updated.');
    }
    return data;
  }, [
    buildPayload,
    cartSignature,
    checkoutPromoCode,
    checkoutVoucherCode,
    isDgfyCustomerSignedIn,
    readDgfyAuthToken,
    readStoreAuthToken,
    requestJson,
    selectedStore,
    setQuotedCartSignature,
    setQuoteNeedsRefresh,
    setQuoteResult,
    toast,
  ]);

  const handlePromoCardApply = useCallback(async (promoCode) => {
    const normalizedPromoCode = String(promoCode || '').trim().toUpperCase();
    if (!normalizedPromoCode) return;

    setCheckoutPromoCode(normalizedPromoCode);
    setQuoteError('');

    if (!Array.isArray(cart) || cart.length === 0) {
      toast.success(`Promo code ${normalizedPromoCode} added. Add items to validate the discount.`);
      return;
    }
    if (!selectedStore) {
      toast.success(`Promo code ${normalizedPromoCode} added.`);
      return;
    }
    if (storefrontClosedByHours) {
      const message = storefrontHoursLabel
        ? `Promo code ${normalizedPromoCode} added. It will validate during business hours: ${storefrontHoursLabel}.`
        : `Promo code ${normalizedPromoCode} added. It will validate when ordering opens again.`;
      toast.info(message);
      return;
    }
    if (!checkoutPermitted || accessCapabilities.quote === false) {
      toast.info(`Promo code ${normalizedPromoCode} added. It will validate when online checkout is available.`);
      return;
    }

    try {
      // Every earlier `return` above is a "code added, but not yet
      // server-validated" state (closed hours, no cart, etc). This is the
      // only branch that actually round-trips the code to the server, so
      // it's the one place "applied" (as opposed to merely "typed") is true.
      await requestQuote({
        promoCodeOverride: normalizedPromoCode,
        successMessage: `Promo code ${normalizedPromoCode} applied.`,
      });
      trackFunnelEvent(ANALYTICS_EVENTS.PROMO_CODE_APPLIED, {
        store_slug: selectedStore?.slug,
        promo_code: normalizedPromoCode
      });
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setQuoteError(message);
        toast.error(message);
        return;
      }
      if (isDeferredCustomerValidation(error)) {
        setQuoteNeedsRefresh(true);
        toast.success(`Promo code ${normalizedPromoCode} added. It will apply after customer details are completed.`);
        return;
      }
      const message = normalizeErrorMessage(error, 'Unable to apply promo code right now.');
      setQuoteError(message);
      toast.error(message);
    }
  }, [
    accessCapabilities.quote,
    buildStockExceededMessage,
    cart,
    checkoutPermitted,
    extractStockViolation,
    normalizeErrorMessage,
    requestQuote,
    selectedStore,
    setCheckoutPromoCode,
    setQuoteError,
    setQuoteNeedsRefresh,
    storefrontClosedByHours,
    storefrontHoursLabel,
    toast,
  ]);

  // #672: symmetric to handlePromoCardApply above, for the separate voucher_code field. Mirrors the
  // same "added but not yet server-validated" early-return shape (closed hours, empty cart, offline
  // checkout) and the same stock-violation/deferred-customer-validation error handling.
  const handleVoucherCardApply = useCallback(async (voucherCode) => {
    const normalizedVoucherCode = String(voucherCode || '').trim().toUpperCase();
    if (!normalizedVoucherCode) return;

    setCheckoutVoucherCode(normalizedVoucherCode);
    setQuoteError('');

    if (!Array.isArray(cart) || cart.length === 0) {
      toast.success(`Voucher code ${normalizedVoucherCode} added. Add items to validate the discount.`);
      return;
    }
    if (!selectedStore) {
      // #746: not a success -- nothing validated the code, so don't dress it up as applied.
      toast.info(`Voucher code ${normalizedVoucherCode} added. It will validate once a store is selected.`);
      return;
    }
    if (storefrontClosedByHours) {
      const message = storefrontHoursLabel
        ? `Voucher code ${normalizedVoucherCode} added. It will validate during business hours: ${storefrontHoursLabel}.`
        : `Voucher code ${normalizedVoucherCode} added. It will validate when ordering opens again.`;
      toast.info(message);
      return;
    }
    if (!checkoutPermitted || accessCapabilities.quote === false) {
      toast.info(`Voucher code ${normalizedVoucherCode} added. It will validate when online checkout is available.`);
      return;
    }

    try {
      await requestQuote({
        voucherCodeOverride: normalizedVoucherCode,
        successMessage: `Voucher code ${normalizedVoucherCode} applied.`,
      });
      trackFunnelEvent(ANALYTICS_EVENTS.VOUCHER_CODE_APPLIED, {
        store_slug: selectedStore?.slug,
        voucher_code: normalizedVoucherCode
      });
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setQuoteError(message);
        toast.error(message);
        return;
      }
      if (isDeferredCustomerValidation(error)) {
        setQuoteNeedsRefresh(true);
        toast.success(`Voucher code ${normalizedVoucherCode} added. It will apply after customer details are completed.`);
        return;
      }
      const message = normalizeErrorMessage(error, 'Unable to apply voucher code right now.');
      setQuoteError(message);
      toast.error(message);
    }
  }, [
    accessCapabilities.quote,
    buildStockExceededMessage,
    cart,
    checkoutPermitted,
    extractStockViolation,
    normalizeErrorMessage,
    requestQuote,
    selectedStore,
    setCheckoutVoucherCode,
    setQuoteError,
    setQuoteNeedsRefresh,
    storefrontClosedByHours,
    storefrontHoursLabel,
    toast,
  ]);

  // Removing a voucher is a quote-affecting mutation too. Clearing only the input state leaves
  // the last discounted quote in `quoteResult`, so every storefront summary keeps rendering the
  // old voucher discount until the browser is refreshed. Invalidate that snapshot immediately,
  // then re-quote with an explicit empty voucher override so the server recalculates the same cart
  // and fulfillment state without the removed code.
  const handleVoucherCardRemove = useCallback(async () => {
    setCheckoutVoucherCode('');
    setQuoteError('');
    setQuoteResult(null);
    setQuotedCartSignature(null);
    setQuoteNeedsRefresh(true);

    if (!selectedStore || !Array.isArray(cart) || cart.length === 0) return null;
    if (storefrontClosedByHours || !checkoutPermitted || accessCapabilities.quote === false) return null;

    try {
      return await requestQuote({ voucherCodeOverride: '', silent: true });
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        setQuoteError(buildStockExceededMessage(violation));
      } else if (isDeferredCustomerValidation(error)) {
        // The cart drawer can be visible before customer details exist. The code is still removed;
        // leave the quote invalidated and let the completed checkout details trigger validation.
        setQuoteNeedsRefresh(true);
      } else {
        setQuoteError(normalizeErrorMessage(error, 'Unable to update order totals.'));
      }
      return null;
    }
  }, [
    accessCapabilities.quote,
    buildStockExceededMessage,
    cart,
    checkoutPermitted,
    extractStockViolation,
    normalizeErrorMessage,
    requestQuote,
    selectedStore,
    setCheckoutVoucherCode,
    setQuoteError,
    setQuotedCartSignature,
    setQuoteNeedsRefresh,
    setQuoteResult,
    storefrontClosedByHours,
  ]);

  return {
    buildPayload,
    handlePromoCardApply,
    handleVoucherCardApply,
    handleVoucherCardRemove,
    requestQuote,
  };
}
