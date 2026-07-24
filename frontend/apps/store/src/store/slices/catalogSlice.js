/**
 * catalogSlice — selected store, stores list, category/search/pagination, and
 * the `openStoreBySlug` async loader.
 *
 * SCAFFOLD ONLY (Wave 0). Populated in Wave 1 (read paths) — async loaders call
 * the existing `services/` layer (`requestJson`) from inside actions, not from
 * effects in the shell. Shape follows uiSlice.js.
 */

export const catalogInitialState = {
  catalog: {}
};

// eslint-disable-next-line no-unused-vars -- `set`/`get` used once Wave 1 populates actions
export const createCatalogSlice = (set, get) => ({
  ...catalogInitialState
});
