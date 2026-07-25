import { useEffect, useRef, useState } from 'react';

export function useDiscoveryCategoryRail({ isDiscoveryMobileViewport }) {
  const [isCategoryRowExpanded, setIsCategoryRowExpanded] = useState(false);
  const [hasDesktopCategoryOverflow, setHasDesktopCategoryOverflow] = useState(false);
  const [showDesktopCategoryOverflowCue, setShowDesktopCategoryOverflowCue] = useState(false);
  const [mobileCategoryGroupIndex, setMobileCategoryGroupIndex] = useState(0);
  const mobileCategoryRailRef = useRef(null);
  const desktopCategoryRailRef = useRef(null);

  useEffect(() => {
    if (isDiscoveryMobileViewport) {
      return undefined;
    }

    const railElement = desktopCategoryRailRef.current;
    if (!railElement) return undefined;

    const syncDesktopCategoryOverflow = () => {
      const maxScrollLeft = Math.max(0, railElement.scrollWidth - railElement.clientWidth);
      setHasDesktopCategoryOverflow(maxScrollLeft > 8);
      setShowDesktopCategoryOverflowCue(maxScrollLeft > 8 && railElement.scrollLeft < (maxScrollLeft - 8));
    };

    syncDesktopCategoryOverflow();
    railElement.addEventListener('scroll', syncDesktopCategoryOverflow, { passive: true });
    window.addEventListener('resize', syncDesktopCategoryOverflow);
    return () => {
      railElement.removeEventListener('scroll', syncDesktopCategoryOverflow);
      window.removeEventListener('resize', syncDesktopCategoryOverflow);
    };
  }, [isCategoryRowExpanded, isDiscoveryMobileViewport]);

  return {
    desktopCategoryRailRef,
    hasDesktopCategoryOverflow: isDiscoveryMobileViewport ? false : hasDesktopCategoryOverflow,
    isCategoryRowExpanded,
    mobileCategoryGroupIndex,
    mobileCategoryRailRef,
    setIsCategoryRowExpanded,
    setMobileCategoryGroupIndex,
    showDesktopCategoryOverflowCue: isDiscoveryMobileViewport ? false : showDesktopCategoryOverflowCue
  };
}
