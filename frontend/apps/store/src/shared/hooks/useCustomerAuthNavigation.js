import { useCallback } from 'react';

/**
 * Moved verbatim from `StorefrontApp.jsx`: the customer-auth/dashboard
 * navigation cluster (`buildCustomerDashboardReturnUrl`,
 * `openCustomerDashboard`, `openAccountPanel`,
 * `buildContextualCustomerReturnUrl`, `persistCheckoutAuthResume`,
 * `openCanonicalDgfyAuth`, `openStorefrontHeaderAccount`,
 * `openCheckoutAuthFlow`, `openBusinessRegistrationFlow`).
 *
 * These seven closures reference each other, so they move as one unit.
 * `openBusinessRegistrationFlow` is hoisted here from its original position
 * (after the unmoved guest-checkout-OTP block) — nothing in between depends
 * on it, and all of its own dependencies were already available at this
 * hook's new call site, so this is a pure "group + hoist," not a behavior
 * change.
 *
 * `openCheckoutAuthFlow` is read by a lazy getter
 * (`getOpenCheckoutAuthFlow: () => openCheckoutAuthFlow`) elsewhere in the
 * shell, declared before this hook's call site — that idiom is untouched by
 * this move, since it only ever reads the shell's local `const
 * openCheckoutAuthFlow` binding (now assigned from this hook's return)
 * inside a deferred closure.
 *
 * The checkout-auth-resume *write* (`persistCheckoutAuthResume`, here) and
 * *restore* (a separate `useEffect` left in the shell) only share an
 * implicit contract through `writeCheckoutAuthResumeDraft`/
 * `readCheckoutAuthResumeDraft` (localStorage), not a live JS reference —
 * so extracting the write half doesn't touch the restore effect.
 */
