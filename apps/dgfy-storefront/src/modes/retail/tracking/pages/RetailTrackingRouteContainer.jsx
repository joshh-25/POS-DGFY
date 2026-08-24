import React from 'react';

import { RetailTrackingDrawerMount } from '../components/RetailTrackingDrawerMount.jsx';
import { RetailTrackingRouteFrame } from '../components/RetailTrackingRouteFrame.jsx';
import { RetailTrackingRoutePage } from '../components/RetailTrackingRoutePage.jsx';

/**
 * Retail tracking presentation outlet. Runtime data and shared navigation actions
 * are injected by the shell until the final route-runtime extraction.
 */
export function RetailTrackingRouteContainer({
  drawer,
  page,
  renderDrawer = true,
  route,
  visible
}) {
  return (
    <>
      {visible ? (
        <RetailTrackingRouteFrame {...route}>
          <RetailTrackingRoutePage {...page} />
        </RetailTrackingRouteFrame>
      ) : null}
      {renderDrawer ? <RetailTrackingDrawerMount {...drawer} /> : null}
    </>
  );
}
