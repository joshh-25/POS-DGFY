import { useEffect } from 'react';

/**
 * Moved verbatim from `StorefrontApp.jsx`: the checkout-auth-resume
 * *restore* effect (the counterpart to `persistCheckoutAuthResume`, moved
 * separately into `useCustomerAuthNavigation`). The two only ever share an
 * implicit localStorage contract through `writeCheckoutAuthResumeDraft`/
 * `readCheckoutAuthResumeDraft` - no live JS reference - so this can move
 * independently without touching the write side.
 */
export function useCheckoutAuthResumeRestore({
  catalog,
  clearCheckoutAuthResumeDraft,
  hasAppliedCheckoutAuthResume,
  isDgfyCustomerSignedIn,
  readCheckoutAuthResumeDraft,
  routeSlug,
  selectedStore,
  setCart,
  setCheckoutTab,
  setCustomerAddress,
  setCustomerPin,
  setDeliveryLocationAction,
  setFnbOrderStep,
  setFnbScheduleMode,
  setFnbScheduledFor,
  setFnbSpecialInstructions,
  setHasAppliedCheckoutAuthResume,
  setIsCheckoutOpen,
  setOrderMethod,
  setResolvedDeliveryAddress,
  setSelectedLocationId,
  setSelectedSavedLocationId,
  setSelectedServiceDetail,
  setServiceAppointmentAt,
  setServiceBookingStep,
  setServiceIntakeResponses,
  setServiceLocationLandmarkNote,
  setServicePaymentTiming,
  setSimpleOrderStep,
  toSlug,
  toast
}) {
  useEffect(() => {
    if (typeof window === 'undefined' || hasAppliedCheckoutAuthResume || !isDgfyCustomerSignedIn) return;
    const draft = readCheckoutAuthResumeDraft();
    const normalizedDraftSlug = toSlug(draft?.routeSlug || '');
    const normalizedCurrentSlug = toSlug(selectedStore?.slug || routeSlug || '');
    if (!draft || !normalizedDraftSlug || !normalizedCurrentSlug || normalizedDraftSlug !== normalizedCurrentSlug) return;
    setCart(Array.isArray(draft.cart) ? draft.cart : []);
    if (draft.selectedLocationId != null) setSelectedLocationId(draft.selectedLocationId);
    if (draft.selectedSavedLocationId) setSelectedSavedLocationId(draft.selectedSavedLocationId);
    if (draft.orderMethod) setOrderMethod(draft.orderMethod);
    if (draft.fnbScheduledFor) setFnbScheduledFor(draft.fnbScheduledFor);
    if (draft.fnbScheduleMode) setFnbScheduleMode(draft.fnbScheduleMode);
    if (draft.fnbSpecialInstructions) setFnbSpecialInstructions(draft.fnbSpecialInstructions);
    if (draft.serviceAppointmentAt) setServiceAppointmentAt(draft.serviceAppointmentAt);
    if (draft.servicePaymentTiming) setServicePaymentTiming(draft.servicePaymentTiming);
    if (draft.customerAddress) setCustomerAddress(draft.customerAddress);
    if (draft.serviceLocationLandmarkNote) setServiceLocationLandmarkNote(draft.serviceLocationLandmarkNote);
    if (draft.resolvedDeliveryAddress) setResolvedDeliveryAddress(draft.resolvedDeliveryAddress);
    if (draft.deliveryLocationAction) setDeliveryLocationAction(draft.deliveryLocationAction);
    if (draft.customerPin) setCustomerPin(draft.customerPin);
    if (draft.serviceIntakeResponses && typeof draft.serviceIntakeResponses === 'object') {
      setServiceIntakeResponses(draft.serviceIntakeResponses);
    }
    const nextFnbStep = draft.checkoutTab === 'cart' ? 3 : null;
    const nextSimpleStep = draft.checkoutTab === 'checkout' && !draft.selectedServiceItemId ? 1 : null;
    const nextServiceStep = draft.selectedServiceItemId ? 1 : null;
    if (Number.isInteger(nextFnbStep) && nextFnbStep > 0) setFnbOrderStep(nextFnbStep);
    if (Number.isInteger(nextSimpleStep) && nextSimpleStep > 0) setSimpleOrderStep(nextSimpleStep);
    if (Number.isInteger(nextServiceStep) && nextServiceStep > 0) setServiceBookingStep(nextServiceStep);
    if (draft.checkoutTab) {
      setCheckoutTab(draft.selectedServiceItemId ? 'checkout' : draft.checkoutTab);
    }
    if (draft.selectedServiceItemId && Array.isArray(catalog) && catalog.length > 0) {
      const matchedService = catalog.find((item) => Number(item?.item_id) === Number(draft.selectedServiceItemId)) || null;
      if (matchedService) setSelectedServiceDetail(matchedService);
    }
    setIsCheckoutOpen(true);
    setHasAppliedCheckoutAuthResume(true);
    clearCheckoutAuthResumeDraft();
    toast.success('Signed in. Resuming your checkout.');
  }, [
    catalog,
    hasAppliedCheckoutAuthResume,
    isDgfyCustomerSignedIn,
    routeSlug,
    selectedStore?.slug
  ]);
}
