import { useCallback, useEffect, useState } from 'react';
import {
  buildCustomerDashboardTabPath,
  CUSTOMER_DASHBOARD_DEFAULT_TAB,
  getCustomerDashboardTabFromLocation
} from './customerDashboardRoutePresentationModel.js';

const readLocation = () => {
  if (typeof window === 'undefined') return { pathname: '/', search: '' };
  return { pathname: window.location.pathname, search: window.location.search };
};

export function useCustomerDashboardRouteState({ routeBacked = true } = {}) {
  const [localNav, setLocalNav] = useState(CUSTOMER_DASHBOARD_DEFAULT_TAB);
  const [location, setLocation] = useState(readLocation);

  useEffect(() => {
    const handlePopState = () => setLocation(readLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const activeNav = routeBacked
    ? getCustomerDashboardTabFromLocation(location) || CUSTOMER_DASHBOARD_DEFAULT_TAB
    : localNav;
  const setActiveNav = useCallback((nextTab) => {
    if (!routeBacked) {
      setLocalNav(nextTab);
      return;
    }
    if (typeof window === 'undefined') return;
    const targetPath = buildCustomerDashboardTabPath({ pathname: window.location.pathname, tab: nextTab });
    if (targetPath === window.location.pathname && !window.location.search) return;
    window.history.pushState({}, '', targetPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [routeBacked]);

  return { activeNav, setActiveNav };
}

export default useCustomerDashboardRouteState;
