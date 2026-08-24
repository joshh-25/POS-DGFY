import React from 'react';

import { FnbTrackingDrawerMount } from '../components/FnbTrackingDrawerMount.jsx';
import { FnbTrackingRouteFrame } from '../components/FnbTrackingRouteFrame.jsx';
import { FnbTrackingRoutePage } from '../components/FnbTrackingRoutePage.jsx';

/**
 * F&B tracking presentation outlet. Runtime data and shared navigation actions
 * are injected by the shell until the final route-runtime extraction.
 */
export function FnbTrackingRouteContainer({
  drawer,
  page,
  renderDrawer = true,
  route,
  visible
}) {
  return (
    <>
      {visible ? (
        <FnbTrackingRouteFrame {...route}>
          <FnbTrackingRoutePage {...page} />
        </FnbTrackingRouteFrame>
      ) : null}
      {renderDrawer ? <FnbTrackingDrawerMount {...drawer} /> : null}
    </>
  );
}
