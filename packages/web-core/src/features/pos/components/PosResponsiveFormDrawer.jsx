import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

export const POS_MOBILE_MEDIA_QUERY = '(max-width: 767px)';
export const POS_TABLET_MEDIA_QUERY = '(min-width: 768px) and (max-width: 1199px)';

const getPosViewportMode = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
  if (window.matchMedia(POS_MOBILE_MEDIA_QUERY).matches) return 'mobile';
  if (window.matchMedia(POS_TABLET_MEDIA_QUERY).matches) return 'tablet';
  return 'desktop';
};

export function usePosViewportMode() {
  const [viewportMode, setViewportMode] = useState(getPosViewportMode);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mediaQueryLists = [
      window.matchMedia(POS_MOBILE_MEDIA_QUERY),
      window.matchMedia(POS_TABLET_MEDIA_QUERY)
    ];
    const handleChange = () => setViewportMode(getPosViewportMode());
    setViewportMode(getPosViewportMode());

    const cleanups = mediaQueryLists.map((mediaQueryList) => {
      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', handleChange);
        return () => mediaQueryList.removeEventListener('change', handleChange);
      }
      if (typeof mediaQueryList.addListener === 'function') {
        mediaQueryList.addListener(handleChange);
        return () => mediaQueryList.removeListener(handleChange);
      }
      return () => {};
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return viewportMode;
}

export function usePosVisualViewportMetrics(enabled) {
  const [metrics, setMetrics] = useState(null);
  const previousViewportRef = useRef(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const visualViewport = window.visualViewport;
    const update = (event) => {
      const visibleHeight = Math.max(0, Math.round(visualViewport?.height || window.innerHeight || 0));
      const windowHeight = Math.max(0, Math.round(window.innerHeight || 0));
      const windowWidth = Math.max(0, Math.round(window.innerWidth || 0));
      const offsetTop = Math.max(0, Math.round(visualViewport?.offsetTop || 0));
      const previousViewport = previousViewportRef.current;
      const focusedToggle = typeof document !== 'undefined'
        && document.activeElement?.matches?.('input[type="checkbox"], input[type="radio"]');
      const viewportWidthChanged = previousViewport && windowWidth !== previousViewport.windowWidth;

      // Mobile browsers can report transient viewport movement after a toggle
      // tap. Keep the sheet anchored until focus leaves the toggle; a width
      // change still passes through so orientation changes can be applied.
      if (event && focusedToggle && !viewportWidthChanged) return;

      const keyboardInset = visualViewport
        ? Math.max(0, Math.round(window.innerHeight - visibleHeight - offsetTop))
        : 0;

      const nextMetrics = {
        drawerMaxHeight: Math.max(180, visibleHeight - 8),
        formBodyMaxHeight: Math.max(120, visibleHeight - 160),
        keyboardInset
      };
      previousViewportRef.current = { visibleHeight, windowWidth };

      setMetrics((currentMetrics) => (
        currentMetrics
          && currentMetrics.drawerMaxHeight === nextMetrics.drawerMaxHeight
          && currentMetrics.formBodyMaxHeight === nextMetrics.formBodyMaxHeight
          && currentMetrics.keyboardInset === nextMetrics.keyboardInset
          ? currentMetrics
          : nextMetrics
      ));
    };

    update();
    window.addEventListener('resize', update);
    visualViewport?.addEventListener('resize', update);
    visualViewport?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      visualViewport?.removeEventListener('resize', update);
      visualViewport?.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return metrics;
}

export function usePosFormFocusScroll(enabled) {
  const formBodyRef = useRef(null);
  const focusTimerRef = useRef(null);

  const scrollFocusedField = (target) => {
    const scrollContainer = formBodyRef.current;
    if (!target || !scrollContainer?.contains(target)) return;
    if (target.tagName === 'INPUT' && ['checkbox', 'radio'].includes(target.type)) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (targetRect.top < containerRect.top) {
      scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - (containerRect.top - targetRect.top));
    } else if (targetRect.bottom > containerRect.bottom) {
      scrollContainer.scrollTop += targetRect.bottom - containerRect.bottom;
    }
  };

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const visualViewport = window.visualViewport;
    const handleViewportChange = () => {
      const activeElement = document.activeElement;
      if (!activeElement || !formBodyRef.current?.contains(activeElement)) return;
      const scroll = () => scrollFocusedField(activeElement);
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(scroll);
      else scroll();
    };

    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);
    return () => {
      visualViewport?.removeEventListener('resize', handleViewportChange);
      visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, [enabled]);

  useEffect(() => () => {
    if (focusTimerRef.current !== null && typeof window !== 'undefined') window.clearTimeout(focusTimerRef.current);
  }, []);

  const handleFocusCapture = (event) => {
    if (!enabled) return;
    const target = event.target;
    if (!target || !formBodyRef.current?.contains(target)) return;
    if (focusTimerRef.current !== null && typeof window !== 'undefined') window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = null;
    if (target.tagName === 'INPUT' && ['checkbox', 'radio'].includes(target.type)) return;

    const scroll = () => scrollFocusedField(target);
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(scroll);
    if (typeof window !== 'undefined') focusTimerRef.current = window.setTimeout(scroll, 250);
  };

  return { formBodyRef, handleFocusCapture };
}

export function PosResponsiveFormDrawer({ children, onClose, viewportMode, fillViewport = false }) {
  const [entered, setEntered] = useState(false);
  const viewportMetrics = usePosVisualViewportMetrics(true);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const enter = () => setEntered(true);
    const usesAnimationFrame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';
    const frame = typeof window === 'undefined'
      ? null
      : usesAnimationFrame
        ? window.requestAnimationFrame(enter)
        : window.setTimeout(enter, 0);

    return () => {
      if (frame === null || typeof window === 'undefined') return;
      if (usesAnimationFrame && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frame);
      } else {
        window.clearTimeout(frame);
      }
    };
  }, []);

  if (typeof document === 'undefined') return null;

  const drawerWidth = viewportMode === 'tablet' ? 'w-[min(100%,42rem)]' : 'w-full';
  const drawerStyle = viewportMetrics
    ? {
      bottom: `${viewportMetrics.keyboardInset}px`,
      maxHeight: `${viewportMetrics.drawerMaxHeight}px`,
      ...(fillViewport ? { height: `${viewportMetrics.drawerMaxHeight}px` } : {})
    }
    : undefined;
  const drawer = (
    <>
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[79] bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${entered ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        style={drawerStyle}
        className={`fixed inset-x-0 bottom-0 z-[80] mx-auto flex ${fillViewport ? 'h-[calc(100vh-0.5rem)] h-[calc(100dvh-0.5rem)]' : 'h-auto'} max-h-[calc(100vh-1rem)] max-h-[calc(100dvh-1rem)] ${drawerWidth} flex-col overflow-hidden rounded-t-2xl border border-b-0 border-slate-200 bg-white shadow-[0_-12px_30px_rgba(0,0,0,0.16)] transition-transform duration-200 ease-out motion-reduce:transition-none ${entered ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {children}
      </div>
    </>
  );

  return createPortal(drawer, document.body);
}
