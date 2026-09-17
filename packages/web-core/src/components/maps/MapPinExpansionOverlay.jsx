import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '../../lib/utils.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export const getScrollableAncestor = (element) => {
  if (typeof window === 'undefined') return null;
  let current = element?.parentElement;
  while (current && current !== document.body) {
    const styles = window.getComputedStyle(current);
    const overflowY = styles.overflowY || styles.overflow;
    if (/(auto|scroll|overlay)/.test(overflowY)) {
      return current;
    }
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement;
};

const lockScrollParent = (element) => {
  if (!element) return;
  element.style.overflow = 'hidden';
  element.style.overflowY = 'hidden';
  element.style.overscrollBehavior = 'none';
};

const restoreScrollParentStyles = (element, previousStyles) => {
  if (!element || !previousStyles) return;
  element.style.overflow = previousStyles.overflow;
  element.style.overflowY = previousStyles.overflowY;
  element.style.overscrollBehavior = previousStyles.overscrollBehavior;
};

export default function MapPinExpansionOverlay({
  open,
  bounds,
  scrimBounds,
  boundaryRef,
  scrollParentRef = null,
  anchorRef,
  titleId,
  onClose,
  getBounds,
  getScrimBounds,
  onBoundsChange,
  onScrimBoundsChange,
  onMapResize,
  search,
  collapsedClassName,
  children
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const wasOpenRef = useRef(false);
  const getBoundsRef = useRef(getBounds);
  const getScrimBoundsRef = useRef(getScrimBounds);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const onScrimBoundsChangeRef = useRef(onScrimBoundsChange);
  const onMapResizeRef = useRef(onMapResize);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    getBoundsRef.current = getBounds;
    getScrimBoundsRef.current = getScrimBounds;
    onBoundsChangeRef.current = onBoundsChange;
    onScrimBoundsChangeRef.current = onScrimBoundsChange;
    onMapResizeRef.current = onMapResize;
    onCloseRef.current = onClose;
  }, [getBounds, getScrimBounds, onBoundsChange, onScrimBoundsChange, onMapResize, onClose]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    const previousOverflow = document.body.style.overflow;
    const scrollParent = scrollParentRef?.current || getScrollableAncestor(boundaryRef?.current);
    const previousScrollParentStyles = scrollParent
      ? {
        overflow: scrollParent.style.overflow,
        overflowY: scrollParent.style.overflowY,
        overscrollBehavior: scrollParent.style.overscrollBehavior
      }
      : null;

    const resizeMap = () => {
      const nextBounds = getBoundsRef.current?.();
      if (nextBounds) onBoundsChangeRef.current?.(nextBounds);
      const nextScrimBounds = getScrimBoundsRef.current?.();
      if (nextScrimBounds) onScrimBoundsChangeRef.current?.(nextScrimBounds);
      onMapResizeRef.current?.();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastFocusable : firstFocusable).focus();
      } else if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    lockScrollParent(scrollParent);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', resizeMap);
    window.addEventListener('orientationchange', resizeMap);
    window.addEventListener('scroll', resizeMap, true);
    window.visualViewport?.addEventListener('resize', resizeMap);
    window.visualViewport?.addEventListener('scroll', resizeMap);

    let boundaryObserver;
    if (typeof ResizeObserver !== 'undefined' && boundaryRef?.current) {
      boundaryObserver = new ResizeObserver(resizeMap);
      boundaryObserver.observe(boundaryRef.current);
    }

    const timer = window.setTimeout(resizeMap, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', resizeMap);
      window.removeEventListener('orientationchange', resizeMap);
      window.removeEventListener('scroll', resizeMap, true);
      window.visualViewport?.removeEventListener('resize', resizeMap);
      window.visualViewport?.removeEventListener('scroll', resizeMap);
      boundaryObserver?.disconnect();
      document.body.style.overflow = previousOverflow;
      restoreScrollParentStyles(scrollParent, previousScrollParentStyles);
    };
  }, [open, boundaryRef, scrollParentRef]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }

    if (!wasOpenRef.current) return undefined;
    wasOpenRef.current = false;
    const timer = window.setTimeout(() => anchorRef?.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, anchorRef]);

  return (
    <>
      {open ? (
        <button
          type="button"
          style={scrimBounds || undefined}
          className="fixed z-40 cursor-default bg-slate-950/25"
          aria-label="Dismiss expanded map"
          tabIndex={-1}
          onClick={onClose}
        />
      ) : null}
      <div
        ref={dialogRef}
        style={open && bounds ? bounds : undefined}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? 'true' : undefined}
        aria-labelledby={open ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full overflow-hidden border border-slate-200 bg-slate-100 shadow-sm',
          open ? 'fixed z-50 flex min-h-0 flex-col rounded-2xl shadow-2xl' : collapsedClassName
        )}
      >
        {open ? (
          <div className="shrink-0 border-b border-slate-200 bg-white p-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-extrabold text-[#0F172A]">Set branch location</h2>
              </div>
              <Button
                ref={closeButtonRef}
                type="button"
                variant="outline"
                onClick={onClose}
                aria-label="Close expanded map"
                title="Close expanded map"
                className="min-h-11 min-w-11 shrink-0 rounded-lg border-slate-300 p-0 text-slate-700 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Close expanded map</span>
              </Button>
            </div>
            <div className="mt-3">{search}</div>
          </div>
        ) : null}
        <div className={cn('relative min-h-0', open ? 'flex-1' : 'h-full')}>{children}</div>
      </div>
    </>
  );
}
