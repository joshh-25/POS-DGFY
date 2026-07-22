/**
 * uiSelectors — reference selectors for the ui slice.
 *
 * Selectors are plain functions of state, kept out of components so subscription
 * shape is centralised and testable. Components pass these directly:
 *   const isMobile = useStorefrontStore(selectIsMobileViewport);
 *
 * Rule (see docs/refactor/STOREFRONT_STATE_MANAGEMENT.md): subscribe to the
 * MINIMAL value you need. Return primitives where possible; only return a fresh
 * object/array with `useShallow` to avoid re-render churn. Derived values live
 * here as selector functions, never duplicated into stored state.
 */

export const selectIsOnlinePaymentModalOpen = (s) => s.ui.isOnlinePaymentModalOpen;
export const selectShowOrderSuccessAnimation = (s) => s.ui.showOrderSuccessAnimation;
export const selectIsMobileViewport = (s) => s.ui.isMobileViewport;
