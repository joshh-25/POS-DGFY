import { useCallback } from 'react';

import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../../../packages/web-core/src/observability/analyticsEvents.js';
import {
  createStorefrontOnlinePaymentSession,
  getStorefrontOnlinePaymentLabel,
  isStorefrontDirectCardPaymentSession,
  isStorefrontDirectPaymentSession,
  isStorefrontHostedPaymentType,
  isStorefrontOnlinePaymentType,
  startStorefrontDirectPayment
} from '../../../../shared/services/storefrontOnlinePaymentSession.js';
// Phase 142 (#823): widened extraction (carries amount_paid/balance_due, not just total_amount);
// see useCheckoutSubmission.js's own note for why this supersedes #857's plain inline restore.
import { resolveTrackedTotals } from '../../../../shared/model/trackedTotals.js';
import { GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE } from '../../../../shared/checkout/model/guestCheckoutOtp.js';
import { requiresBillingEmail } from '../../../../checkout/checkoutValidation.js';

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
      // Phase 142 (#823): checkoutRules.js's own dedicated reason code for a voucher/promo that
      // fully discounts a downpayment-required order to zero -- see that file's comment.
      downpayment_zero_total: 'This order total is fully covered by your discount -- contact the store to place it.',
      // #1093: the resolved fulfillment location has neither delivery nor pickup enabled --
      // shouldn't normally be reachable (see checkoutRules.js's own comment), but this store is
      // the honest, actionable fallback rather than a silent no-op Place Order click.
      no_fulfillment_method: 'This store is not accepting delivery or pickup orders online right now.',
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
      const message = GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    // #963: same backstop as shared/hooks/useCheckoutSubmission.js -- F&B submits through its own
    // hook, so the guard has to exist in both places or one mode ships without it.
    if (requiresBillingEmail({ paymentType: fnbPaymentType, customerEmail })) {
      const message = 'Add an email address before paying by card. Your card issuer needs it to authorize the payment.';
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
      if (isStorefrontOnlinePaymentType(fnbPaymentType)) {
        if (qrphPaymentSession?.payment_session_id) {
          const message = 'An online payment is already awaiting confirmation. Refresh its status or choose another payment method after it finishes.';
          setCheckoutError(message);
          toast.error(message);
          return;
        }

        const paymentSession = await createStorefrontOnlinePaymentSession({
          authToken,
          checkoutPayload: buildPayload(),
          guestCheckoutProof: isDgfyCustomerSignedIn ? null : guestCheckoutProof?.proof || null,
          idempotencyKey: isDgfyCustomerSignedIn
            ? qrphIdempotencyKey
            : guestCheckoutIntentId,
          paymentType: fnbPaymentType,
          requestJson,
          storeSlug: selectedStore.slug
        });
        if (isStorefrontDirectPaymentSession(paymentSession)) {
          if (isStorefrontDirectCardPaymentSession(paymentSession)) {
            setQrphPaymentSession(paymentSession);
            toast.info('Enter your card details to continue securely with PayMongo.');
            return;
          }
          const directPayment = await startStorefrontDirectPayment({
            billing: {
              name: customerName,
              email: customerEmail,
              phone: customerPhone
            },
            paymentSession
          });
          setQrphPaymentSession(paymentSession);
          if (typeof window !== 'undefined') window.location.assign(directPayment.redirectUrl);
        } else {
          setQrphPaymentSession(paymentSession);
        }
        if (!isStorefrontDirectPaymentSession(paymentSession)
          && isStorefrontHostedPaymentType(fnbPaymentType)
          && paymentSession.checkout_url
          && typeof window !== 'undefined') {
          window.location.assign(paymentSession.checkout_url);
        } else if (!isStorefrontDirectPaymentSession(paymentSession)) {
          toast.success(fnbPaymentType === 'qrph'
            ? 'QR Ph payment created. Complete the PayMongo test payment to continue.'
            : `${getStorefrontOnlinePaymentLabel(fnbPaymentType)} payment created. Complete it on PayMongo to continue.`);
        }
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

      setCheckoutResult({ ...data, cart_lines: cartSnapshot, totals: resolveTrackedTotals(data?.order, totalsForDisplay) });
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
          // #747: prefer the server-persisted total over the client's pre-submission snapshot --
          // see useCheckoutSubmission.js's own note for the full reasoning (same bug, ported here).
          total_amount: data?.order?.total_amount ?? totalsForDisplay?.total_amount ?? 0,
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
