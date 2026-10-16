import { useCallback, useEffect } from 'react';
import { appBasePath } from '../../app/runtime/storefrontRuntime.js';

export function useDiscoveryNavActions({
  isDiscoveryMobileViewport,
  setActiveDiscoveryNavItem,
  setIsDiscoveryNavMenuOpen,
  onNavigateToDiscovery
}) {
  useEffect(() => {
    if (!isDiscoveryMobileViewport) {
      setIsDiscoveryNavMenuOpen(false);
    }
  }, [isDiscoveryMobileViewport, setIsDiscoveryNavMenuOpen]);

  const handleDiscoveryMenuToggle = useCallback(() => {
    setIsDiscoveryNavMenuOpen((open) => !open);
  }, [setIsDiscoveryNavMenuOpen]);

  const handleDiscoveryExploreClick = useCallback(() => {
    setActiveDiscoveryNavItem('Explore');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [setActiveDiscoveryNavItem]);

  const handleDiscoveryNavItemClick = useCallback((item) => {
    const nextItem = String(item || '').trim();
    if (!nextItem) return;

    setIsDiscoveryNavMenuOpen(false);

    if (nextItem === 'Explore') {
      if (typeof onNavigateToDiscovery === 'function') {
        setActiveDiscoveryNavItem(nextItem);
        onNavigateToDiscovery(nextItem);
        return;
      }
      handleDiscoveryExploreClick();
      return;
    }

    if (nextItem === 'Solutions' && typeof window !== 'undefined') {
      setActiveDiscoveryNavItem('Solutions');
      if (typeof onNavigateToDiscovery === 'function') {
        onNavigateToDiscovery(nextItem);
        return;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (nextItem === 'Contact Us' && typeof window !== 'undefined') {
      const basePath = appBasePath === '/' ? '' : appBasePath;
      const contactPath = `${basePath}/contact-us`;
      const currentPath = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
      if (currentPath === contactPath) return;
      window.history.pushState({}, '', contactPath);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }

    setActiveDiscoveryNavItem(nextItem);
  }, [
    handleDiscoveryExploreClick,
    onNavigateToDiscovery,
    setActiveDiscoveryNavItem,
    setIsDiscoveryNavMenuOpen
  ]);

  return {
    handleDiscoveryExploreClick,
    handleDiscoveryMenuToggle,
    handleDiscoveryNavItemClick
  };
}
