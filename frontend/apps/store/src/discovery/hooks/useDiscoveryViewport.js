import { useMemo } from 'react';
import {
  getDiscoveryLayoutTokens,
  getDiscoveryViewportState
} from '../../Components/store/DiscoveryResponsiveLayout.jsx';

export function useDiscoveryViewport(viewportWidth) {
  const discoveryViewport = useMemo(
    () => getDiscoveryViewportState(viewportWidth),
    [viewportWidth]
  );
  const discoveryLayout = useMemo(
    () => getDiscoveryLayoutTokens(discoveryViewport.viewportMode),
    [discoveryViewport.viewportMode]
  );

  return {
    discoveryLayout,
    discoveryViewport,
    discoveryViewportMode: discoveryViewport.viewportMode,
    isDiscoveryDesktopViewport: discoveryViewport.isDesktopViewport,
    isDiscoveryMobileViewport: discoveryViewport.isMobileViewport,
    isDiscoveryTabletViewport: discoveryViewport.isTabletViewport
  };
}
