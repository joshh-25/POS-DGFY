import { useCallback } from 'react';

import { buildFnbCheckoutPayload } from '../model/buildFnbCheckoutPayload.js';
import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../../../../../packages/web-core/src/observability/analyticsEvents.js';

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
  checkoutPermitted,
  checkoutPromoCode,
  customerEmail,
  customerName,
  customerPhone,
  customerPin,
  deliveryAddress,
  fnbScheduleMode,
  fnbScheduledFor,
  fnbSpecialInstructions,
  isDeliveryOrder,
  normalizeErrorMessage,
  orderMethod,
  readStoreAuthToken,
  requestJson,
  selectedLocationId,
  selectedStore,
  setCheckoutPromoCode,
  setQuoteError,
  setQuoteNeedsRefresh,
  setQuoteResult,
  storefrontClosedByHours,
  storefrontHoursLabel,
  toast,
  buildStockExceededMessage,
  extractStockViolation,
}) {
  const buildPayload = useCallback((promoCode = checkoutPromoCode, cartOverride = cart) => buildFnbCheckoutPayload({
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
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    cart: cartOverride,
  }), [
    cart,
    checkoutPromoCode,
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
    selectedLocationId,
    selectedStore,
  ]);

  const requestQuote = useCallback(async ({ promoCodeOverride = checkoutPromoCode, successMessage = '', silent = false } = {}) => {
    if (!selectedStore) return null;

    const data = await requestJson('/api/v1/store/cart/quote', {
      method: 'POST',
      storeSlug: selectedStore.slug,
      authToken: readStoreAuthToken(),
      body: buildPayload(promoCodeOverride),
    });
    setQuoteResult(data);
    setQuoteNeedsRefresh(false);
    if (!silent) {
      toast.success(data?.promo_feedback?.message || successMessage || 'Totals updated.');
    }
    return data;
  }, [
    buildPayload,
    checkoutPromoCode,
    readStoreAuthToken,
    requestJson,
    selectedStore,
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

  return {
    buildPayload,
    handlePromoCardApply,
    requestQuote,
  };
}
