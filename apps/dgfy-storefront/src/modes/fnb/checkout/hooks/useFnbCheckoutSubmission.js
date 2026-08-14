import { useCallback } from 'react';

import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../../../../../packages/web-core/src/observability/analyticsEvents.js';

/**
 * Submits a standard F&B order. Services and Simple submissions intentionally
 * remain outside this hook because they use different contracts and outcomes.
 */
export function useFnbCheckoutSubmission({
  buildPayload,
  buildStockExceededMessage,
  cart,
  checkoutBlockReason,
  clearCheckoutAuthResumeDraft,
  customerEmail,
  customerName,
  customerPhone,
  extractStockViolation,
  fnbPaymentType,
  goStoreTrackPage,
  guestCheckoutIntentId,
  guestCheckoutProof,
  handleLoadAccountPanel,
  isDgfyCustomerSignedIn,
  normalizeErrorMessage,
  orderMethod,
  orderSuccessAnimationTimerRef,
  qrphIdempotencyKey,
  qrphPaymentSession,
  readDgfyAuthToken,
  readStoreAuthToken,
  rememberCustomerDetails,
  requestJson,
  requireQuoteForCheckout,
  resolvedCustomerFirstName,
  resolvedCustomerLastName,
  selectedStore,
  setCart,
  setCheckoutError,
  setCheckoutLoading,
  setCheckoutPromoCode,
  setCheckoutResult,
  setFnbOrderStep,
  setQuoteNeedsRefresh,
  setQuoteResult,
  setQrphPaymentSession,
  setSelectedTrackingPin,
  setShowOrderSuccessAnimation,
  setTrackingPinInput,
  storefrontClosedMessageBody,
  storefrontClosedToastMessage,
  syncTrackedOrderSnapshot,
  toast,
  totalsForDisplay,
  writeSavedCustomerDetails,
  setSavedCustomerDetails,
}) {
  return useCallback(async () => {
    if (!selectedStore) return;

    setCheckoutError('');
    setCheckoutResult(null);

    const blockMessages = {
      stock_violation: 'Cannot checkout: one or more items exceed current stock.',
      access_mode: 'This storefront is not accepting online checkout right now.',
      missing_quote: 'Please click Quote first before checkout.',
      stale_quote: 'Your cart changed. Please refresh Quote before checkout.',
    };
    const blockMessage = checkoutBlockReason === 'business_hours'
      ? storefrontClosedMessageBody
      : blockMessages[checkoutBlockReason];
    const quoteBlock = ['missing_quote', 'stale_quote'].includes(checkoutBlockReason);
    if (blockMessage && (!quoteBlock || requireQuoteForCheckout)) {
      setCheckoutError(blockMessage);
      toast.error(checkoutBlockReason === 'business_hours'
        ? storefrontClosedToastMessage
        : blockMessage);
      return;
    }
    if (!isDgfyCustomerSignedIn && !guestCheckoutProof?.proof) {
      const message = 'Verify the email code before placing this guest order.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }

    // Retain storefront presentation fields for the tracking snapshot.
    const cartSnapshot = cart.map((line) => ({ ...line }));
    setCheckoutLoading(true);
    trackFunnelEvent(ANALYTICS_EVENTS.CHECKOUT_SUBMITTED, {
      store_slug: selectedStore?.slug,
      order_value: totalsForDisplay?.total_amount ?? 0,
      item_count: cartSnapshot.length,
      fulfillment_type: orderMethod
    });
    try {
      const authToken = isDgfyCustomerSignedIn
        ? (readDgfyAuthToken() || readStoreAuthToken())
        : readStoreAuthToken();
      if (fnbPaymentType === 'qrph') {
        if (qrphPaymentSession?.payment_session_id) {
          const message = 'A QR Ph payment is already awaiting confirmation. Refresh its status or use cash instead.';
          setCheckoutError(message);
          toast.error(message);
          return;
        }

        const sessionResult = await requestJson('/api/v1/store/checkout/payment-sessions', {
          method: 'POST',
          storeSlug: selectedStore.slug,
          authToken,
          body: {
            ...buildPayload(),
            idempotency_key: isDgfyCustomerSignedIn
              ? qrphIdempotencyKey
              : guestCheckoutIntentId,
            payment_type: 'qrph',
            guest_checkout_proof: isDgfyCustomerSignedIn ? null : guestCheckoutProof?.proof || null,
          },
        });
        const paymentSession = sessionResult?.payment_session;
        if (!paymentSession?.payment_session_id) {
          throw new Error('PayMongo did not return a QR Ph payment session.');
        }
        setQrphPaymentSession(paymentSession);
        if (paymentSession.status === 'failed') {
          throw new Error(paymentSession.failure_reason || 'PayMongo could not create this QR Ph payment.');
        }
        toast.success('QR Ph payment created. Complete the PayMongo test payment to continue.');
        return;
      }

      const data = await requestJson('/api/v1/store/checkout', {
        method: 'POST',
        storeSlug: selectedStore.slug,
        authToken,
        body: {
          ...buildPayload(),
          idempotency_key: isDgfyCustomerSignedIn
            ? (window.crypto?.randomUUID?.() || `store-${Date.now()}`)
            : guestCheckoutIntentId,
          payment_type: fnbPaymentType,
          guest_checkout_proof: isDgfyCustomerSignedIn ? null : guestCheckoutProof?.proof || null,
        },
      });

      setCheckoutResult({ ...data, cart_lines: cartSnapshot, totals: totalsForDisplay });
      if (rememberCustomerDetails) {
        const persistedDetails = writeSavedCustomerDetails({
          firstName: resolvedCustomerFirstName,
          lastName: resolvedCustomerLastName,
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          source: isDgfyCustomerSignedIn ? 'account' : 'guest',
          updatedAt: Date.now(),
        });
        if (persistedDetails) setSavedCustomerDetails(persistedDetails);
      }

      const trackingPin = String(data?.tracking_pin || '').trim().toUpperCase();
      if (trackingPin) {
        setTrackingPinInput(trackingPin);
        setSelectedTrackingPin(trackingPin);
        syncTrackedOrderSnapshot({
          tracking_pin: trackingPin,
          status: data?.order?.status || 'placed',
          status_label: data?.order?.status_label || 'Order placed',
          order_method: data?.order?.order_method || orderMethod,
          order: data?.order || null,
          order_name: cartSnapshot[0]?.name || '',
          total_amount: totalsForDisplay?.total_amount ?? 0,
        }, trackingPin);
      }

      setCart([]);
      setQuoteResult(null);
      setQuoteNeedsRefresh(true);
      setCheckoutPromoCode('');
      if (isDgfyCustomerSignedIn) void handleLoadAccountPanel();

      if (trackingPin) {
        setShowOrderSuccessAnimation(false);
        if (orderSuccessAnimationTimerRef.current) {
          window.clearTimeout(orderSuccessAnimationTimerRef.current);
          orderSuccessAnimationTimerRef.current = null;
        }
        setCheckoutResult(null);
        goStoreTrackPage({ pin: trackingPin });
      } else {
        setFnbOrderStep(4);
      }
      clearCheckoutAuthResumeDraft();
      toast.success(data?.promo_feedback?.message || 'Checkout completed.');
      trackFunnelEvent(ANALYTICS_EVENTS.ORDER_PLACED, {
        store_slug: selectedStore?.slug,
        order_value: totalsForDisplay?.total_amount ?? 0,
        item_count: cartSnapshot.length,
        fulfillment_type: data?.order?.order_method || orderMethod
      });
    } catch (error) {
      const violation = extractStockViolation(error);
      const message = violation
        ? buildStockExceededMessage(violation)
        : normalizeErrorMessage(error, 'Unable to complete checkout.');
      setCheckoutError(message);
      toast.error(message);
      trackFunnelEvent(ANALYTICS_EVENTS.CHECKOUT_FAILED, {
        store_slug: selectedStore?.slug,
        reason: violation ? 'stock_violation' : (error?.errorCode || 'unknown')
      });
    } finally {
      setCheckoutLoading(false);
    }
  }, [
    buildPayload,
    buildStockExceededMessage,
    cart,
    checkoutBlockReason,
    clearCheckoutAuthResumeDraft,
    customerEmail,
    customerName,
    customerPhone,
    extractStockViolation,
    fnbPaymentType,
    goStoreTrackPage,
    guestCheckoutIntentId,
    guestCheckoutProof,
    handleLoadAccountPanel,
    isDgfyCustomerSignedIn,
    normalizeErrorMessage,
    orderMethod,
    orderSuccessAnimationTimerRef,
    qrphIdempotencyKey,
    qrphPaymentSession,
    readDgfyAuthToken,
    readStoreAuthToken,
    rememberCustomerDetails,
    requestJson,
    requireQuoteForCheckout,
    resolvedCustomerFirstName,
    resolvedCustomerLastName,
    selectedStore,
    setCart,
    setCheckoutError,
    setCheckoutLoading,
    setCheckoutPromoCode,
    setCheckoutResult,
    setFnbOrderStep,
    setQuoteNeedsRefresh,
    setQuoteResult,
    setQrphPaymentSession,
    setSavedCustomerDetails,
    setSelectedTrackingPin,
    setShowOrderSuccessAnimation,
    setTrackingPinInput,
    storefrontClosedMessageBody,
    storefrontClosedToastMessage,
    syncTrackedOrderSnapshot,
    toast,
    totalsForDisplay,
    writeSavedCustomerDetails,
  ]);
}
