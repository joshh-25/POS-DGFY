/**
 * sessionSlice — DGFY auth/cookie/handoff session, account identity, guest
 * details, storefront visitor id, and follow state.
 *
 * SCAFFOLD ONLY (Wave 0). State + actions are populated in Wave 1 by moving the
 * session bootstrap effect and its `useState` out of StorefrontApp.jsx via the
 * in-place bridge. Shape follows uiSlice.js exactly (nested `session` state,
 * flat `session*` actions).
 */

export const sessionInitialState = {
  session: {}
};

// eslint-disable-next-line no-unused-vars -- `set`/`get` used once Wave 1 populates actions
export const createSessionSlice = (set, get) => ({
  ...sessionInitialState
});
