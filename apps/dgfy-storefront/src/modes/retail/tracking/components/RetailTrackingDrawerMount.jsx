import React from 'react';

import { RetailTrackingDrawer } from './RetailTrackingDrawer.jsx';

/**
 * Keeps the existing tracking drawer view behind the F&B tracking boundary.
 * The root shell prepares its shared dependencies; this component owns whether
 * the F&B drawer is presented and forwards only the drawer contract.
 */
export function RetailTrackingDrawerMount({
  canOpen,
  isAccountTracking,
  isMobileViewport,
  isOpen,
  money,
  onClose,
  openFullTrackingForPin,
  orders,
  selectedStore,
  withAssetOrigin,
}) {
  if (!canOpen || !isOpen) return null;

  return (
    <RetailTrackingDrawer
      isOpen={isOpen}
      isMobileViewport={isMobileViewport}
      selectedStore={selectedStore}
      guestTrackedOrders={orders}
      onClose={onClose}
      openFullTrackingForPin={openFullTrackingForPin}
      withAssetOrigin={withAssetOrigin}
      money={money}
      isAccountTracking={isAccountTracking}
    />
  );
}
