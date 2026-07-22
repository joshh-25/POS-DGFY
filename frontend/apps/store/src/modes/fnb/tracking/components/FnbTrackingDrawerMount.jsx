import React from 'react';

import { FnbTrackingDrawer } from './FnbTrackingDrawer.jsx';

/**
 * Keeps the existing tracking drawer view behind the F&B tracking boundary.
 * The root shell prepares its shared dependencies; this component owns whether
 * the F&B drawer is presented and forwards only the drawer contract.
 */
export function FnbTrackingDrawerMount({
  canOpen,
  expandedPins,
  isAccountTracking,
  isMobileViewport,
  isOpen,
  money,
  onClose,
  onExpandedPinsChange,
  openFullTrackingForPin,
  orders,
  selectedStore,
  withAssetOrigin,
}) {
  if (!canOpen || !isOpen) return null;

  return (
    <FnbTrackingDrawer
      isOpen={isOpen}
      isMobileViewport={isMobileViewport}
      selectedStore={selectedStore}
      guestTrackedOrders={orders}
      expandedGuestDrawerPins={expandedPins}
      onExpandedGuestDrawerPinsChange={onExpandedPinsChange}
      onClose={onClose}
      openFullTrackingForPin={openFullTrackingForPin}
      withAssetOrigin={withAssetOrigin}
      money={money}
      isAccountTracking={isAccountTracking}
    />
  );
}
