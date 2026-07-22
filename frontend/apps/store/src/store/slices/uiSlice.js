/**
 * uiSlice — cross-cutting presentational state for the storefront shell.
 *
 * Owns viewport + modal/overlay/drawer open flags that today live as loose
 * `useState` in StorefrontApp.jsx. This is the WORKED REFERENCE slice: every
 * other slice in this folder follows its shape exactly.
 *
 * Convention (see docs/refactor/STOREFRONT_STATE_MANAGEMENT.md):
 *   - State is nested under a single domain key (`ui`) so persistence,
 *     resets, and selectors have a clean boundary and names can't collide
 *     across the ~96 values being migrated out of the shell.
 *   - Actions are FLAT, top-level, named `<domain><Verb>` (e.g. `uiOpenOnlinePaymentModal`).
 *   - Every setter goes through `set((s) => ({ ui: { ...s.ui, ... } }))` so the
 *     domain object is replaced immutably and unrelated slices are untouched.
 */

export const uiInitialState = {
  ui: {
    // Overlays / modals
    isOnlinePaymentModalOpen: false,
    showOrderSuccessAnimation: false,
    // Viewport
    isMobileViewport: false
  }
};

export const createUiSlice = (set) => ({
  ...uiInitialState,

  uiOpenOnlinePaymentModal: () =>
    set((s) => ({ ui: { ...s.ui, isOnlinePaymentModalOpen: true } })),

  uiCloseOnlinePaymentModal: () =>
    set((s) => ({ ui: { ...s.ui, isOnlinePaymentModalOpen: false } })),

  uiSetShowOrderSuccessAnimation: (visible) =>
    set((s) => ({ ui: { ...s.ui, showOrderSuccessAnimation: Boolean(visible) } })),

  uiSetMobileViewport: (isMobile) =>
    set((s) => ({ ui: { ...s.ui, isMobileViewport: Boolean(isMobile) } }))
});
