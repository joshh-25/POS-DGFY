/**
 * cartSlice — cart items, add/update/remove, cart-fly animation state.
 *
 * SCAFFOLD ONLY (Wave 0). Populated in Wave 3 ([QA-REQUIRED]) — this is a money
 * path, migrated verbatim and unit-tested, then persisted via the store's
 * `persist` middleware (replacing the standalone useStorefrontCartPersistence).
 * Shape follows uiSlice.js.
 */

export const cartInitialState = {
  cart: {}
};

// eslint-disable-next-line no-unused-vars -- `set`/`get` used once Wave 3 populates actions
export const createCartSlice = (set, get) => ({
  ...cartInitialState
});
