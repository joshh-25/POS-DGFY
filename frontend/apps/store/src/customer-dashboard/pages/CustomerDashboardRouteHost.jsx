import React from 'react';
import { DgfyCustomerAuthModal } from '../../Components/storefront/pages/DgfyCustomerAuthModal.jsx';
import { CustomerDashboardRouteMount } from './CustomerDashboardRouteMount.jsx';

export function CustomerDashboardRouteHost({
  isStandaloneRoute = false,
  isDrawerOpen = false,
  isSignedIn = false,
  isGuestDrawerState = false,
  isMobileViewport = false,
  onCloseStandalone,
  onCloseDrawer,
  sources,
  guestAuth
}) {
  if (isStandaloneRoute && isSignedIn) {
    return (
      <CustomerDashboardRouteMount
        isStandaloneRoute
        isSignedIn={isSignedIn}
        isMobileViewport={isMobileViewport}
        onCloseStandalone={onCloseStandalone}
        onCloseDrawer={onCloseDrawer}
        sources={sources}
      />
    );
  }

  if (!isDrawerOpen) return null;

  if (isGuestDrawerState) {
    return (
      <DgfyCustomerAuthModal
        isMobileViewport={isMobileViewport}
        onClose={onCloseDrawer}
        savedCustomerDetails={guestAuth.savedCustomerDetails}
        hasSavedCustomerDetails={guestAuth.hasSavedCustomerDetails}
        onContinueAsGuest={guestAuth.onContinueAsGuest}
        onClearSavedDetails={guestAuth.onClearSavedDetails}
        onOpenAuth={guestAuth.onOpenAuth}
        onOpenRegisterBusiness={guestAuth.onOpenRegisterBusiness}
      />
    );
  }

  return (
    <CustomerDashboardRouteMount
      isDrawerOpen={isDrawerOpen}
      isSignedIn={isSignedIn}
      isMobileViewport={isMobileViewport}
      onCloseStandalone={onCloseStandalone}
      onCloseDrawer={onCloseDrawer}
      sources={sources}
    />
  );
}

export default CustomerDashboardRouteHost;
