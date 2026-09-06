/**
 * uiSlice — cross-cutting presentational state for the storefront shell.
 *
 * Owns viewport width + modal/overlay flags that today live as loose `useState`
 * in StorefrontApp.jsx. This is the WORKED REFERENCE slice: every other slice in
 * this folder follows its shape exactly.
 *
 * Convention (see docs/refactor/STOREFRONT_STATE_MANAGEMENT.md):
 *   - State is nested under a single domain key (`ui`) so persistence, resets,
 *     and selectors have a clean boundary and names can't collide across the ~96
 *     values being migrated out of the shell.
 *   - Actions are FLAT, top-level, named `<domain><Verb>` (e.g. `uiSetViewportWidth`).
 *   - Every setter goes through `set((s) => ({ ui: { ...s.ui, ... } }))` so the
 *     domain object is replaced immutably and unrelated slices are untouched.
 *   - DERIVED values (isMobileViewport, isDesktopViewport, …) are NOT stored —
 *     they are selectors in selectors/uiSelectors.js computed from `viewportWidth`.
 */

const readInitialViewportWidth = () =>
  (typeof window === 'undefined' ? 1280 : window.innerWidth);

export const uiInitialState = {
  ui: {
    // Viewport (source primitive; mobile/desktop breakpoints are derived selectors)
    viewportWidth: readInitialViewportWidth(),
    // Overlays / modals
    isOnlinePaymentModalOpen: false,
    isAccountDrawerOpen: false,
    isAboutExpanded: false,
    isServiceGalleryExpanded: false,
    // Order-success overlay — flag lives here, wired in Wave 3 (checkout-coupled)
    showOrderSuccessAnimation: false
  }
};

export const createUiSlice = (set) => ({
  ...uiInitialState,

  uiSetViewportWidth: (width) =>
    set((s) => ({ ui: { ...s.ui, viewportWidth: Number(width) || 0 } })),

  uiOpenOnlinePaymentModal: () =>
    set((s) => ({ ui: { ...s.ui, isOnlinePaymentModalOpen: true } })),

  uiCloseOnlinePaymentModal: () =>
    set((s) => ({ ui: { ...s.ui, isOnlinePaymentModalOpen: false } })),

  uiSetAccountDrawerOpen: (open) =>
    set((s) => ({ ui: { ...s.ui, isAccountDrawerOpen: Boolean(open) } })),

  uiSetAboutExpanded: (expanded) =>
    set((s) => ({ ui: { ...s.ui, isAboutExpanded: Boolean(expanded) } })),

  uiSetServiceGalleryExpanded: (expanded) =>
    set((s) => ({ ui: { ...s.ui, isServiceGalleryExpanded: Boolean(expanded) } })),

  uiSetShowOrderSuccessAnimation: (visible) =>
    set((s) => ({ ui: { ...s.ui, showOrderSuccessAnimation: Boolean(visible) } }))
});
