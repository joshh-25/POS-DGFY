import React from 'react';
import { ServicesTrackingRouteFrame } from '../components/ServicesTrackingRouteFrame.jsx';
import { ServicesTrackingRoutePage } from '../components/ServicesTrackingRoutePage.jsx';

export function ServicesTrackingRouteContainer({ frame, page, visible = true }) {
  if (!visible) return null;
  return (
    <ServicesTrackingRouteFrame {...frame}>
      <ServicesTrackingRoutePage {...page} />
    </ServicesTrackingRouteFrame>
  );
}
