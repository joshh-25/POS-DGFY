import React from 'react';
import { CustomerDashboardRouteRuntime } from './CustomerDashboardRouteRuntime.jsx';

export function CustomerDashboardRouteMount({
  isStandaloneRoute = false,
  isSignedIn = false,
  isDrawerOpen = false,
  isMobileViewport = false,
  onCloseStandalone,
  onCloseDrawer,
  sources
}) {
  if (isStandaloneRoute && isSignedIn) {
    return (
      <CustomerDashboardRouteRuntime
        presentation="page"
        isSignedIn={isSignedIn}
        isMobileViewport={isMobileViewport}
        onClose={onCloseStandalone}
        sources={sources}
      />
    );
  }

  if (!isDrawerOpen || !isSignedIn) return null;

  return (
    <CustomerDashboardRouteRuntime
      presentation="drawer"
      isOpen={isDrawerOpen}
      isSignedIn={isSignedIn}
      isMobileViewport={isMobileViewport}
      onClose={onCloseDrawer}
      sources={sources}
    />
  );
}

export default CustomerDashboardRouteMount;
