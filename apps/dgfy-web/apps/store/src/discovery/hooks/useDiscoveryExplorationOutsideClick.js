import { useEffect, useRef } from 'react';

export function useDiscoveryExplorationOutsideClick({
  hasDiscoveryExplorationStarted,
  hasDiscoverySearch,
  isDiscoverySearchFocused,
  setHasDiscoveryExplorationStarted
}) {
  const discoveryInteractiveAreaRef = useRef(null);

  useEffect(() => {
    if (!hasDiscoveryExplorationStarted || hasDiscoverySearch || isDiscoverySearchFocused) return undefined;

    const handlePointerDownOutsideDiscovery = (event) => {
      const interactionArea = discoveryInteractiveAreaRef.current;
      if (!interactionArea) return;
      if (interactionArea.contains(event.target)) return;
      setHasDiscoveryExplorationStarted(false);
    };

    document.addEventListener('pointerdown', handlePointerDownOutsideDiscovery);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutsideDiscovery);
    };
  }, [
    hasDiscoveryExplorationStarted,
    hasDiscoverySearch,
    isDiscoverySearchFocused,
    setHasDiscoveryExplorationStarted
  ]);

  return {
    discoveryInteractiveAreaRef
  };
}
