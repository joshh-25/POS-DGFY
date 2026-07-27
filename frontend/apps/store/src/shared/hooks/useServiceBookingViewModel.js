/**
 * Moved verbatim from `StorefrontApp.jsx`: the service-booking handlers
 * (`handleServicesCartCheckout`, `openServiceBookingPanel`,
 * `openServiceCartEditor`, `saveServiceBookingDraft`).
 *
 * Call-site ordering note: in the shell, `goStoreBookingPage` is one of the
 * values returned by the later `useStorefrontNavigation()` call, which
 * happens AFTER this block's original position. These handlers only ever
 * *call* `goStoreBookingPage` inside a deferred closure (a user action,
 * always after the render that declared it has completed) — never read it
 * synchronously — so the shell hands this hook a lazy getter
 * (`getGoStoreBookingPage`), the same forward-reference idiom used for
 * `getGoStoreTrackPage`/`getFetchTrackingPayload` elsewhere in this file.
 * Every other dependency below is read-only state/derivations or setters
 * already declared earlier in the shell, so this hook's call site is not
 * otherwise position-constrained.
 */
export function useServiceBookingViewModel({
  accessCapabilities,
  bookingPermitted,
  cart,
  createStorefrontIdempotencyKey,
  getGoStoreBookingPage,
  hasServiceCart,
  isServicesMode,
  missingRequiredSelectedServiceIntake,
  selectedServiceCartLineId,
  selectedServiceDetail,
  selectedServiceIntakeFields,
  serviceAppointmentAt,
  serviceCartLines,
  serviceDraftNotes,
  serviceDraftQuantity,
  serviceIntakeResponses,
  servicePaymentOptions,
  servicePaymentTiming,
  setCart,
  setCheckoutError,
  setCheckoutTab,
  setIsCheckoutOpen,
  setQuoteError,
  setQuoteNeedsRefresh,
  setQuoteResult,
  setSelectedServiceCartLineId,
  setSelectedServiceDetail,
  setServiceAppointmentAt,
  setServiceDraftNotes,
  setServiceDraftQuantity,
  setServiceIntakeResponses,
  setServicePaymentTiming,
  storefrontClosedByHours,
  storefrontClosedMessageBody,
  storefrontClosedToastMessage,
  toast,
  withAssetOrigin
}) {
  const handleServicesCartCheckout = () => {
    if (cart.length === 0) {
      toast.error('Your cart is empty.');
      return;
    }
    if (!hasServiceCart || serviceCartLines.length === 0) {
      toast.error('Add a service to your cart first.');
      return;
    }
    setIsCheckoutOpen(false);
    const goStoreBookingPage = getGoStoreBookingPage();
    goStoreBookingPage();
  };

  const openServiceBookingPanel = (nextTab = 'review') => {
    setCheckoutTab(nextTab);
    setIsCheckoutOpen(true);
  };

  const openServiceCartEditor = (line) => {
    if (!line) return;
    setSelectedServiceCartLineId(String(line.cart_line_id || ''));
    setSelectedServiceDetail({
      ...line,
      item_id: line.item_id,
      service_detail: line.service_detail || null
    });
    setServiceAppointmentAt(String(line.service_schedule_at || ''));
    setServiceDraftQuantity(Math.max(1, Number(line.quantity || 1)));
    setServiceDraftNotes(String(line.service_notes || ''));
    setServiceIntakeResponses(line?.intake_responses && typeof line.intake_responses === 'object' ? line.intake_responses : {});
    setServicePaymentTiming(String(line.payment_timing || servicePaymentOptions[0]?.value || 'postpaid'));
    if (isServicesMode) {
      const goStoreBookingPage = getGoStoreBookingPage();
      goStoreBookingPage({ preserveSelectedService: true });
    }
  };

  const saveServiceBookingDraft = (serviceItem = selectedServiceDetail, nextTab = 'review') => {
    if (!serviceItem) return;
    if (storefrontClosedByHours) {
      setCheckoutError(storefrontClosedMessageBody);
      toast.error(storefrontClosedToastMessage);
      return;
    }
    if (!bookingPermitted || accessCapabilities.booking === false) {
      const message = 'This storefront is not accepting service bookings right now.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (!serviceAppointmentAt) {
      const message = 'Choose a preferred appointment date and time before adding this booking.';
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    if (missingRequiredSelectedServiceIntake.length > 0) {
      const message = `Complete required intake question: ${missingRequiredSelectedServiceIntake[0].label}`;
      setCheckoutError(message);
      toast.error(message);
      return;
    }
    const targetCartLineId = String(selectedServiceCartLineId || '');
    const nextServiceLine = {
      item_id: serviceItem.item_id,
      cart_line_id: targetCartLineId || createStorefrontIdempotencyKey(`service-line-${serviceItem.item_id}`),
      name: serviceItem.name,
      variantName: serviceItem.variantName || '',
      category: 'service',
      service_detail: serviceItem.service_detail || null,
      quantity: Math.max(1, Number(serviceDraftQuantity || 1)),
      price: Number(serviceItem.default_sale_price ?? 0),
      image_url: withAssetOrigin(serviceItem.image_url) || null,
      unit_of_measure: serviceItem.unit_of_measure || '',
      max_stock: Number.POSITIVE_INFINITY,
      service_notes: String(serviceDraftNotes || '').trim(),
      service_schedule_at: serviceAppointmentAt,
      payment_timing: servicePaymentTiming,
      intake_responses: selectedServiceIntakeFields.length > 0 ? serviceIntakeResponses : null
    };
    setCart((previous) => {
      const hasExistingTarget = targetCartLineId
        && previous.some((line) => String(line.cart_line_id || '') === targetCartLineId);
      if (hasExistingTarget) {
        return previous.map((line) => (
          String(line.cart_line_id || '') === targetCartLineId
            ? nextServiceLine
            : line
        ));
      }
      return [...previous, nextServiceLine];
    });
    setSelectedServiceCartLineId(String(nextServiceLine.cart_line_id || ''));
    setCheckoutError('');
    setQuoteError('');
    setQuoteResult(null);
    setQuoteNeedsRefresh(true);
    setSelectedServiceDetail(null);
    if (isServicesMode) {
      const goStoreBookingPage = getGoStoreBookingPage();
      goStoreBookingPage();
    } else {
      openServiceBookingPanel(nextTab);
    }
    toast.success(targetCartLineId ? 'Booking line updated.' : 'Service added to your booking summary.');
  };

  return {
    handleServicesCartCheckout,
    openServiceBookingPanel,
    openServiceCartEditor,
    saveServiceBookingDraft
  };
}
