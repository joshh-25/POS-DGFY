import React from 'react';

import { SimpleTrackingRouteFrame } from '../components/SimpleTrackingRouteFrame.jsx';
import { SimpleTrackingRoutePage } from '../components/SimpleTrackingRoutePage.jsx';

/** Simple/MSME tracking route outlet. */
export function SimpleTrackingRouteContainer({ page, route, visible }) {
  if (!visible) return null;
  return (
    <SimpleTrackingRouteFrame {...route}>
      <SimpleTrackingRoutePage {...page} />
    </SimpleTrackingRouteFrame>
  );
}
