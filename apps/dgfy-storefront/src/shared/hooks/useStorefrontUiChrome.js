import { useEffect } from 'react';

import { useStorefrontStore } from '../../store/useStorefrontStore.js';
import {
  selectIsAboutExpanded,
  selectIsServiceGalleryExpanded
} from '../../store/selectors/uiSelectors.js';

/**
 * Stateful hook that owns storefront UI-chrome state and its self-contained
 * side effects. Moved verbatim from `StorefrontApp.jsx`: the About/service
 * gallery expand/collapse booleans, the body-scroll-lock effect, the
 * order-success-animation-timer cleanup effect, the window-resize effect,
 * and the service-worker registration/dev-cleanup effect. All four effects
 * are self-contained (no cross-domain coupling) and every external value
 * they read is passed in as an explicit param.
 */
export function useStorefrontUiChrome({
  appBasePath,
  isAccountDrawerOpen,
  isCheckoutOpen,
  isFnbOrderSubpage,
  isGuestTrackingDrawerOpen,
  isStandaloneAccountPage,
  orderSuccessAnimationTimerRef,
  serviceWorkerUrl,
  setViewportWidth
}) {
  const isAboutExpanded = useStorefrontStore(selectIsAboutExpanded);
  const setIsAboutExpanded = useStorefrontStore((state) => state.uiSetAboutExpanded);
  const isServiceGalleryExpanded = useStorefrontStore(selectIsServiceGalleryExpanded);
  const setIsServiceGalleryExpanded = useStorefrontStore((state) => state.uiSetServiceGalleryExpanded);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const lockBodyScroll = isFnbOrderSubpage || isCheckoutOpen || isGuestTrackingDrawerOpen || (isAccountDrawerOpen && !isStandaloneAccountPage);
    if (!lockBodyScroll) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousHeight = document.body.style.height;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    const previousTouchAction = document.body.style.touchAction;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const shouldPreserveCartScroll = isCheckoutOpen;

    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'manipulation';
    if (shouldPreserveCartScroll) {
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.height = 'auto';
      document.body.style.overflow = 'visible';
    } else {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.height = previousHeight;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
      document.body.style.touchAction = previousTouchAction;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      if (shouldPreserveCartScroll) window.scrollTo({ top: scrollY, behavior: 'auto' });
    };
  }, [isAccountDrawerOpen, isCheckoutOpen, isFnbOrderSubpage, isGuestTrackingDrawerOpen, isStandaloneAccountPage]);

  useEffect(() => () => {
    if (orderSuccessAnimationTimerRef.current) {
      window.clearTimeout(orderSuccessAnimationTimerRef.current);
      orderSuccessAnimationTimerRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setViewportWidth]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => { });
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(
            keys
              .filter((k) => k.startsWith('sku-store-shell-') || k.startsWith('sku-store-runtime-'))
              .map((k) => caches.delete(k))
          ))
          .catch(() => { });
      }
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const probe = await fetch(serviceWorkerUrl, { method: 'GET', cache: 'no-store' });
        const contentType = String(probe.headers.get('content-type') || '').toLowerCase();
        const scriptLike = contentType.includes('javascript') || contentType.includes('ecmascript');
        if (!probe.ok || !scriptLike) {
          console.warn('[StorefrontPWA] Skipping service worker registration due to invalid script response', {
            status: probe.status,
            contentType
          });
          return;
        }
        await navigator.serviceWorker.register(serviceWorkerUrl, {
          scope: appBasePath === '/' ? '/' : `${appBasePath}/`,
          updateViaCache: 'none'
        });
      } catch (error) {
        console.warn('[StorefrontPWA] Service worker registration failed', {
          error: error?.message || 'unknown_error'
        });
      }
    };

    registerServiceWorker();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isAboutExpanded,
    setIsAboutExpanded,
    isServiceGalleryExpanded,
    setIsServiceGalleryExpanded
  };
}
