/**
 * reviewSlice — customer and item-review presentation state.
 *
 * Review submission and loading remain in the existing review runtime. This
 * slice only replaces the shell's review-related useState declarations with a
 * useState-compatible action bridge.
 */

export const reviewInitialState = {
  review: {
    isModalOpen: false,
    submitLoading: false,
    draft: {
      name: '',
      anonymous: false,
      rating: 0,
      message: ''
    },
    itemSummary: null,
    itemCards: [],
    itemsLoading: false,
    inviteContext: null,
    sectionHighlighted: false
  }
};

const updateReviewField = (set, key, next) => set((s) => ({
  review: {
    ...s.review,
    [key]: typeof next === 'function' ? next(s.review[key]) : next
  }
}));

const reviewFields = {
  isModalOpen: 'IsModalOpen',
  submitLoading: 'SubmitLoading',
  draft: 'Draft',
  itemSummary: 'ItemSummary',
  itemCards: 'ItemCards',
  itemsLoading: 'ItemsLoading',
  inviteContext: 'InviteContext',
  sectionHighlighted: 'SectionHighlighted'
};

export const createReviewSlice = (set) => ({
  ...reviewInitialState,
  ...Object.fromEntries(
    Object.entries(reviewFields).map(([field, suffix]) => [
      `reviewSet${suffix}`,
      (next) => updateReviewField(set, field, next)
    ])
  )
});
