import React from 'react';

import { FnbTrackingRouteContainer } from '../../../fnb/tracking/pages/FnbTrackingRouteContainer.jsx';

const RETAIL_TRACKING_PRESENTATION = Object.freeze({
  backLabel: 'Back to Items',
  returnToCatalog: true,
  showTrustStrip: false,
});

/**
 * Retail-owned tracking outlet. The order tracking renderer remains shared
 * while Retail supplies only its catalog terminology and visibility policy.
 */
export function RetailTrackingRouteContainer({ page, ...props }) {
  return (
    <FnbTrackingRouteContainer
      {...props}
      page={{
        ...page,
        presentation: RETAIL_TRACKING_PRESENTATION,
      }}
    />
  );
}
