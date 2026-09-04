// Phase 257 (#1491). Pure unit tests for the Active Queue's bulk "add to run" selection math,
// extracted so both the standalone Active Queue tab and the split ("Queue + Run") view's own
// always-unassigned candidate list can share it without duplicating Phase 231's correctness crux.

import { describe, expect, it } from 'vitest';
import { deriveQueueSelectionCounts } from '../deriveQueueSelectionCounts.js';

const buildOrder = (overrides = {}) => ({
  pos_transaction_id: 9001,
  order_method: 'delivery',
  location_id: 10,
  deliveryJob: { provider: 'manual', status: 'pending_dispatch', delivery_run_id: null },
  ...overrides
});

describe('deriveQueueSelectionCounts', () => {
  it('counts a selected, eligible order as eligible and not drifted or hidden', () => {
    const order = buildOrder({ pos_transaction_id: 1 });
    const result = deriveQueueSelectionCounts([order], [order], new Set([1]));
    expect(result.selectedEligibleOrders.map((candidate) => candidate.pos_transaction_id)).toEqual([1]);
    expect(result.visibleSelectedCount).toBe(1);
    expect(result.selectedDriftCount).toBe(0);
    expect(result.selectedHiddenCount).toBe(0);
  });

  it('counts a selected order that is visible but no longer eligible as drift, not hidden', () => {
    // Already in a run -- getRunAssignEligibility rejects it (ALREADY_IN_RUN), but it's still
    // present in the candidate list passed in (e.g. the standalone tab with runFilter=all).
    const order = buildOrder({ pos_transaction_id: 1, deliveryJob: { provider: 'manual', status: 'pending_dispatch', delivery_run_id: 501 } });
    const result = deriveQueueSelectionCounts([order], [order], new Set([1]));
    expect(result.selectedEligibleOrders).toEqual([]);
    expect(result.visibleSelectedCount).toBe(1);
    expect(result.selectedDriftCount).toBe(1);
    expect(result.selectedHiddenCount).toBe(0);
  });

  it('counts a selected order absent from the candidate list (but present in allOrders) as hidden, not drift', () => {
    const selectedButHidden = buildOrder({ pos_transaction_id: 1, deliveryJob: { provider: 'manual', status: 'pending_dispatch', delivery_run_id: 501 } });
    const result = deriveQueueSelectionCounts([selectedButHidden], [], new Set([1]));
    expect(result.selectedEligibleOrders).toEqual([]);
    expect(result.visibleSelectedCount).toBe(0);
    expect(result.selectedDriftCount).toBe(0);
    expect(result.selectedHiddenCount).toBe(1);
  });

  it('the same allOrders/selection produces different results for a narrower candidate list -- the whole point of parameterizing by candidate list', () => {
    const unassigned = buildOrder({ pos_transaction_id: 1 });
    const assigned = buildOrder({ pos_transaction_id: 2, deliveryJob: { provider: 'manual', status: 'pending_dispatch', delivery_run_id: 501 } });
    const allOrders = [unassigned, assigned];
    const selected = new Set([1, 2]);

    const standaloneLike = deriveQueueSelectionCounts(allOrders, allOrders, selected);
    expect(standaloneLike.visibleSelectedCount).toBe(2);
    expect(standaloneLike.selectedEligibleOrders.map((o) => o.pos_transaction_id)).toEqual([1]);
    expect(standaloneLike.selectedDriftCount).toBe(1);
    expect(standaloneLike.selectedHiddenCount).toBe(0);

    const splitLike = deriveQueueSelectionCounts(allOrders, [unassigned], selected);
    expect(splitLike.visibleSelectedCount).toBe(1);
    expect(splitLike.selectedEligibleOrders.map((o) => o.pos_transaction_id)).toEqual([1]);
    expect(splitLike.selectedDriftCount).toBe(0);
    expect(splitLike.selectedHiddenCount).toBe(1);
  });

  it('handles empty/non-array inputs and an empty selection', () => {
    expect(deriveQueueSelectionCounts(null, null, new Set())).toEqual({
      selectedEligibleOrders: [],
      visibleSelectedCount: 0,
      selectedDriftCount: 0,
      selectedHiddenCount: 0
    });
    const order = buildOrder({ pos_transaction_id: 1 });
    expect(deriveQueueSelectionCounts([order], [order], new Set())).toEqual({
      selectedEligibleOrders: [],
      visibleSelectedCount: 0,
      selectedDriftCount: 0,
      selectedHiddenCount: 0
    });
  });
});
