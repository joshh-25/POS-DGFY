import { useCallback, useEffect } from 'react';

export function useDiscoveryNavActions({
  activeDiscoveryNavItem,
  isDiscoveryMobileViewport,
  setActiveDiscoveryNavItem,
  setIsDiscoveryNavMenuOpen
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
      handleDiscoveryExploreClick();
      return;
    }

    if (nextItem === 'Solutions' && typeof window !== 'undefined') {
      setActiveDiscoveryNavItem('Solutions');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (nextItem === 'Contact Us' && typeof document !== 'undefined') {
      const contactAnchor = document.getElementById(
        activeDiscoveryNavItem === 'Solutions' ? 'solutions-contact-anchor' : 'discovery-contact-anchor'
      );
      if (contactAnchor && typeof contactAnchor.scrollIntoView === 'function') {
        contactAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    setActiveDiscoveryNavItem(nextItem);
  }, [
    activeDiscoveryNavItem,
    handleDiscoveryExploreClick,
    setActiveDiscoveryNavItem,
    setIsDiscoveryNavMenuOpen
  ]);

  return {
    handleDiscoveryExploreClick,
    handleDiscoveryMenuToggle,
    handleDiscoveryNavItemClick
  };
}
