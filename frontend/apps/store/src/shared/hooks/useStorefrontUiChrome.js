import { useEffect, useState } from 'react';

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
  const [isAboutExpanded, setIsAboutExpanded] = useState(false);
  const [isServiceGalleryExpanded, setIsServiceGalleryExpanded] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const lockBodyScroll = isFnbOrderSubpage || isCheckoutOpen || isGuestTrackingDrawerOpen || (isAccountDrawerOpen && !isStandaloneAccountPage);
    if (!lockBodyScroll) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousHeight = document.body.style.height;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    const previousTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'manipulation';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.height = previousHeight;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
      document.body.style.touchAction = previousTouchAction;
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
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
