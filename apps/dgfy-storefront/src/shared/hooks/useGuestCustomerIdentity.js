import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  buildCustomerFullName,
  buildMaskedSavedCustomerPreview,
  clearSavedCustomerDetails,
  readSavedCustomerDetails,
  splitCustomerName
} from '../model/storefrontCustomerStorage.js';
import { createBlankGuestCustomerIdentity } from '../../checkout/guestCustomerDetailsState.js';
import { createCustomerIdentityRenderers } from '../../features/checkout/renderers/customerIdentityRenderers.jsx';

/**
 * Stateful hook that owns the guest/DGFY-account customer identity fields
 * used across checkout (F&B guest checkout, Services booking, dashboard
 * identity summaries). Moved verbatim from `StorefrontApp.jsx`: the
 * customerFirstName/customerLastName/customerName/customerPhone/
 * customerEmail state, the saved-customer-details state, the masked
 * preview + hasSavedCustomerDetails derivations, the guest-details
 * apply/open/cancel/apply handlers, the "clear saved details for this
 * device" handler, the DGFY-account identity-sync effect, and the
 * `createCustomerIdentityRenderers` wiring that produces
 * renderGuestIdentityFields/renderGuestCheckoutEntry/
 * renderAccountOwnedIdentitySummary.
 *
 * `accountIdentityRawName`/`accountIdentityRawPhone`/`accountIdentityRawEmail`
 * (from `useCustomerDashboardIdentity`), `isDgfyCustomerSignedIn` (from
 * `useStorefrontSession`), and the checkout/UI-chrome values consumed only
 * by the renderer wiring (`rememberCustomerDetails`, `guestDetailsEditMode`,
 * `isMobileViewport`, `servicesBodyFont`, `servicesDisplayFont`,
 * `customerAddress`, their setters, and `setGuestCheckoutUnlocked`) are NOT
 * owned by this hook and are taken as external parameters, unchanged.
 *
 * `getOpenCheckoutAuthFlow`/`getHandleSendGuestCheckoutOtp` are lazy
 * getters (the same forward-reference idiom already used for
 * `getGoStoreTrackPage`/`getFetchTrackingPayload` in
 * `useCustomerDashboardRuntime`/`useCustomerDashboardTracking`): in the
 * shell, `openCheckoutAuthFlow` and `handleRequestGuestCheckoutOtp` are
 * declared AFTER this hook is called (they depend on state that in turn
 * depends on this hook's own state), so the shell can only hand this hook
 * a closure that reads them later, not their value directly. Unlike the
 * `useCustomerDashboardTracking` precedent, the getters here are handed
 * straight to `createCustomerIdentityRenderers` (an external module) via a
 * plain deferred wrapper - not staged through a ref - since a ref whose
 * `.current` is reachable from a synchronous call into an external,
 * opaquely-analyzed function during render trips the
 * `react-hooks/refs` lint rule. The wrapper only calls the getter when the
 * wrapper itself is invoked (always later, from a click handler built by
 * `createCustomerIdentityRenderers`), by which time the real function is
 * always already assigned for that render.
 */
