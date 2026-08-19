import { describe, expect, it } from 'vitest';

import { getServicesFlowPresentation } from './servicesLocalFlow.js';

describe('Services flow presentation', () => {
  it('keeps booking, summary, and tracking copy aligned by profile', () => {
    expect(getServicesFlowPresentation('delivery')).toMatchObject({
      label: 'Pick up and deliver',
      shortLabel: 'Pickup and return',
      trackingTitle: 'Pickup and delivery',
      locationTitle: 'Delivery details'
    });
    expect(getServicesFlowPresentation('pickup')).toMatchObject({
      label: "Pick up and I'll collect",
      shortLabel: 'Pickup and collection',
      trackingTitle: 'Pickup and collection',
      locationTitle: 'Pickup at'
    });
  });
});
