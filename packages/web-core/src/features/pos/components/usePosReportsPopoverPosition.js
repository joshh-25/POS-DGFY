import { useLayoutEffect, useState } from 'react';

const VIEWPORT_PADDING = 16;
const ANCHOR_GAP = 12;

export default function usePosReportsPopoverPosition({
  open = false,
  anchorRef,
  maxWidth = 480
} = {}) {
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    const updatePosition = () => {
      const viewportWidth = window.innerWidth || 1024;
      const viewportHeight = window.innerHeight || 768;
      const width = Math.min(maxWidth, Math.max(240, viewportWidth - (VIEWPORT_PADDING * 2)));
      const anchorRect = anchorRef?.current?.getBoundingClientRect?.();
      const requestedTop = anchorRect ? anchorRect.bottom + ANCHOR_GAP : 80;
      const top = Math.max(VIEWPORT_PADDING, requestedTop);
      const left = anchorRect
        ? Math.min(
          Math.max(VIEWPORT_PADDING, anchorRect.right - width),
          Math.max(VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING)
        )
        : VIEWPORT_PADDING;
      const availableHeight = viewportHeight - top - VIEWPORT_PADDING;
      const shouldConstrainHeight = viewportWidth < 1024 || availableHeight < 560;

      setPosition({
        top,
        left,
        width,
        maxHeight: shouldConstrainHeight ? Math.max(180, availableHeight) : null
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, maxWidth, open]);

  return position;
}
