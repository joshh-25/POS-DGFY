const onlineOrders = (orders) => (Array.isArray(orders) ? orders : []);

/**
 * Resolve the same pending online-order list used by the POS navigation and
 * the header notifications. The incoming endpoint contains every online
 * order method, including dine-in orders that are presented in the separate
 * Dine-in Schedule tab. Branch-monitor users read from the admin monitor;
 * active-shift operators read from their shift queue.
 */
export const resolvePosIncomingOrders = ({
  showIncomingQueue = true,
  canViewPos = false,
  hasActiveShift = false,
  canViewAdminLocationMonitor = false,
  branchViewLocationId = null,
  incomingOrdersState = {},
  adminLocationMonitorState = {}
} = {}) => {
  if (!showIncomingQueue || !canViewPos) return [];

  const isAdminBranchMonitor = Boolean(branchViewLocationId)
    || (!hasActiveShift && canViewAdminLocationMonitor);
  const source = isAdminBranchMonitor
    ? adminLocationMonitorState?.orders
    : incomingOrdersState?.orders;

  return onlineOrders(source);
};

export const getPosIncomingOrderCount = (options = {}) => (
  resolvePosIncomingOrders(options).length
);