export function useCustomerAuthNavigation({
  activeServiceCartLine,
  buildBusinessRegistrationUrl,
  buildDgfyAuthUrl,
  cart,
  checkoutTab,
  customerAddress,
  customerPin,
  deliveryLocationAction,
  dgfyAuthToken,
  firstServiceLine,
  fnbOrderStep,
  fnbScheduleMode,
  fnbScheduledFor,
  fnbSpecialInstructions,
  hasDgfyExplicitSignOut,
  isDgfyCustomerSignedIn,
  normalizeStorefrontErrorMessage,
  orderMethod,
  readDgfySignedOutEmail,
  requestJson,
  resolveStorefrontAccountUrl,
  resolvedDeliveryAddress,
  routeSlug,
  selectedLocationId,
  selectedSavedLocationId,
  selectedServiceDetail,
  selectedStore,
  serviceAppointmentAt,
  serviceBookingStep,
  serviceIntakeResponses,
  serviceLocationLandmarkNote,
  servicePaymentTiming,
  setIsCheckoutOpen,
  setIsGuestTrackingDrawerOpen,
  simpleOrderStep,
  toast,
  writeCheckoutAuthResumeDraft
}) {
  const buildCustomerDashboardReturnUrl = useCallback(() => (
    resolveStorefrontAccountUrl()
  ), [resolveStorefrontAccountUrl]);
  const openCustomerDashboard = useCallback(() => {
    if (typeof window === 'undefined') return;
    const target = new URL(buildCustomerDashboardReturnUrl(), window.location.href);
    if (target.origin === window.location.origin) {
      window.history.pushState({}, '', `${target.pathname}${target.search}${target.hash}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    window.location.href = target.toString();
  }, [buildCustomerDashboardReturnUrl]);
  const openAccountPanel = useCallback(() => {
    setIsCheckoutOpen(false);
    setIsGuestTrackingDrawerOpen(false);
    openCustomerDashboard();
  }, [openCustomerDashboard, setIsCheckoutOpen, setIsGuestTrackingDrawerOpen]);
  const buildContextualCustomerReturnUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const target = new URL(window.location.href);
    target.searchParams.set('dgfy_account', '1');
    return target.toString();
  }, []);
  const persistCheckoutAuthResume = useCallback((resumeTarget = {}) => {
    writeCheckoutAuthResumeDraft({
      routeSlug: selectedStore?.slug || routeSlug,
      returnTo: buildContextualCustomerReturnUrl(),
      checkoutTab: resumeTarget.checkoutTab || checkoutTab || 'checkout',
      fnbOrderStep: resumeTarget.fnbOrderStep ?? fnbOrderStep,
      simpleOrderStep: resumeTarget.simpleOrderStep ?? simpleOrderStep,
      serviceBookingStep: resumeTarget.serviceBookingStep ?? serviceBookingStep,
      selectedLocationId,
      selectedSavedLocationId,
      orderMethod,
      fnbScheduledFor,
      fnbScheduleMode,
      fnbSpecialInstructions,
      serviceAppointmentAt,
      servicePaymentTiming,
      customerAddress,
      serviceLocationLandmarkNote,
      resolvedDeliveryAddress,
      deliveryLocationAction,
      customerPin,
      serviceIntakeResponses,
      cart,
      selectedServiceItemId: selectedServiceDetail?.item_id || activeServiceCartLine?.item_id || firstServiceLine?.item_id || null,
      savedAt: Date.now()
    });
  }, [
    buildContextualCustomerReturnUrl,
    cart,
    checkoutTab,
    customerAddress,
    customerPin,
    deliveryLocationAction,
    fnbOrderStep,
    fnbScheduleMode,
    fnbScheduledFor,
    fnbSpecialInstructions,
    activeServiceCartLine?.item_id,
    firstServiceLine?.item_id,
    orderMethod,
    resolvedDeliveryAddress,
    routeSlug,
    selectedLocationId,
    selectedSavedLocationId,
    selectedServiceDetail?.item_id,
    selectedStore?.slug,
    serviceAppointmentAt,
    serviceBookingStep,
    serviceIntakeResponses,
    serviceLocationLandmarkNote,
    servicePaymentTiming,
    simpleOrderStep,
    writeCheckoutAuthResumeDraft
  ]);
  const openCanonicalDgfyAuth = useCallback((intent = 'customer', mode = 'sign-in', { returnTarget = 'account', reason = '', email = '' } = {}) => {
    if (typeof window === 'undefined') return;
    const normalizedIntent = String(intent || '').trim() === 'register-business' ? 'register-business' : 'customer';
    const normalizedMode = String(mode || '').trim() === 'create-account' ? 'create-account' : 'sign-in';
    const signedOutEmail = readDgfySignedOutEmail();
    const explicitSignedOutLogin = normalizedIntent === 'customer'
      && normalizedMode === 'sign-in'
      && hasDgfyExplicitSignOut();
    window.location.href = buildDgfyAuthUrl({
      intent: normalizedIntent,
      mode: normalizedMode,
      returnTo: normalizedIntent === 'customer'
        ? (returnTarget === 'current' ? buildContextualCustomerReturnUrl() : buildCustomerDashboardReturnUrl())
        : '/register-company#business-registration'
        ,
      reason: reason || (explicitSignedOutLogin ? 'signed-out' : ''),
      email: email || (explicitSignedOutLogin ? signedOutEmail : '')
    });
  }, [buildContextualCustomerReturnUrl, buildCustomerDashboardReturnUrl, buildDgfyAuthUrl, hasDgfyExplicitSignOut, readDgfySignedOutEmail]);
  const openStorefrontHeaderAccount = useCallback(() => {
    setIsCheckoutOpen(false);
    setIsGuestTrackingDrawerOpen(false);
    if (isDgfyCustomerSignedIn) {
      openCustomerDashboard();
      return;
    }
    openCanonicalDgfyAuth('customer');
  }, [isDgfyCustomerSignedIn, openCanonicalDgfyAuth, openCustomerDashboard, setIsCheckoutOpen, setIsGuestTrackingDrawerOpen]);
  const openCheckoutAuthFlow = useCallback((mode = 'create-account', resumeTarget = {}) => {
    persistCheckoutAuthResume(resumeTarget);
    openCanonicalDgfyAuth('customer', mode, { returnTarget: 'current' });
  }, [openCanonicalDgfyAuth, persistCheckoutAuthResume]);
  const openBusinessRegistrationFlow = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!isDgfyCustomerSignedIn) {
      openCanonicalDgfyAuth('register-business');
      return;
    }
    try {
      const payload = await requestJson('/api/v1/dgfy/auth/handoff', {
        method: 'POST',
        authToken: dgfyAuthToken,
        cache: 'no-store'
      });
      window.location.href = buildBusinessRegistrationUrl(String(payload?.handoff_token || '').trim());
    } catch (error) {
      toast.error(normalizeStorefrontErrorMessage(error, 'Unable to start business registration.'));
    }
  }, [buildBusinessRegistrationUrl, dgfyAuthToken, isDgfyCustomerSignedIn, normalizeStorefrontErrorMessage, openCanonicalDgfyAuth, requestJson, toast]);

  return {
    buildContextualCustomerReturnUrl,
    buildCustomerDashboardReturnUrl,
    openAccountPanel,
    openBusinessRegistrationFlow,
    openCanonicalDgfyAuth,
    openCheckoutAuthFlow,
    openCustomerDashboard,
    openStorefrontHeaderAccount,
    persistCheckoutAuthResume
  };
}
