import React from 'react';

import { TrackingDrawer } from './TrackingDrawer.jsx';

/**
 * Keeps the existing tracking drawer view behind the shared tracking boundary.
 * The root shell prepares its shared dependencies; this component owns whether
 * the tracking drawer is presented and forwards only the drawer contract.
 */
export function TrackingDrawerMount({
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
    <TrackingDrawer
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
