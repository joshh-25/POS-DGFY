import { describe, expect, it } from 'vitest';

import { toRetailTrackingViewState } from '../retailTrackingPayload.js';

// RF-6 (PR #753 review): regression guard for the highest-consequence line in the PR -- the `??`
// precedence in totalAmount's resolution. Nothing here caught a future re-reordering before this;
// simpleTrackingAdapter.test.js is the sibling precedent for testing a tracking parser in
// isolation like this.
describe('retailTrackingPayload totalAmount precedence (#747)', () => {
  it('prefers the server-persisted order.total_amount over a poisoned top-level total_amount', () => {
    const view = toRetailTrackingViewState({
      raw: { data: { order: { total_amount: 3600 } }, total_amount: 4000 }
    });
    expect(view.totalAmount).toBe(3600);
  });

  it('falls back to the top-level total_amount when no order.total_amount is present', () => {
    const view = toRetailTrackingViewState({ raw: { total_amount: 4000 } });
    expect(view.totalAmount).toBe(4000);
  });
});
