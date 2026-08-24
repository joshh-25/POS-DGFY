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
  isSessionResolved = false,
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
  const dashboardSources = useMemo(() => ({ ...(sources || {}), onGoDiscovery }), [onGoDiscovery, sources]);

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
        isSessionResolved={isSessionResolved}
        isMobileViewport={isMobileViewport}
        onCloseStandalone={closeStandaloneAccountPage}
        onCloseDrawer={onCloseDrawer}
        sources={dashboardSources}
        guestAuth={guestAuth}
      />
    );
  }, [
    closeStandaloneAccountPage,
    dashboardSources,
    guestAuth,
    isMobileViewport,
    isSignedIn,
    isSessionResolved,
    isStandaloneAccountPage,
    onCloseDrawer
  ]);

  const drawerRouteNode = useMemo(() => {
    if (isStandaloneAccountPage) return null;
    return (
      <CustomerDashboardRouteHost
        isDrawerOpen={isDrawerOpen}
        isStandaloneRoute={false}
        isSignedIn={isSignedIn}
        isSessionResolved={isSessionResolved}
        isGuestDrawerState={isGuestDrawerState}
        isMobileViewport={isMobileViewport}
        onCloseStandalone={closeStandaloneAccountPage}
        onCloseDrawer={onCloseDrawer}
        sources={dashboardSources}
        guestAuth={guestAuth}
      />
    );
  }, [
    closeStandaloneAccountPage,
    dashboardSources,
    guestAuth,
    isDrawerOpen,
    isGuestDrawerState,
    isMobileViewport,
    isSignedIn,
    isSessionResolved,
    isStandaloneAccountPage,
    onCloseDrawer
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
