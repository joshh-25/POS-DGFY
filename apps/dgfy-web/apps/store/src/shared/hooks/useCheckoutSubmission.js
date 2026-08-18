import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../src/observability/analyticsEvents.js';
import {
  createStorefrontOnlinePaymentSession,
  getStorefrontOnlinePaymentLabel,
  isStorefrontHostedPaymentType,
  isStorefrontOnlinePaymentType
} from '../services/storefrontOnlinePaymentSession.js';

/**
 * Moved verbatim from `StorefrontApp.jsx`: the checkout-submission handlers
 * (`handleQuote`, `handleCheckout`, `handleDownloadCheckoutImage`).
 *
 * All dependencies here are plain read-only state/derivations or setters
 * already declared earlier in the shell (verified by grep against every
 * identifier referenced below) — no ordering cycle, no lazy getter needed,
 * unlike `useServiceBookingViewModel`'s `goStoreBookingPage` dependency.
 * `goStoreTrackPage` in particular is declared early in the shell (its own
 * standalone handler, not part of the later `useStorefrontNavigation()`
 * destructure), so it's taken as a plain param.
 */
export function useCheckoutSubmission({
  accessCapabilities,
  activeBookingService,
  activeServiceCartLine,
  bookingFieldPlan,
  bookingPageIntakeFields,
  bookingPageMissingRequiredIntake,
  buildStockExceededMessage,
  buildTicketImage,
  cart,
  checkoutBlockReason,
  checkoutPayload,
  checkoutPermitted,
  checkoutResult,
  clearCheckoutAuthResumeDraft,
  createStorefrontIdempotencyKey,
  customerAddress,
  customerEmail,
  customerName,
  customerPhone,
  DGFY_BRAND_NAME,
  downloadDataUrl,
  extractStockViolation,
  fnbPaymentType,
  formatServicesBookingFailureMessage,
  goStoreTrackPage,
  guestCheckoutIntentId,
  guestCheckoutOtpVerified,
  guestCheckoutProof,
  handleFnbCheckout,
  handleLoadAccountPanel,
  hasServiceCart,
  isDgfyCustomerSignedIn,
  isFnbMode,
  isServicesMode,
  isSimpleMode,
  missingCustomerInformation,
  missingScheduleAndServiceInfo,
  normalizeStorefrontErrorMessage,
  orderMethod,
  orderSuccessAnimationTimerRef,
  productCartLines,
  qrphIdempotencyKey,
  qrphPaymentSession,
  readDgfyAuthToken,
  readStoreAuthToken,
  rememberCustomerDetails,
  requestJson,
  requestQuote,
  requireQuoteForCheckout,
  resolveServicesBookingSubmitContract,
  resolvedCustomerFirstName,
  resolvedCustomerLastName,
  routeSlug,
  selectedLocationId,
  selectedStore,
  serviceAppointmentAt,
  serviceCartLines,
  serviceCartValidationIssues,
  serviceDraftQuantity,
  servicePaymentTiming,
  serviceIntakeResponses,
  setCart,
  setCheckoutError,
  setCheckoutLoading,
  setCheckoutPromoCode,
  setCheckoutResult,
  setCheckoutTab,
  setFnbOrderStep,
  setQuoteError,
  setQuoteNeedsRefresh,
  setQuoteResult,
  setQrphPaymentSession,
  setSavedCustomerDetails,
  setSelectedServiceCartLineId,
  setSelectedTrackingPin,
  setServiceAppointmentAt,
  setServiceDraftNotes,
  setServiceDraftQuantity,
  setServiceIntakeResponses,
  setServicePaymentPreviewCard,
  setServicePaymentPreviewMethod,
  setServicePaymentPreviewReceiptName,
  setShowOrderSuccessAnimation,
  setSimpleOrderStep,
  setTrackingPinInput,
  storefrontClosedByHours,
  storefrontClosedMessageBody,
  storefrontClosedToastMessage,
  syncTrackedOrderSnapshot,
  toast,
  totalsForDisplay,
  withAssetOrigin,
  writeLastTrackingPinForStore,
  writeSavedCustomerDetails
}) {
  const handleQuote = async () => {
    if (!selectedStore) return;
    setQuoteError('');
    if (storefrontClosedByHours) {
      setQuoteError(storefrontClosedMessageBody);
      toast.error(storefrontClosedToastMessage);
      return;
    }
    if (!checkoutPermitted || accessCapabilities.quote === false) {
      const message = 'This storefront is not accepting online checkout right now.';
      setQuoteError(message);
      toast.error(message);
      return;
    }
    try {
      await requestQuote();
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setQuoteError(message);
        toast.error(message);
        return;
      }
      const message = normalizeStorefrontErrorMessage(error, 'Unable to compute quote.');
      setQuoteError(message);
      toast.error(message);
    }
  };

  const handleCheckout = async () => {
    if (!selectedStore) return;
    if (isFnbMode && !hasServiceCart) {
      return handleFnbCheckout();
    }
    setCheckoutError('');
    setCheckoutResult(null);
    const serviceBookingLine = hasServiceCart
      ? activeServiceCartLine
      : (isServicesMode && activeBookingService
        ? {
          item_id: activeBookingService.item_id,
          name: activeBookingService.name,
          variantName: activeBookingService.variantName || '',
          category: 'service',
          service_detail: activeBookingService.service_detail || null,
          quantity: Math.max(1, Number(serviceDraftQuantity || 1)),
          price: Number(activeBookingService.default_sale_price ?? 0),
          image_url: withAssetOrigin(activeBookingService.image_url) || null,
          unit_of_measure: activeBookingService.unit_of_measure || '',
          max_stock: Number.POSITIVE_INFINITY,
          service_notes: '',
          service_schedule_at: serviceAppointmentAt,
          payment_timing: servicePaymentTiming,
          intake_responses: bookingPageIntakeFields.length > 0 ? serviceIntakeResponses : null
        }
        : null);
    if (checkoutBlockReason === 'stock_violation') {
      const message = 'Cannot checkout: one or more items exceed current stock.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (checkoutBlockReason === 'access_mode') {
      const message = 'This storefront is not accepting online checkout right now.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (checkoutBlockReason === 'business_hours') {
      setCheckoutError(storefrontClosedMessageBody);
      toast.error(storefrontClosedToastMessage);
      return;
    }
    if (requireQuoteForCheckout && !hasServiceCart && checkoutBlockReason === 'missing_quote') {
      const message = 'Please click Quote first before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (requireQuoteForCheckout && !hasServiceCart && checkoutBlockReason === 'stale_quote') {
      const message = 'Your cart changed. Please refresh Quote before checkout.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!hasServiceCart && (isServicesMode && activeBookingService) && !serviceAppointmentAt) {
      const message = 'Choose an appointment date and time before booking.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (isServicesMode && missingCustomerInformation.length > 0) {
      const message = `Complete "${missingCustomerInformation[0]}" before booking.`;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (isServicesMode && missingScheduleAndServiceInfo.length > 0) {
      const message = `Complete "${missingScheduleAndServiceInfo[0]}" before booking.`;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if ((hasServiceCart && serviceCartValidationIssues.length > 0) || (!hasServiceCart && isServicesMode && bookingPageMissingRequiredIntake.length > 0)) {
      const message = hasServiceCart
        ? serviceCartValidationIssues[0]?.message || 'Complete the required booking details before continuing.'
        : `Complete required intake question: ${bookingPageMissingRequiredIntake[0].label}`;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!isDgfyCustomerSignedIn && (!guestCheckoutOtpVerified || !guestCheckoutProof?.proof)) {
      const message = 'Verify your email before placing this order.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    const cartSnapshot = cart.map((line) => ({ ...line }));
    const hasMixedCart = hasServiceCart && Array.isArray(productCartLines) && productCartLines.length > 0;
    setCheckoutLoading(true);
    trackFunnelEvent(ANALYTICS_EVENTS.CHECKOUT_SUBMITTED, {
      store_slug: selectedStore?.slug,
      order_value: totalsForDisplay?.total_amount ?? 0,
      item_count: cartSnapshot.length,
      fulfillment_type: orderMethod,
      has_service_cart: hasServiceCart,
      has_mixed_cart: hasMixedCart
    });
    let checkoutStage = 'checkout';
    try {
      const authToken = isDgfyCustomerSignedIn
        ? (readDgfyAuthToken() || readStoreAuthToken())
        : readStoreAuthToken();
      const wantsServicesSubmission = hasServiceCart || (isServicesMode && serviceBookingLine);
      const guestIdempotencyKey = isDgfyCustomerSignedIn
        ? null
        : String(guestCheckoutIntentId || '').trim();
      const guestCheckoutProofValue = isDgfyCustomerSignedIn
        ? null
        : guestCheckoutProof?.proof || null;
      let servicesSubmitContract = null;
      if (wantsServicesSubmission) {
        servicesSubmitContract = resolveServicesBookingSubmitContract({
          hasServiceCart,
          serviceCartLines,
          serviceBookingLine,
          customerName,
          customerEmail,
          customerPhone,
          selectedLocationId,
          storeLocationId: selectedStore?.location_id,
          paymentTiming: servicePaymentTiming,
          serviceIntakeResponses,
          bookingPageIntakeFields,
          customerAddress,
          bookingFieldPlan,
          createIdempotencyKey: createStorefrontIdempotencyKey
        });
        if (!servicesSubmitContract.compatible) {
          setCheckoutError(servicesSubmitContract.message);
          toast.error(servicesSubmitContract.message);
          return;
        }
        servicesSubmitContract = {
          ...servicesSubmitContract,
          body: {
            ...servicesSubmitContract.body,
            idempotency_key: guestIdempotencyKey || servicesSubmitContract.body?.idempotency_key,
            guest_checkout_proof: guestCheckoutProofValue
          }
        };
      }
      if (!wantsServicesSubmission && isSimpleMode && isStorefrontOnlinePaymentType(fnbPaymentType)) {
        if (qrphPaymentSession?.payment_session_id) {
          const message = 'An online payment is already awaiting confirmation. Refresh its status or choose cash instead.';
          setCheckoutError(message);
          toast.error(message);
          return;
        }

        const paymentSession = await createStorefrontOnlinePaymentSession({
          authToken,
          checkoutPayload: checkoutPayload(),
          guestCheckoutProof: guestCheckoutProofValue,
          idempotencyKey: isDgfyCustomerSignedIn
            ? qrphIdempotencyKey
            : guestCheckoutIntentId,
          paymentType: fnbPaymentType,
          requestJson,
          storeSlug: selectedStore.slug
        });
        setQrphPaymentSession(paymentSession);
        if (isStorefrontHostedPaymentType(fnbPaymentType) && paymentSession.checkout_url && typeof window !== 'undefined') {
          window.location.assign(paymentSession.checkout_url);
        } else {
          toast.success(fnbPaymentType === 'qrph'
            ? 'QR Ph payment created. Complete the PayMongo test payment to continue.'
            : `${getStorefrontOnlinePaymentLabel(fnbPaymentType)} payment created. Complete it on PayMongo to continue.`);
        }
        return;
      }
      const submitProductCheckout = () => requestJson('/api/v1/store/checkout', {
        method: 'POST',
        storeSlug: selectedStore.slug,
        authToken,
        body: {
          ...checkoutPayload(undefined, hasMixedCart ? productCartLines : undefined),
          idempotency_key: guestIdempotencyKey || window.crypto?.randomUUID?.() || `store-${Date.now()}`,
          guest_checkout_proof: guestCheckoutProofValue,
          payment_type: fnbPaymentType
        }
      });
      const submitServicesBooking = () => requestJson(servicesSubmitContract.route, {
        method: 'POST',
        storeSlug: selectedStore.slug,
        authToken,
        body: servicesSubmitContract.body
      });

      let productData = null;
      let servicesData = null;
      if (!wantsServicesSubmission) {
        productData = await submitProductCheckout();
      } else if (!hasMixedCart) {
        checkoutStage = 'booking';
        servicesData = await submitServicesBooking();
      } else {
        // ADR 0016 keeps a booking ticket and a payment receipt as distinct
        // documents, so a mixed cart submits as two requests rather than one.
        // Product checkout goes first; if it fails, nothing else has happened
        // yet, so the outer catch below behaves exactly like a pure
        // product-cart failure. If it succeeds but the booking leg then
        // fails, the product order already happened -- surface that partial
        // success instead of reporting a bare failure and losing the order.
        productData = await submitProductCheckout();
        checkoutStage = 'booking';
        try {
          servicesData = await submitServicesBooking();
        } catch (servicesError) {
          setCart((prev) => prev.filter((line) => line.category === 'service'));
          setCheckoutResult({
            ...productData,
            cart_lines: productCartLines,
            totals: totalsForDisplay
          });
          if (productData?.tracking_pin) {
            setTrackingPinInput(productData.tracking_pin);
            setSelectedTrackingPin(String(productData.tracking_pin || '').trim().toUpperCase());
            syncTrackedOrderSnapshot({
              tracking_pin: productData.tracking_pin,
              status: productData?.order?.status || 'placed',
              status_label: productData?.order?.status_label || 'Order placed',
              order_method: productData?.order?.order_method || orderMethod,
              order: productData?.order || null,
              order_name: productCartLines[0]?.variantName || productCartLines[0]?.name || '',
              total_amount: totalsForDisplay?.total_amount ?? 0
            }, productData.tracking_pin);
          }
          setQuoteResult(null);
          setQuoteNeedsRefresh(true);
          setCheckoutPromoCode('');
          clearCheckoutAuthResumeDraft();
          const message = `Your order was placed, but the service booking failed: ${formatServicesBookingFailureMessage(servicesError, serviceCartLines)}`;
          setCheckoutError(message);
          toast.error(message);
          // The product order genuinely went through here even though the
          // mixed-cart service booking leg failed -- still an order placed.
          trackFunnelEvent(ANALYTICS_EVENTS.ORDER_PLACED, {
            store_slug: selectedStore?.slug,
            order_value: totalsForDisplay?.total_amount ?? 0,
            item_count: productCartLines.length,
            fulfillment_type: productData?.order?.order_method || orderMethod,
            partial_booking_failure: true
          });
          return;
        }
      }
      const data = { ...productData, ...servicesData };
      setCheckoutResult({
        ...data,
        cart_lines: hasServiceCart && !hasMixedCart
          ? serviceCartLines
          : cartSnapshot,
        totals: totalsForDisplay
      });
      if (rememberCustomerDetails) {
        const persistedDetails = writeSavedCustomerDetails({
          firstName: resolvedCustomerFirstName,
          lastName: resolvedCustomerLastName,
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          source: isDgfyCustomerSignedIn ? 'account' : 'guest',
          updatedAt: Date.now()
        });
        if (persistedDetails) setSavedCustomerDetails(persistedDetails);
      }
      if (data?.tracking_pin) {
        setTrackingPinInput(data.tracking_pin);
        setSelectedTrackingPin(String(data.tracking_pin || '').trim().toUpperCase());
        syncTrackedOrderSnapshot({
          tracking_pin: data.tracking_pin,
          status: data?.order?.status || 'placed',
          status_label: data?.order?.status_label || 'Order placed',
          order_method: data?.order?.order_method || orderMethod,
          order: data?.order || null,
          order_name: cartSnapshot[0]?.variantName || cartSnapshot[0]?.name || '',
          total_amount: totalsForDisplay?.total_amount ?? 0
        }, data.tracking_pin);
        if (!isSimpleMode) {
          setCheckoutTab('track');
        }
      }
      if (data?.booking?.public_reference) {
        setTrackingPinInput(data.booking.public_reference);
        writeLastTrackingPinForStore(selectedStore?.slug || routeSlug, data.booking.public_reference);
      }
      setCart([]);
      if (hasServiceCart) {
        setSelectedServiceCartLineId('');
      }
      setQuoteResult(null);
      setQuoteNeedsRefresh(true);
      setCheckoutPromoCode('');
      setServiceAppointmentAt('');
      setServiceDraftQuantity(1);
      setServiceDraftNotes('');
      setServiceIntakeResponses({});
      setServicePaymentPreviewMethod('qr');
      setServicePaymentPreviewCard({ cardholder: '', cardNumber: '', expiry: '', cvv: '' });
      setServicePaymentPreviewReceiptName('');
      if (isDgfyCustomerSignedIn) {
        void handleLoadAccountPanel();
      }
      const submittedTrackingPin = String(data?.tracking_pin || '').trim().toUpperCase();
      if (submittedTrackingPin && !hasServiceCart) {
        setShowOrderSuccessAnimation(false);
        if (orderSuccessAnimationTimerRef.current) {
          window.clearTimeout(orderSuccessAnimationTimerRef.current);
          orderSuccessAnimationTimerRef.current = null;
        }
        setCheckoutResult(null);
        goStoreTrackPage({ pin: submittedTrackingPin });
      } else {
        setFnbOrderStep(4);
        if (isSimpleMode) {
          setSimpleOrderStep(4);
        }
      }
      clearCheckoutAuthResumeDraft();
      toast.success(
        hasMixedCart
          ? 'Order placed and booking created.'
          : hasServiceCart
            ? 'Bookings created.'
            : (data?.promo_feedback?.message || 'Checkout completed.')
      );
      trackFunnelEvent(ANALYTICS_EVENTS.ORDER_PLACED, {
        store_slug: selectedStore?.slug,
        order_value: totalsForDisplay?.total_amount ?? 0,
        item_count: cartSnapshot.length,
        fulfillment_type: data?.order?.order_method || orderMethod,
        has_service_cart: hasServiceCart,
        has_mixed_cart: hasMixedCart
      });
    } catch (error) {
      const violation = extractStockViolation(error);
      if (violation) {
        const message = buildStockExceededMessage(violation);
        setCheckoutError(message);
        toast.error(message);
        trackFunnelEvent(ANALYTICS_EVENTS.CHECKOUT_FAILED, {
          store_slug: selectedStore?.slug,
          reason: 'stock_violation',
          checkout_stage: checkoutStage
        });
        return;
      }
      const message = checkoutStage === 'booking'
        ? formatServicesBookingFailureMessage(error, serviceCartLines)
        : normalizeStorefrontErrorMessage(error, 'Unable to complete checkout.');
      setCheckoutError(message);
      toast.error(message);
      trackFunnelEvent(ANALYTICS_EVENTS.CHECKOUT_FAILED, {
        store_slug: selectedStore?.slug,
        reason: error?.errorCode || 'unknown',
        checkout_stage: checkoutStage
      });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleDownloadCheckoutImage = async () => {
    if (!checkoutResult) return;
    try {
      const reference = checkoutResult.booking?.public_reference || checkoutResult.tracking_pin || checkoutResult.order?.tracking_pin || 'ticket';
      const dataUrl = await buildTicketImage({
        result: checkoutResult,
        storeName: selectedStore?.tenant_name || routeSlug || DGFY_BRAND_NAME,
        cartLines: Array.isArray(checkoutResult.cart_lines) ? checkoutResult.cart_lines : cart,
        totals: checkoutResult.totals || totalsForDisplay
      });
      downloadDataUrl(dataUrl, `${String(reference).toLowerCase()}-ticket.png`);
    } catch {
      toast.error('Unable to generate ticket image.');
    }
  };

  return {
    handleCheckout,
    handleDownloadCheckoutImage,
    handleQuote
  };
}
