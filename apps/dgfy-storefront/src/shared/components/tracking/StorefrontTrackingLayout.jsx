import React from 'react';

/**
 * Shared tracking page shell. Industry routes provide the primary tracking
 * content and the detail sidebar; this component owns the responsive layout
 * so every storefront uses the same map/flow/status hierarchy.
 */
export function StorefrontTrackingLayout({ children, isMobileViewport, sidebarWidth = 360, style }) {
  return (
    <div
      data-testid="storefront-tracking-layout"
      style={{
        display: 'grid',
        gridTemplateColumns: isMobileViewport ? 'minmax(0, 1fr)' : `minmax(0, 1fr) ${sidebarWidth}px`,
        gap: isMobileViewport ? 20 : 24,
        alignItems: 'start',
        minWidth: 0,
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Keep the tracking flow order consistent across every storefront mode.
 * Every viewport shows the current status immediately after the map, followed
 * by the detailed progress timeline so the page has one predictable hierarchy.
 */
export function getTrackingFlowOrder(slot) {
  const order = { map: 1, status: 2, timeline: 3 };

  return order[slot] ?? 0;
}

export default StorefrontTrackingLayout;
