import { useMemo } from 'react';
import { buildCustomerDashboardRouteFlags } from './customerDashboardRoutePresentationModel.js';

export function useCustomerDashboardRouteFlags({
  currentPathname,
  currentPathSubpage,
  routeSubpage
}) {
  return useMemo(
    () => buildCustomerDashboardRouteFlags({
      currentPathname,
      currentPathSubpage,
      routeSubpage
    }),
    [currentPathSubpage, currentPathname, routeSubpage]
  );
}

export default useCustomerDashboardRouteFlags;
