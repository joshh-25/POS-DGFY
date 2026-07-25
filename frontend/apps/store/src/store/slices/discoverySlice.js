/**
 * discoverySlice — discovery list/filter WIRING state only.
 *
 * SCAFFOLD ONLY (Wave 0). Populated in Wave 1. IMPORTANT: this slice never owns
 * map RUNTIME (viewport, markers, clustering) — develop's map modules are the
 * source of truth and stay untouched. Shape follows uiSlice.js.
 */

export const discoveryInitialState = {
  discovery: {}
};

// eslint-disable-next-line no-unused-vars -- `set`/`get` used once Wave 1 populates actions
export const createDiscoverySlice = (set, get) => ({
  ...discoveryInitialState
});
