import React from 'react';
import { DiscoveryHomePage } from '../../discovery/pages/DiscoveryHomePage.jsx';
import { ServicesDiscoveryDetailModal } from '../../modes/services/storefront/components/ServicesDiscoveryDetailModal.jsx';

// Shared discovery route presentation boundary for the public discovery page and
// the Services detail overlay. Runtime behavior remains owned by StorefrontApp.
export function StorefrontDiscoveryRouteContainer({ discoveryProps, serviceDetailProps }) {
  return (
    <>
      <DiscoveryHomePage {...discoveryProps} />
      <ServicesDiscoveryDetailModal {...serviceDetailProps} />
    </>
  );
}
