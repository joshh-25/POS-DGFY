/**
 * sessionSlice — DGFY auth/cookie/handoff session values shared by the storefront shell.
 *
 * The bootstrap effect remains in useStorefrontSession for this in-place bridge. Keeping the
 * existing hook as the orchestration owner avoids changing request timing or analytics identity
 * behavior while moving the reactive state to the shared store.
 */

export const sessionInitialState = {
  session: {
    dgfyAuthToken: '',
    dgfySessionAccount: null,
    isDgfySessionResolved: false,
    storefrontVisitorId: ''
  }
};

const updateSessionField = (set, key, next) => set((s) => ({
  session: {
    ...s.session,
    [key]: typeof next === 'function' ? next(s.session[key]) : next
  }
}));

export const createSessionSlice = (set) => ({
  ...sessionInitialState,

  sessionSetDgfyAuthToken: (next) => updateSessionField(set, 'dgfyAuthToken', next),
  sessionSetDgfySessionAccount: (next) => updateSessionField(set, 'dgfySessionAccount', next),
  sessionSetDgfySessionResolved: (next) => updateSessionField(set, 'isDgfySessionResolved', next),
  sessionSetStorefrontVisitorId: (next) => updateSessionField(set, 'storefrontVisitorId', next)
});
