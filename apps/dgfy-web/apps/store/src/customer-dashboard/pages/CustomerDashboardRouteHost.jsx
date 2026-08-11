import React, { useEffect } from 'react';
import { DgfyCustomerAuthModal } from '../components/DgfyCustomerAuthModal.jsx';
import { CustomerDashboardRouteMount } from './CustomerDashboardRouteMount.jsx';

export function CustomerDashboardRouteHost({
  isStandaloneRoute = false,
  isDrawerOpen = false,
  isSignedIn = false,
  isSessionResolved = false,
  isGuestDrawerState = false,
  isMobileViewport = false,
  onCloseStandalone,
  onCloseDrawer,
  sources,
  guestAuth
}) {
  useEffect(() => {
    if (isStandaloneRoute && isSessionResolved && !isSignedIn) guestAuth?.onOpenAuth?.();
  }, [guestAuth?.onOpenAuth, isSessionResolved, isSignedIn, isStandaloneRoute]);

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

  if (isStandaloneRoute) {
    return <main role="status" aria-live="polite">{isSessionResolved ? 'Redirecting to sign in...' : 'Checking account access...'}</main>;
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
