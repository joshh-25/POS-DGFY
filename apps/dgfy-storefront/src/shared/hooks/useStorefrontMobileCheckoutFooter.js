import { useEffect, useRef } from 'react';

const FOOTER_RESERVE_VARIABLE = '--storefront-mobile-checkout-footer-reserve';
const FALLBACK_FOOTER_RESERVE = '196px';
const FOOTER_CONTENT_GAP = 16;

function getFooterReserve(footer) {
  const footerHeight = Number(footer?.getBoundingClientRect?.().height || 0);
  if (!Number.isFinite(footerHeight) || footerHeight <= 0) return null;
  return `${Math.ceil(footerHeight + FOOTER_CONTENT_GAP)}px`;
}

/**
 * Keeps mobile checkout content clear of the persistent order-summary footer.
 * The fallback preserves the existing layout before the first measurement;
 * ResizeObserver covers changing labels, safe-area insets, and viewport widths.
 */
export function useStorefrontMobileCheckoutFooter() {
  const footerRef = useRef(null);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const footer = footerRef.current;
    const root = document.documentElement;
    if (!footer || !root) return undefined;

    const scrollRoots = Array.from(document.querySelectorAll('[data-storefront-checkout-scroll-root]'));
    const previousRootVariable = root.style.getPropertyValue(FOOTER_RESERVE_VARIABLE);
    const previousRootScrollPadding = root.style.scrollPaddingBottom;
    const previousScrollRootPadding = scrollRoots.map((scrollRoot) => ({
      element: scrollRoot,
      value: scrollRoot.style.scrollPaddingBottom,
    }));

    const updateReserve = () => {
      const reserve = getFooterReserve(footer);
      if (!reserve) return;

      root.style.setProperty(FOOTER_RESERVE_VARIABLE, reserve);
      root.style.scrollPaddingBottom = reserve;
      scrollRoots.forEach((scrollRoot) => {
        scrollRoot.style.scrollPaddingBottom = reserve;
      });
    };

    root.style.setProperty(FOOTER_RESERVE_VARIABLE, FALLBACK_FOOTER_RESERVE);
    updateReserve();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateReserve)
      : null;
    resizeObserver?.observe(footer);

    const handleViewportResize = () => updateReserve();
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', handleViewportResize);
    window.visualViewport?.addEventListener?.('resize', handleViewportResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('orientationchange', handleViewportResize);
      window.visualViewport?.removeEventListener?.('resize', handleViewportResize);

      if (previousRootVariable) root.style.setProperty(FOOTER_RESERVE_VARIABLE, previousRootVariable);
      else root.style.removeProperty(FOOTER_RESERVE_VARIABLE);
      root.style.scrollPaddingBottom = previousRootScrollPadding;
      previousScrollRootPadding.forEach(({ element, value }) => {
        element.style.scrollPaddingBottom = value;
      });
    };
  }, []);

  return footerRef;
}
