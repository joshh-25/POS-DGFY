import { useCallback, useEffect } from 'react';

export default function usePosCenteredTabScroll(viewportRef, activeTabElementId) {
  const centerActiveTab = useCallback(() => {
    if (typeof window === 'undefined' || !activeTabElementId) return undefined;

    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth <= 0 || viewport.scrollWidth <= viewport.clientWidth) {
      return undefined;
    }

    const activeTabElement = document.getElementById(activeTabElementId);
    if (!activeTabElement || !viewport.contains(activeTabElement)) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const viewportRect = viewport.getBoundingClientRect();
      const tabRect = activeTabElement.getBoundingClientRect();
      const tabCenter = tabRect.left - viewportRect.left + viewport.scrollLeft + (tabRect.width / 2);
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);

      viewport.scrollTo({
        left: Math.min(maxScrollLeft, Math.max(0, tabCenter - (viewport.clientWidth / 2))),
        behavior: 'smooth'
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeTabElementId, viewportRef]);

  useEffect(() => centerActiveTab(), [centerActiveTab]);

  return centerActiveTab;
}
