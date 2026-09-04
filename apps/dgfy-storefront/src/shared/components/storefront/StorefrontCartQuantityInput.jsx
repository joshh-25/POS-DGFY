import { useCallback, useEffect, useRef, useState } from 'react';

import { STOREFRONT_CART_MOTION } from '../../theme/storefrontMotionTokens.js';

const requestMotionFrame = (callback) => {
  if (typeof window.requestAnimationFrame === 'function') return window.requestAnimationFrame(callback);
  return window.setTimeout(() => callback(window.performance?.now?.() || Date.now()), 16);
};

const cancelMotionFrame = (frameId) => {
  if (frameId === null || frameId === undefined) return;
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }
  window.clearTimeout(frameId);
};

const easeCartMotion = (progress) => 1 - ((1 - Math.min(1, Math.max(0, progress))) ** 3);

/**
 * Neutral cart quantity editor shared by product and service storefront modes.
 * A draft is committed only on blur or Enter, preventing a temporary empty or
 * invalid value from mutating or removing a cart line.
 */
export function StorefrontCartQuantityInput({
  cartLineId = '',
  itemId,
  lineName,
  onFocusChange,
  onUpdateQuantity,
  quantity,
  scrollContainerSelector = '[data-storefront-cart-lines="true"]'
}) {
  const [draftQuantity, setDraftQuantity] = useState(String(quantity));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const alignmentFrameRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const scrollAnimationStateRef = useRef(null);

  useEffect(() => {
    setDraftQuantity(String(quantity));
  }, [quantity]);

  const commitQuantity = useCallback(() => {
    const nextQuantity = Number.parseInt(draftQuantity, 10);
    if (!Number.isInteger(nextQuantity) || nextQuantity < 1) {
      setDraftQuantity(String(quantity));
      return;
    }

    setDraftQuantity(String(nextQuantity));
    if (nextQuantity !== quantity) onUpdateQuantity(itemId, nextQuantity, cartLineId);
  }, [cartLineId, draftQuantity, itemId, onUpdateQuantity, quantity]);

  const selectQuantity = useCallback(() => {
    const input = inputRef.current;
    if (!input || typeof input.setSelectionRange !== 'function') return;
    input.setSelectionRange(0, input.value.length);
  }, []);

  const cancelInputAlignment = useCallback(() => {
    cancelMotionFrame(alignmentFrameRef.current);
    cancelMotionFrame(scrollFrameRef.current);
    alignmentFrameRef.current = null;
    scrollFrameRef.current = null;
    scrollAnimationStateRef.current = null;
  }, []);

  const cancelScheduledAlignment = useCallback(() => {
    cancelMotionFrame(alignmentFrameRef.current);
    alignmentFrameRef.current = null;
  }, []);

  const keepInputVisible = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    cancelScheduledAlignment();
    alignmentFrameRef.current = requestMotionFrame(() => {
      alignmentFrameRef.current = null;
      const scrollContainer = input.closest(scrollContainerSelector);
      if (scrollContainer) {
        const containerBounds = scrollContainer.getBoundingClientRect();
        const inputBounds = input.getBoundingClientRect();
        const targetTop = inputBounds.top - containerBounds.top + scrollContainer.scrollTop - 12;
        const startTop = scrollContainer.scrollTop;
        const nextTop = Math.max(0, targetTop);
        const activeAnimation = scrollAnimationStateRef.current;
        if (activeAnimation) {
          activeAnimation.targetTop = nextTop;
          return;
        }

        const distance = nextTop - startTop;
        if (Math.abs(distance) < 1) return;

        const animationState = {
          scrollContainer,
          startTop,
          targetTop: nextTop,
          startedAt: window.performance?.now?.() || Date.now()
        };
        scrollAnimationStateRef.current = animationState;
        const animateScroll = (now) => {
          if (scrollAnimationStateRef.current !== animationState) return;
          const progress = Math.min(1, (now - animationState.startedAt) / STOREFRONT_CART_MOTION.durationMs);
          const animationDistance = animationState.targetTop - animationState.startTop;
          animationState.scrollContainer.scrollTop = animationState.startTop + (animationDistance * easeCartMotion(progress));
          if (progress < 1) {
            scrollFrameRef.current = requestMotionFrame(animateScroll);
          } else {
            animationState.scrollContainer.scrollTop = animationState.targetTop;
            scrollFrameRef.current = null;
            scrollAnimationStateRef.current = null;
          }
        };

        scrollFrameRef.current = requestMotionFrame(animateScroll);
        return;
      }

      input.scrollIntoView?.({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    });
  }, [cancelScheduledAlignment, scrollContainerSelector]);

  useEffect(() => () => cancelInputAlignment(), [cancelInputAlignment]);

  useEffect(() => {
    if (!isFocused) return undefined;

    const viewport = window.visualViewport;
    const handleViewportResize = () => keepInputVisible();
    const timeoutId = window.setTimeout(keepInputVisible, 250);
    viewport?.addEventListener('resize', handleViewportResize);

    return () => {
      window.clearTimeout(timeoutId);
      viewport?.removeEventListener('resize', handleViewportResize);
    };
  }, [isFocused, keepInputVisible]);

  return (
    <input
      ref={inputRef}
      type="text"
      role="spinbutton"
      aria-valuemin="1"
      aria-valuenow={Number.parseInt(draftQuantity, 10) || quantity}
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={`Quantity for ${lineName}`}
      value={draftQuantity}
      onBeforeInput={(event) => {
        if (event.data && /[^0-9]/.test(event.data)) event.preventDefault();
      }}
      onChange={(event) => setDraftQuantity(event.target.value.replace(/[^0-9]/g, ''))}
      onFocus={() => {
        setIsFocused(true);
        onFocusChange?.(true);
        selectQuantity();
        keepInputVisible();
      }}
      onClick={() => {
        selectQuantity();
        keepInputVisible();
      }}
      onBlur={() => {
        setIsFocused(false);
        onFocusChange?.(false);
        cancelInputAlignment();
        commitQuantity();
      }}
      onKeyDown={(event) => {
        if (event.key.length === 1 && /[^0-9]/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          commitQuantity();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraftQuantity(String(quantity));
          event.currentTarget.blur();
        }
      }}
      // iOS Safari magnifies focused inputs rendered below 16 CSS pixels. Keep
      // this shared mobile/desktop editor at that threshold rather than blocking
      // user zoom in the viewport declaration.
      style={{ width: 42, minWidth: 24, height: 28, border: 'none', outline: 'none', background: 'transparent', color: '#0f172a', textAlign: 'center', fontSize: 16, fontWeight: 800, lineHeight: 1, padding: 0, fontFamily: 'inherit', scrollMarginBlockStart: 12 }}
    />
  );
}
