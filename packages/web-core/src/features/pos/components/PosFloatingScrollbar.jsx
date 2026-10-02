import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_THUMB_PERCENT = 14;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const readMetrics = (element) => {
  if (!element) {
    return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 };
  }

  return {
    clientHeight: element.clientHeight,
    scrollHeight: Math.max(element.scrollHeight, element.clientHeight),
    scrollTop: element.scrollTop
  };
};

export default function PosFloatingScrollbar({
  scrollRef,
  targetId,
  label = 'Filter dialog scroll'
}) {
  const scrollElementRef = useRef(null);
  const [metrics, setMetrics] = useState({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 });

  const syncMetrics = useCallback(() => {
    const nextMetrics = readMetrics(scrollRef?.current);
    setMetrics((currentMetrics) => (
      currentMetrics.clientHeight === nextMetrics.clientHeight
      && currentMetrics.scrollHeight === nextMetrics.scrollHeight
      && currentMetrics.scrollTop === nextMetrics.scrollTop
        ? currentMetrics
        : nextMetrics
    ));
  }, [scrollRef]);

  useEffect(() => {
    const element = scrollRef?.current;
    if (!element) return undefined;

    scrollElementRef.current = element;
    const initialSyncFrame = window.requestAnimationFrame
      ? window.requestAnimationFrame(syncMetrics)
      : window.setTimeout(syncMetrics, 0);
    element.addEventListener('scroll', syncMetrics, { passive: true });
    window.addEventListener('resize', syncMetrics);

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(syncMetrics)
      : null;
    resizeObserver?.observe(element);

    const mutationObserver = typeof MutationObserver === 'function'
      ? new MutationObserver(syncMetrics)
      : null;
    mutationObserver?.observe(element, { childList: true, subtree: true, attributes: true });

    return () => {
      element.removeEventListener('scroll', syncMetrics);
      window.removeEventListener('resize', syncMetrics);
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(initialSyncFrame);
      else window.clearTimeout(initialSyncFrame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      scrollElementRef.current = null;
    };
  }, [scrollRef, syncMetrics]);

  const scrollRange = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const thumbHeight = scrollRange === 0
    ? 100
    : Math.max(MIN_THUMB_PERCENT, (metrics.clientHeight / metrics.scrollHeight) * 100);
  const thumbTop = scrollRange === 0
    ? 0
    : (metrics.scrollTop / scrollRange) * (100 - thumbHeight);

  const setScrollFromClientY = useCallback((clientY, trackRect) => {
    const element = scrollElementRef.current;
    if (!element || trackRect.height <= 0) return;

    const ratio = clamp((clientY - trackRect.top) / trackRect.height, 0, 1);
    element.scrollTop = ratio * scrollRange;
  }, [scrollRange]);

  const handleTrackPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    setScrollFromClientY(event.clientY, event.currentTarget.getBoundingClientRect());
    event.preventDefault();
  };

  const handleThumbPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    const element = scrollElementRef.current;
    if (!element) return;

    const startClientY = event.clientY;
    const startScrollTop = element.scrollTop;
    const trackHeight = event.currentTarget.parentElement?.getBoundingClientRect().height || 0;
    const thumbHeightPixels = trackHeight * (thumbHeight / 100);
    const maxThumbTravel = Math.max(1, trackHeight - thumbHeightPixels);

    const handlePointerMove = (moveEvent) => {
      element.scrollTop = startScrollTop + ((moveEvent.clientY - startClientY) / maxThumbTravel) * scrollRange;
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', cleanup, { once: true });
    window.addEventListener('pointercancel', cleanup, { once: true });
    event.preventDefault();
    event.stopPropagation();
  };

  const handleKeyDown = (event) => {
    const element = scrollElementRef.current;
    if (!element) return;

    let nextScrollTop;
    switch (event.key) {
      case 'ArrowDown':
        nextScrollTop = element.scrollTop + 40;
        break;
      case 'ArrowUp':
        nextScrollTop = element.scrollTop - 40;
        break;
      case 'PageDown':
        nextScrollTop = element.scrollTop + element.clientHeight;
        break;
      case 'PageUp':
        nextScrollTop = element.scrollTop - element.clientHeight;
        break;
      case 'Home':
        nextScrollTop = 0;
        break;
      case 'End':
        nextScrollTop = scrollRange;
        break;
      default:
        return;
    }

    event.preventDefault();
    element.scrollTop = clamp(nextScrollTop, 0, scrollRange);
  };

  return (
    <div
      className="dgfy-pos-floating-scrollbar absolute inset-y-2 right-1 z-20 w-2 rounded-full bg-slate-200/70 p-px"
      data-testid="pos-reports-filter-floating-scrollbar"
      role="scrollbar"
      aria-controls={targetId}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin="0"
      aria-valuemax={scrollRange}
      aria-valuenow={Math.round(metrics.scrollTop)}
      tabIndex={0}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      onPointerDown={handleTrackPointerDown}
      onWheel={(event) => {
        const element = scrollElementRef.current;
        if (!element) return;
        element.scrollTop += event.deltaY;
        event.preventDefault();
      }}
    >
      <div
        className="absolute left-px right-px rounded-full bg-slate-500/80 transition-colors hover:bg-slate-600"
        style={{ top: `${thumbTop}%`, height: `${thumbHeight}%` }}
        onPointerDown={handleThumbPointerDown}
      />
    </div>
  );
}
