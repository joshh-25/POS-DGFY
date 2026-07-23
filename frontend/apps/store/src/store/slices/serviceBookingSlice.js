/**
 * serviceBookingSlice — service booking drafts, intake responses, booking steps.
 *
 * SCAFFOLD ONLY (Wave 0). Populated in Wave 3 ([QA-REQUIRED]) alongside the
 * services booking flow migration. Shape follows uiSlice.js.
 */

export const serviceBookingInitialState = {
  serviceBooking: {}
};

// eslint-disable-next-line no-unused-vars -- `set`/`get` used once Wave 3 populates actions
export const createServiceBookingSlice = (set, get) => ({
  ...serviceBookingInitialState
});
