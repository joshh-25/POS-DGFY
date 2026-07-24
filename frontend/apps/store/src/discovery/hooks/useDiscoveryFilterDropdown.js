import { useEffect, useRef } from 'react';

export function useDiscoveryFilterDropdown({ setActiveDiscoveryFilterDropdown }) {
  const discoveryFilterToolbarRef = useRef(null);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!discoveryFilterToolbarRef.current?.contains(event.target)) {
        setActiveDiscoveryFilterDropdown(null);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [setActiveDiscoveryFilterDropdown]);

  return {
    discoveryFilterToolbarRef
  };
}
