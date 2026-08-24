import { useEffect, useRef } from 'react';
import { useCustomerAccountPanel } from './useCustomerAccountPanel.js';
import { useCustomerDashboardAddresses } from './useCustomerDashboardAddresses.jsx';
import { useCustomerDashboardPayouts } from './useCustomerDashboardPayouts.jsx';
import { useCustomerDashboardCashouts } from './useCustomerDashboardCashouts.jsx';
import { useCustomerDashboardBusinessAccess } from './useCustomerDashboardBusinessAccess.js';
import { useCustomerDashboardLiveSync } from './useCustomerDashboardLiveSync.js';
import { useCustomerDashboardNotifications } from './useCustomerDashboardNotifications.js';
import { useCustomerDashboardSessionActions } from './useCustomerDashboardSessionActions.js';
import { useCustomerDashboardTracking } from './useCustomerDashboardTracking.js';

export function useCustomerDashboardRuntime({
  EMPTY_ACCOUNT_PANEL, selectedStore, routeSlug, routeSubpage, currentPathSubpage,
  knownStoreRouteCandidates, isDgfyCustomerSignedIn, isGuestTrackingDrawerOpen,
  isAccountDrawerOpen, isStandaloneAccountPage, dgfySessionAccount,
  setDgfySessionAccount, setDgfyAuthTokenState, setIsAccountDrawerOpen,
  setDeliveryLocationAction, setSelectedSavedLocationId, setPinLocationError,
  setResolvedDeliveryAddress, setCustomerAddress, setCustomerPin, DeliveryPinMap,
  createAddressPinEditorRenderer, reverseGeocodeDeliveryPin, normalizeCoordinatePair,
  buildPinnedDeliveryAddress, isMobileViewport,
  getFetchTrackingPayload, getBuildTrackedOrderEntryFromTrackingPayload,
  mapAccountActivityToTrackedOrderEntry, mergeTrackedOrderEntries,
  mergeAccountPanelActivity, resolveStorefrontRouteSlug, toSlug, storePath,
  withAssetOrigin, withApiOrigin, requestJson, normalizeStorefrontErrorMessage,
  deriveAccountActivityCollections, readDgfyAuthToken, readStoreAuthToken,
  clearDgfyAuthToken, clearStoreAuthToken, rememberDgfySignedOutEmail,
  markDgfyExplicitSignOut, clearCheckoutAuthResumeDraft, buildSkupervisorHandoffUrl,
  buildPosDgfyHandoffUrl,
  createDgfyHandoff, buildPosAppUrl, startDgfyPosSession, startDgfyTenantSession, getGoStoreTrackPage,
  onTrackedActivityUpdated
}) {
  const accountPanelRefreshInFlightRef = useRef(false);
  const loadAccountPanelRef = useRef(null);
  const { accountPanel, setAccountPanel, handleLoadAccountPanel } = useCustomerAccountPanel({
    EMPTY_ACCOUNT_PANEL, selectedStore, knownStoreRouteCandidates,
    isDgfyCustomerSignedIn, dgfySessionAccount, setDgfySessionAccount,
    setDgfyAuthTokenState, requestJson, normalizeStorefrontErrorMessage,
    deriveAccountActivityCollections, readDgfyAuthToken, readStoreAuthToken,
    clearDgfyAuthToken
  });
  useEffect(() => {
    loadAccountPanelRef.current = handleLoadAccountPanel;
  }, [handleLoadAccountPanel]);
  const tracking = useCustomerDashboardTracking({
    accountPanel, setAccountPanel, selectedStore, routeSlug, knownStoreRouteCandidates,
    dgfySessionAccount, setIsAccountDrawerOpen, getFetchTrackingPayload,
    getBuildTrackedOrderEntryFromTrackingPayload, getGoStoreTrackPage,
    mapAccountActivityToTrackedOrderEntry, mergeTrackedOrderEntries,
    mergeAccountPanelActivity, resolveStorefrontRouteSlug, toSlug, withAssetOrigin,
    requestJson, normalizeStorefrontErrorMessage, readDgfyAuthToken,
    onTrackedActivityUpdated
  });
  const {
    setTrackedCustomerActivity,
    setCustomerTrackLoadingReference,
    setCustomerTrackError
  } = tracking;
  const notifications = useCustomerDashboardNotifications({
    setAccountPanel, handleLoadAccountPanel, requestJson, readDgfyAuthToken
  });
  const addresses = useCustomerDashboardAddresses({
    accountPanel, setAccountPanel, handleLoadAccountPanel, dgfySessionAccount,
    isDgfyCustomerSignedIn, requestJson, readDgfyAuthToken, normalizeCoordinatePair,
    normalizeStorefrontErrorMessage, setDeliveryLocationAction,
    setSelectedSavedLocationId, setPinLocationError, setResolvedDeliveryAddress,
    setCustomerAddress, setCustomerPin, createAddressPinEditorRenderer,
    DeliveryPinMap, reverseGeocodeDeliveryPin, buildPinnedDeliveryAddress,
    isMobileViewport
  });
  const payouts = useCustomerDashboardPayouts({
    accountPanel, setAccountPanel, handleLoadAccountPanel, dgfySessionAccount,
    requestJson, readDgfyAuthToken, normalizeStorefrontErrorMessage
  });
  const cashouts = useCustomerDashboardCashouts({
    handleLoadAccountPanel, dgfySessionAccount, requestJson, readDgfyAuthToken,
    normalizeStorefrontErrorMessage
  });
  const business = useCustomerDashboardBusinessAccess({
    handleLoadAccountPanel, requestJson, readDgfyAuthToken, buildSkupervisorHandoffUrl,
    buildPosDgfyHandoffUrl,
    createDgfyHandoff, buildPosAppUrl, startDgfyPosSession, startDgfyTenantSession, dgfySessionAccount,
    normalizeStorefrontErrorMessage
  });
  const session = useCustomerDashboardSessionActions({
    EMPTY_ACCOUNT_PANEL, accountPanel, setAccountPanel, dgfySessionAccount,
    setDgfySessionAccount, setDgfyAuthTokenState, setIsAccountDrawerOpen,
    setTrackedCustomerActivity,
    setCustomerTrackLoadingReference,
    setCustomerTrackError, routeSlug, routeSubpage,
    currentPathSubpage, storePath, resolveStorefrontMetaForAccountEntry:
    tracking.resolveStorefrontMetaForAccountEntry, requestJson, readDgfyAuthToken,
    clearDgfyAuthToken, clearStoreAuthToken, rememberDgfySignedOutEmail,
    markDgfyExplicitSignOut, clearCheckoutAuthResumeDraft, handleLoadAccountPanel
  });
  useCustomerDashboardLiveSync({
    isDgfyCustomerSignedIn, isAccountDrawerOpen, isStandaloneAccountPage,
    isGuestTrackingDrawerOpen, activeCustomerOrderCount: tracking.activeCustomerOrderCount,
    accountPanelRefreshInFlightRef, loadAccountPanelRef,
    mergeLiveAccountActivityRef: tracking.mergeLiveAccountActivityRef,
    setAccountPanel, withApiOrigin
  });
  useEffect(() => {
    if (!isAccountDrawerOpen) {
      setCustomerTrackError('');
      setCustomerTrackLoadingReference('');
    }
  }, [isAccountDrawerOpen, setCustomerTrackError, setCustomerTrackLoadingReference]);
  useEffect(() => {
    if (!isAccountDrawerOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setIsAccountDrawerOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isAccountDrawerOpen, setIsAccountDrawerOpen]);
  return {
    accountPanel,
    accountOrderActionReference: '',
    accountAddressActionId: addresses.accountAddressActionId,
    trackedCustomerActivity: tracking.trackedCustomerActivity,
    customerTrackLoadingReference: tracking.customerTrackLoadingReference,
    customerTrackError: tracking.customerTrackError,
    activeCustomerOrders: tracking.activeCustomerOrders,
    activeCustomerOrderCount: tracking.activeCustomerOrderCount,
    accountTrackedOrders: tracking.accountTrackedOrders,
    resolveStorefrontMetaForAccountEntry: tracking.resolveStorefrontMetaForAccountEntry,
    openStorefrontFromAccountEntry: session.openStorefrontFromAccountEntry,
    submitAccountReviewFromDashboard: session.submitAccountReviewFromDashboard,
    useAccountAddressForCheckout: addresses.useAccountAddressForCheckout,
    renderAddressPinEditor: addresses.renderAddressPinEditor,
    handleLoadAccountPanel,
    handleTrackCustomerReference: tracking.handleTrackCustomerReference,
    ...notifications,
    ...business,
    handleSaveAccountAddress: addresses.handleSaveAccountAddress,
    handleSetDefaultAccountAddress: addresses.handleSetDefaultAccountAddress,
    handleDeleteAccountAddress: addresses.handleDeleteAccountAddress,
    refreshAccountAddresses: addresses.refreshAccountAddresses,
    accountPayoutActionId: payouts.accountPayoutActionId,
    handleSavePayoutMethod: payouts.handleSavePayoutMethod,
    handleSetDefaultPayoutMethod: payouts.handleSetDefaultPayoutMethod,
    handleDeletePayoutMethod: payouts.handleDeletePayoutMethod,
    accountCashoutActionId: cashouts.accountCashoutActionId,
    handleRequestCashout: cashouts.handleRequestCashout,
    handleCancelCashout: cashouts.handleCancelCashout,
    handleStorefrontSignOut: session.handleStorefrontSignOut
  };
}

export default useCustomerDashboardRuntime;