export function useGuestCustomerIdentity({
  accountIdentityRawName,
  accountIdentityRawPhone,
  accountIdentityRawEmail,
  isDgfyCustomerSignedIn,
  rememberCustomerDetails,
  guestDetailsEditMode,
  setGuestDetailsEditMode,
  setIsUsingDifferentGuestDetails,
  isMobileViewport,
  servicesBodyFont,
  servicesDisplayFont,
  checkoutAccent,
  checkoutAccentDark,
  checkoutAccentShadow,
  customerAddress,
  setCustomerAddress,
  setRememberCustomerDetails,
  setGuestCheckoutUnlocked,
  getOpenCheckoutAuthFlow,
  getHandleSendGuestCheckoutOtp
}) {
  const [customerFirstName, setCustomerFirstName] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [savedCustomerDetails, setSavedCustomerDetails] = useState(() => readSavedCustomerDetails());

  const maskedSavedCustomerPreview = useMemo(
    () => buildMaskedSavedCustomerPreview(savedCustomerDetails),
    [savedCustomerDetails]
  );
  const hasSavedCustomerDetails = Boolean(savedCustomerDetails && (savedCustomerDetails.name || savedCustomerDetails.phone || savedCustomerDetails.email));

  const applySavedCustomerDetails = useCallback(() => {
    if (!savedCustomerDetails) return;
    const splitName = splitCustomerName(savedCustomerDetails.name || '');
    setCustomerFirstName(savedCustomerDetails.firstName || splitName.firstName || '');
    setCustomerLastName(savedCustomerDetails.lastName || splitName.lastName || '');
    setCustomerName(savedCustomerDetails.name || '');
    setCustomerPhone(savedCustomerDetails.phone || '');
    setCustomerEmail(savedCustomerDetails.email || '');
    toast.success('Saved details applied.');
  }, [savedCustomerDetails]);

  const handleGuestCustomerNameChange = useCallback((nextName) => {
    const normalizedName = String(nextName || '').replace(/\s+/g, ' ').trimStart();
    const splitName = splitCustomerName(normalizedName);
    setCustomerName(normalizedName);
    setCustomerFirstName(splitName.firstName || '');
    setCustomerLastName(splitName.lastName || '');
  }, []);

  const handleOpenGuestDetailsEditor = useCallback(() => {
    const blankGuestIdentity = createBlankGuestCustomerIdentity();
    setCustomerFirstName(blankGuestIdentity.firstName);
    setCustomerLastName(blankGuestIdentity.lastName);
    setCustomerName(blankGuestIdentity.name);
    setCustomerPhone(blankGuestIdentity.phone);
    setCustomerEmail(blankGuestIdentity.email);
    setIsUsingDifferentGuestDetails(true);
    setGuestDetailsEditMode(true);
  }, [setGuestDetailsEditMode, setIsUsingDifferentGuestDetails]);

  const handleCancelGuestDetailsEditor = useCallback(() => {
    if (hasSavedCustomerDetails) {
      applySavedCustomerDetails();
      setIsUsingDifferentGuestDetails(false);
      setGuestDetailsEditMode(false);
      return;
    }
    handleGuestCustomerNameChange(buildCustomerFullName(customerFirstName, customerLastName));
  }, [applySavedCustomerDetails, customerFirstName, customerLastName, handleGuestCustomerNameChange, hasSavedCustomerDetails, setGuestDetailsEditMode, setIsUsingDifferentGuestDetails]);

  const handleApplyGuestDetails = useCallback(() => {
    handleGuestCustomerNameChange(buildCustomerFullName(customerFirstName, customerLastName) || customerName);
    if (hasSavedCustomerDetails) {
      setGuestDetailsEditMode(false);
    }
  }, [customerFirstName, customerLastName, customerName, handleGuestCustomerNameChange, hasSavedCustomerDetails, setGuestDetailsEditMode]);

  const clearSavedCustomerDetailsForDevice = useCallback(() => {
    clearSavedCustomerDetails();
    setSavedCustomerDetails(null);
    toast.success('Saved details cleared.');
  }, []);

  useEffect(() => {
    if (!isDgfyCustomerSignedIn) return;
    if (accountIdentityRawName && !String(customerName || '').trim()) {
      const splitName = splitCustomerName(accountIdentityRawName);
      // Syncing DGFY-account identity into local guest-identity fields the first time
      // they're empty - not a derivable render-time value, so an effect is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerFirstName((current) => current || splitName.firstName || '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerLastName((current) => current || splitName.lastName || '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerName(accountIdentityRawName);
    }
    if (accountIdentityRawPhone && !String(customerPhone || '').trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerPhone(accountIdentityRawPhone);
    }
    if (accountIdentityRawEmail && !String(customerEmail || '').trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomerEmail(accountIdentityRawEmail);
    }
  }, [
    accountIdentityRawEmail,
    accountIdentityRawName,
    accountIdentityRawPhone,
    customerFirstName,
    customerEmail,
    customerLastName,
    customerName,
    customerPhone,
    isDgfyCustomerSignedIn
  ]);

  const openCheckoutAuthFlowStable = useCallback((...args) => {
    const target = typeof getOpenCheckoutAuthFlow === 'function' ? getOpenCheckoutAuthFlow() : null;
    return typeof target === 'function' ? target(...args) : undefined;
  }, [getOpenCheckoutAuthFlow]);

  const handleSendGuestCheckoutOtpStable = useCallback((...args) => {
    const target = typeof getHandleSendGuestCheckoutOtp === 'function' ? getHandleSendGuestCheckoutOtp() : null;
    return typeof target === 'function' ? target(...args) : undefined;
  }, [getHandleSendGuestCheckoutOtp]);

  const {
    renderGuestIdentityFields,
    renderGuestCheckoutEntry,
    renderAccountOwnedIdentitySummary,
    renderBillingEmailPrompt
  } = useMemo(() => createCustomerIdentityRenderers({
    hasSavedCustomerDetails,
    savedCustomerDetails,
    rememberCustomerDetails,
    maskedSavedCustomerPreview,
    guestDetailsEditMode,
    isMobileViewport,
    servicesBodyFont,
    servicesDisplayFont,
    checkoutAccent,
    checkoutAccentDark,
    checkoutAccentShadow,
    customerName,
    customerFirstName,
    customerLastName,
    customerPhone,
    customerEmail,
    customerAddress,
    accountIdentityRawName,
    accountIdentityRawPhone,
    accountIdentityRawEmail,
    handleGuestCustomerNameChange,
    setCustomerFirstName,
    setCustomerLastName,
    setCustomerPhone,
    setCustomerEmail,
    setCustomerAddress,
    setRememberCustomerDetails,
    handleOpenGuestDetailsEditor,
    handleCancelGuestDetailsEditor,
    handleApplyGuestDetails,
    handleSendGuestCheckoutOtp: handleSendGuestCheckoutOtpStable,
    openCheckoutAuthFlow: openCheckoutAuthFlowStable,
    setGuestCheckoutUnlocked
  }), [
    hasSavedCustomerDetails,
    savedCustomerDetails,
    rememberCustomerDetails,
    maskedSavedCustomerPreview,
    guestDetailsEditMode,
    isMobileViewport,
    servicesBodyFont,
    servicesDisplayFont,
    checkoutAccent,
    checkoutAccentDark,
    checkoutAccentShadow,
    customerName,
    customerFirstName,
    customerLastName,
    customerPhone,
    customerEmail,
    customerAddress,
    accountIdentityRawName,
    accountIdentityRawPhone,
    accountIdentityRawEmail,
    handleGuestCustomerNameChange,
    setCustomerFirstName,
    setCustomerLastName,
    setCustomerPhone,
    setCustomerEmail,
    setCustomerAddress,
    setRememberCustomerDetails,
    handleOpenGuestDetailsEditor,
    handleCancelGuestDetailsEditor,
    handleApplyGuestDetails,
    handleSendGuestCheckoutOtpStable,
    openCheckoutAuthFlowStable,
    setGuestCheckoutUnlocked
  ]);

  return {
    customerFirstName,
    setCustomerFirstName,
    customerLastName,
    setCustomerLastName,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    customerEmail,
    setCustomerEmail,
    savedCustomerDetails,
    setSavedCustomerDetails,
    maskedSavedCustomerPreview,
    hasSavedCustomerDetails,
    applySavedCustomerDetails,
    handleApplyGuestDetails,
    clearSavedCustomerDetailsForDevice,
    renderGuestIdentityFields,
    renderGuestCheckoutEntry,
    renderAccountOwnedIdentitySummary,
    renderBillingEmailPrompt
  };
}

export default useGuestCustomerIdentity;
