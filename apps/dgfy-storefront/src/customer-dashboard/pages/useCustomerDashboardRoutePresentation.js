import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  buildCustomerDashboardRouteFlags,
  isCustomerDashboardStandalonePath,
  normalizeCustomerDashboardRoutePath
} from './customerDashboardRoutePresentationModel.js';

export function useCustomerDashboardRoutePresentation({
  currentPathname,
  currentPathSubpage,
  routeSubpage,
  routeSlug,
  isSignedIn = false,
  isDrawerOpen = false,
  onCloseDrawer,
  onCloseCheckout,
  onCloseGuestTrackingDrawer,
  onLoadAccountPanel,
  onGoDiscovery,
  onGoStore,
  resolveAccountUrl
}) {
  const routeActionsRef = useRef({});

  useEffect(() => {
    routeActionsRef.current = {
      onCloseCheckout,
      onCloseDrawer,
      onCloseGuestTrackingDrawer,
      onLoadAccountPanel,
      resolveAccountUrl
    };
  }, [
    onCloseCheckout,
    onCloseDrawer,
    onCloseGuestTrackingDrawer,
    onLoadAccountPanel,
    resolveAccountUrl
  ]);

  const routeFlags = useMemo(
    () => buildCustomerDashboardRouteFlags({
      currentPathname,
      routeSubpage,
      currentPathSubpage
    }),
    [currentPathSubpage, currentPathname, routeSubpage]
  );

  const closeStandaloneAccountPage = useCallback(() => {
    if (routeFlags.isTenantAccountPage && routeSlug) {
      onGoStore(routeSlug);
      return;
    }
    onGoDiscovery();
  }, [onGoDiscovery, onGoStore, routeFlags.isTenantAccountPage, routeSlug]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isSignedIn) return;

    const currentUrl = new URL(window.location.href);
    const normalizedPath = normalizeCustomerDashboardRoutePath(currentUrl.pathname);
    const openedFromQuery = currentUrl.searchParams.get('dgfy_account') === '1';
    const routedAccountPath = isCustomerDashboardStandalonePath(normalizedPath) || normalizedPath.endsWith('/account');

    if (!openedFromQuery && !routedAccountPath) return;

    routeActionsRef.current.onCloseCheckout?.();
    routeActionsRef.current.onCloseGuestTrackingDrawer?.();

    if (openedFromQuery && !routedAccountPath) {
      const accountUrl = routeActionsRef.current.resolveAccountUrl?.();
      currentUrl.searchParams.delete('dgfy_account');
      if (accountUrl && window.location.href !== accountUrl) {
        window.location.href = accountUrl;
      }
      return;
    }

    routeActionsRef.current.onCloseDrawer?.();
    routeActionsRef.current.onLoadAccountPanel?.();
  }, [
    isSignedIn,
    routeFlags.isStandaloneAccountPage,
    routeFlags.isTenantAccountPage
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isDrawerOpen) return undefined;

    const handleDrawerKeydown = (event) => {
      if (event.key === 'Escape') onCloseDrawer?.();
    };

    window.addEventListener('keydown', handleDrawerKeydown);
    return () => window.removeEventListener('keydown', handleDrawerKeydown);
  }, [isDrawerOpen, onCloseDrawer]);

  return useMemo(
    () => ({
      ...routeFlags,
      closeStandaloneAccountPage,
      shouldLockBodyScrollForDrawer: isDrawerOpen && !routeFlags.isStandaloneAccountPage
    }),
    [closeStandaloneAccountPage, isDrawerOpen, routeFlags]
  );
}

export default useCustomerDashboardRoutePresentation;
