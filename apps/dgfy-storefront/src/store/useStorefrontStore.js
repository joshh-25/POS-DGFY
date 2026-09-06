/**
 * useStorefrontStore — the single, sliced zustand store for the storefront app
 * (`apps/store`). It brings the storefront in line with the repo's existing
 * state library (see `frontend/src/store/useStore.js`), scaled to this app's
 * many domains via the SLICE pattern.
 *
 * See docs/refactor/STOREFRONT_STATE_MANAGEMENT.md for the full architecture,
 * conventions, and the store-vs-local decision guide.
 *
 * Composition: each domain slice contributes its nested state (`s.cart`,
 * `s.ui`, …) plus flat `<domain><Verb>` actions. The shell and migrated runtime
 * hooks keep their existing public names while slices become the single reactive
 * authority one boundary at a time.
 *
 * Middleware: `devtools` only for now (dev-guarded, harmless in prod/tests).
 * `persist` remains intentionally deferred until cart persistence is migrated as
 * one bounded commerce change (replacing the standalone useStorefrontCartPersistence hook).
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createUiSlice } from './slices/uiSlice.js';
import { createSessionSlice } from './slices/sessionSlice.js';
import { createCatalogSlice } from './slices/catalogSlice.js';
import { createCartSlice } from './slices/cartSlice.js';
import { createCheckoutSlice } from './slices/checkoutSlice.js';
import { createServiceBookingSlice } from './slices/serviceBookingSlice.js';
import { createDiscoverySlice } from './slices/discoverySlice.js';
import { createReviewSlice } from './slices/reviewSlice.js';

const isDevEnvironment = () => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

const hasReduxDevtoolsExtension = () => (
  typeof window !== 'undefined' && Boolean(window.__REDUX_DEVTOOLS_EXTENSION__)
);

const composeStorefrontState = (set, get, store) => ({
  ...createUiSlice(set, get, store),
  ...createSessionSlice(set, get, store),
  ...createCatalogSlice(set, get, store),
  ...createCartSlice(set, get, store),
  ...createCheckoutSlice(set, get, store),
  ...createServiceBookingSlice(set, get, store),
  ...createDiscoverySlice(set, get, store),
  ...createReviewSlice(set, get, store),

  // Official Zustand reset pattern — matches frontend/src/store/useStore.js.
  // `getInitialState()` avoids reset drift as new slices/keys are added.
  reset: () => set(store.getInitialState())
});

export const useStorefrontStore = create(
  devtools(composeStorefrontState, {
    name: 'StorefrontStore',
    enabled: isDevEnvironment() && hasReduxDevtoolsExtension()
  })
);

export default useStorefrontStore;
