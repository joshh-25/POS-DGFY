import React from 'react';
import { createDiscoveryResultsRenderer } from '../../features/discovery/renderers/discoveryResultsRenderer.jsx';

export function DiscoveryRouteContainer({ rendererProps }) {
  const renderDiscoveryResultsStage = createDiscoveryResultsRenderer(rendererProps);
  return renderDiscoveryResultsStage();
}
