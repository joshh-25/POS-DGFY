import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../packages/web-core/src/observability/analyticsEvents.js';
import {
  createStorefrontOnlinePaymentSession,
  getStorefrontOnlinePaymentLabel,
  isStorefrontDirectCardPaymentSession,
  isStorefrontDirectPaymentSession,
  isStorefrontHostedPaymentType,
  isStorefrontOnlinePaymentType,
  startStorefrontDirectPayment
} from '../services/storefrontOnlinePaymentSession.js';
// Phase 142 (#823): this is the widened extraction (carries amount_paid/balance_due through, not
// just total_amount) into a shared model both this hook and useFnbCheckoutSubmission.js consume.
// #857 separately restored a plain, un-widened inline copy of this same RF-1 fix directly on
// `develop` (import elided there since #844 owns the widened extraction) -- this branch's own
// copy supersedes that inline one; no functional loss, since this is a strict superset.
import { resolveTrackedTotals } from '../model/trackedTotals.js';
import { GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE } from '../checkout/model/guestCheckoutOtp.js';
import { requiresBillingEmail } from '../../checkout/checkoutValidation.js';

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
  isRetailMode,
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
  serviceOrderMethod,
  servicesLocalSimulationEnabled,
  isServicesLocalSimulationMethod,
  createServicesLocalSimulation,
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
    if (checkoutBlockReason === 'no_fulfillment_method') {
      // #1093: mirrors useFnbCheckoutSubmission.js's own copy of this reason code -- shouldn't
      // normally be reachable (see checkoutRules.js's own comment), but this is the honest,
      // actionable fallback rather than a silent no-op Place Order click.
      const message = 'This store is not accepting delivery or pickup orders online right now.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (checkoutBlockReason === 'business_hours') {
      setCheckoutError(storefrontClosedMessageBody);
      toast.error(storefrontClosedToastMessage);
      return;
    }
    if (requireQuoteForCheckout && !hasServiceCart && (checkoutBlockReason === 'missing_quote' || checkoutBlockReason === 'stale_quote')) {
      // Phase 142 (#823): this shared hook (unlike useFnbCheckoutSubmission.js's own copy of these
      // two reason codes) now also serves Simple/Retail, neither of which has an explicit "Quote"
      // button -- their totals quote automatically in the background on cart change. The block
      // itself is correct (a downpayment store's split is server-only and must be known before
      // Place Order), just rare and self-resolving; the message says so instead of directing the
      // shopper to a button that doesn't exist on those two modes.
      const message = 'Updating your order total -- please wait a moment and try again.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (requireQuoteForCheckout && !hasServiceCart && checkoutBlockReason === 'downpayment_zero_total') {
      // Phase 142 (#823): checkoutRules.js's own dedicated reason code -- see that file's comment.
      const message = 'This order total is fully covered by your discount -- contact the store to place it.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!hasServiceCart && (isServicesMode && activeBookingService) && !serviceAppointmentAt && serviceOrderMethod !== 'quote') {
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
      const message = GUEST_CHECKOUT_VERIFICATION_REQUIRED_MESSAGE;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    // #963: backstop for the card billing-email requirement. Each mode's payment step already
    // blocks submit and offers the input, but this is the one choke point every online-session
    // creation passes through -- without it a stale UI gate lands the customer on PayMongo's own
    // "billing email required" instead of a message they can act on.
    if (requiresBillingEmail({ paymentType: fnbPaymentType, customerEmail })) {
      const message = 'Add an email address before paying by card. Your card issuer needs it to authorize the payment.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    // Restored 2026-08-22 (#857) -- Services local-simulation preview, reverted by #853's develop
    // reconciliation while StorefrontApp.jsx kept passing this branch's own params unchanged
    // (servicesLocalSimulationEnabled/isServicesLocalSimulationMethod/createServicesLocalSimulation),
    // leaving them silently dead-wired.
    const shouldCreateLocalServicesSimulation = isServicesMode
      && servicesLocalSimulationEnabled
      && typeof isServicesLocalSimulationMethod === 'function'
      && isServicesLocalSimulationMethod(serviceOrderMethod);
    if (shouldCreateLocalServicesSimulation) {
      const localSimulation = createServicesLocalSimulation({
        customerAddress,
        customerEmail,
        customerName,
        customerPhone,
        fallbackAmount: totalsForDisplay?.total_amount,
        routeSlug,
        selectedStore,
        serviceAppointmentAt,
        serviceBookingLine,
        serviceCartLines,
        serviceOrderMethod
      });
      setCart([]);
      setSelectedServiceCartLineId('');
      setCheckoutResult(null);
      setTrackingPinInput(localSimulation.tracking_pin);
      setSelectedTrackingPin(localSimulation.tracking_pin);
      writeLastTrackingPinForStore(selectedStore?.slug || routeSlug, localSimulation.tracking_pin);
      setServiceAppointmentAt('');
      setServiceDraftQuantity(1);
      setServiceDraftNotes('');
      setServiceIntakeResponses({});
      setServicePaymentPreviewMethod('qr');
      setServicePaymentPreviewCard({ cardholder: '', cardNumber: '', expiry: '', cvv: '' });
      setServicePaymentPreviewReceiptName('');
      setShowOrderSuccessAnimation(false);
      setCheckoutTab('track');
      goStoreTrackPage({ pin: localSimulation.tracking_pin, serviceHandoff: serviceOrderMethod });
      clearCheckoutAuthResumeDraft();
      toast.success('Local Services preview created. No backend booking was submitted.');
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
          serviceAppointmentAt,
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
      // Phase 142 (#823): Retail now shares this online-session branch -- previously Simple-only,
      // Retail's payment step was a cash-only placeholder with no path to create a payment
      // session at all.
      if (!wantsServicesSubmission && (isSimpleMode || isRetailMode) && isStorefrontOnlinePaymentType(fnbPaymentType)) {
        if (qrphPaymentSession?.payment_session_id) {
          const message = 'An online payment is already awaiting confirmation. Refresh its status or choose another payment method after it finishes.';
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
      const submitProductCheckout = () => requestJson('/api/v1/store/checkout', {
        method: 'POST',
        storeSlug: selectedStore.slug,
        authToken,
        body: {
          // Restored 2026-08-22 (#857) -- #853's develop reconciliation passed a second positional
          // arg here, but buildPayload (useFnbCheckoutQuote.js) takes a single options object; the
          // override was silently discarded and a mixed product+service cart submitted its service
          // lines into the product order.
          ...checkoutPayload({ cartOverride: hasMixedCart ? productCartLines : undefined }),
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
            totals: resolveTrackedTotals(productData?.order, totalsForDisplay)
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
              // #747: prefer the server-persisted total over the client's pre-submission snapshot
              // -- the client value doesn't reflect a just-applied voucher discount, and
              // retailTrackingPayload.js's own `??` chain would otherwise let this poisoned
              // top-level field shadow the correct nested order.total_amount.
              total_amount: productData?.order?.total_amount ?? totalsForDisplay?.total_amount ?? 0
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
        totals: resolveTrackedTotals(data?.order, totalsForDisplay)
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
          // #747: see the partial-booking-failure branch above for why -- same fix, same reasoning.
          total_amount: data?.order?.total_amount ?? totalsForDisplay?.total_amount ?? 0
        }, data.tracking_pin);
        if (!isSimpleMode) {
          setCheckoutTab('track');
        }
      }
      const serviceBookingReferences = isServicesMode
        ? [
          data?.booking?.public_reference,
          ...(Array.isArray(data?.bookings) ? data.bookings.map((booking) => booking?.public_reference) : [])
        ]
          .map((reference) => String(reference || '').trim().toUpperCase())
          .filter(Boolean)
        : [];
      const submittedServiceTrackingPin = serviceBookingReferences[0] || '';
      if (submittedServiceTrackingPin) {
        setTrackingPinInput(submittedServiceTrackingPin);
        setSelectedTrackingPin(submittedServiceTrackingPin);
        writeLastTrackingPinForStore(selectedStore?.slug || routeSlug, submittedServiceTrackingPin);
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
      const trackingPinToOpen = isServicesMode ? submittedServiceTrackingPin : submittedTrackingPin;
      if ((isServicesMode && submittedServiceTrackingPin) || (submittedTrackingPin && !hasServiceCart)) {
        setShowOrderSuccessAnimation(false);
        if (orderSuccessAnimationTimerRef.current) {
          window.clearTimeout(orderSuccessAnimationTimerRef.current);
          orderSuccessAnimationTimerRef.current = null;
        }
        setCheckoutResult(null);
        goStoreTrackPage({
          pin: trackingPinToOpen,
          serviceHandoff: isServicesMode ? serviceOrderMethod : ''
        });
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
