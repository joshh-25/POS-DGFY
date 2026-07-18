import React, { useMemo } from 'react';
import { CustomerDashboardRouteHost } from './CustomerDashboardRouteHost.jsx';
import { useCustomerDashboardRouteFlags } from './useCustomerDashboardRouteFlags.js';
import { useCustomerDashboardRoutePresentation } from './useCustomerDashboardRoutePresentation.js';

export function useCustomerDashboardRouteOutlet({
  currentPathname,
  currentPathSubpage,
  routeSubpage,
  routeSlug,
  isSignedIn = false,
  isDrawerOpen = false,
  isGuestDrawerState = false,
  isMobileViewport = false,
  onCloseDrawer,
  onCloseCheckout,
  onCloseGuestTrackingDrawer,
  onLoadAccountPanel,
  onGoDiscovery,
  onGoStore,
  resolveAccountUrl,
  sources,
  guestAuth
}) {
  const { isStandaloneAccountPage } = useCustomerDashboardRouteFlags({
    currentPathname,
    currentPathSubpage,
    routeSubpage
  });

  const { closeStandaloneAccountPage } = useCustomerDashboardRoutePresentation({
    currentPathname,
    currentPathSubpage,
    routeSubpage,
    routeSlug,
    isSignedIn,
    isDrawerOpen,
    onCloseDrawer,
    onCloseCheckout,
    onCloseGuestTrackingDrawer,
    onLoadAccountPanel,
    onGoDiscovery,
    onGoStore,
    resolveAccountUrl
  });

  const standaloneRouteNode = useMemo(() => {
    if (!isStandaloneAccountPage) return null;
    return (
      <CustomerDashboardRouteHost
        isStandaloneRoute
        isSignedIn={isSignedIn}
        isMobileViewport={isMobileViewport}
        onCloseStandalone={closeStandaloneAccountPage}
        onCloseDrawer={onCloseDrawer}
        sources={sources}
        guestAuth={guestAuth}
      />
    );
  }, [
    closeStandaloneAccountPage,
    guestAuth,
    isMobileViewport,
    isSignedIn,
    isStandaloneAccountPage,
    onCloseDrawer,
    sources
  ]);

  const drawerRouteNode = useMemo(() => {
    if (isStandaloneAccountPage) return null;
    return (
      <CustomerDashboardRouteHost
        isDrawerOpen={isDrawerOpen}
        isStandaloneRoute={false}
        isSignedIn={isSignedIn}
        isGuestDrawerState={isGuestDrawerState}
        isMobileViewport={isMobileViewport}
        onCloseStandalone={closeStandaloneAccountPage}
        onCloseDrawer={onCloseDrawer}
        sources={sources}
        guestAuth={guestAuth}
      />
    );
  }, [
    closeStandaloneAccountPage,
    guestAuth,
    isDrawerOpen,
    isGuestDrawerState,
    isMobileViewport,
    isSignedIn,
    isStandaloneAccountPage,
    onCloseDrawer,
    sources
  ]);

  return useMemo(
    () => ({
      isStandaloneAccountPage,
      closeStandaloneAccountPage,
      standaloneRouteNode,
      drawerRouteNode
    }),
    [
      closeStandaloneAccountPage,
      drawerRouteNode,
      isStandaloneAccountPage,
      standaloneRouteNode
    ]
  );
}

export default useCustomerDashboardRouteOutlet;
