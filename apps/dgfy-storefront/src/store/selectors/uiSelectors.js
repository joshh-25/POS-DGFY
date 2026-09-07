/**
 * uiSelectors — reference selectors for the ui slice.
 *
 * Selectors are plain functions of state, kept out of components so subscription
 * shape is centralised and testable. Components pass these directly:
 *   const viewportWidth = useStorefrontStore(selectViewportWidth);
 *
 * Rule (see docs/refactor/STOREFRONT_STATE_MANAGEMENT.md): subscribe to the
 * MINIMAL value you need, and DERIVE breakpoints here rather than storing them.
 * Return primitives where possible; only return a fresh object/array with
 * `useShallow` to avoid re-render churn.
 */

export const selectViewportWidth = (s) => s.ui.viewportWidth;

// Derived breakpoints (mirror the thresholds StorefrontApp.jsx computes inline).
export const selectIsMobileViewport = (s) => s.ui.viewportWidth < 840;
export const selectIsDesktopViewport = (s) => s.ui.viewportWidth >= 1024;

export const selectIsOnlinePaymentModalOpen = (s) => s.ui.isOnlinePaymentModalOpen;
export const selectIsAccountDrawerOpen = (s) => s.ui.isAccountDrawerOpen;
export const selectIsAboutExpanded = (s) => s.ui.isAboutExpanded;
export const selectIsServiceGalleryExpanded = (s) => s.ui.isServiceGalleryExpanded;
export const selectShowOrderSuccessAnimation = (s) => s.ui.showOrderSuccessAnimation;
