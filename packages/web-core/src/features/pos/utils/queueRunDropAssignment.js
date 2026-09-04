import { getRunAssignEligibility } from './deliveryRunEligibility.js';

// Phase 229 (#1289), §2.8/§2.9. Pulls the multi-drag-vs-single-drag decision for the split view's
// drag-to-assign interaction out of the component so it's testable without simulating a real
// pointer drag in jsdom (dnd-kit's DragEndEvent is trivial to construct by hand; a real drag
// gesture is not). Mirrors ItemsPage.jsx's `isMultiDrag = selectedIds.has(activeId) &&
// selectedIds.size > 1` precedent exactly (§2.3):
//
// - Dragging a card that IS in the current checkbox selection drags the WHOLE eligible selection.
// - Dragging a card that is NOT in the selection drags JUST that card, leaving the selection alone.
// - A drop with no picked target run, or where the resolved order-id set ends up empty (every
//   candidate order turned out ineligible), yields `null` -- nothing to submit.
//
// `orders` is the full order list so an out-of-selection single-card drag can be checked for
// eligibility even though it was never run through the toolbar's own eligibility filter. ids are
// always Numbers, never array indices (§2.10 -- the queue list is re-sorted on every poll tick).

/**
 * @param {object} params
 * @param {number|string} params.activeOrderId - the pos_transaction_id of the card that was dragged
 * @param {number|string|null} params.overRunId - the delivery_run_id of the drop target, or null/undefined if dropped outside a valid target
 * @param {Set<number>} params.selectedOrderIds - the Active Queue's current checkbox selection
 * @param {Array<object>} params.orders - the full (unfiltered) incoming order list, for eligibility lookups
 * @returns {{ targetRunId: number, orderIds: number[] } | null}
 */
export function resolveRunDropAssignment({ activeOrderId, overRunId, selectedOrderIds, orders } = {}) {
  if (overRunId === null || overRunId === undefined || overRunId === '') return null;

  const targetRunId = Number(overRunId);
  if (!Number.isFinite(targetRunId)) return null;

  const activeId = Number(activeOrderId);
  if (!Number.isFinite(activeId)) return null;

  const orderList = Array.isArray(orders) ? orders : [];
  const selection = selectedOrderIds instanceof Set ? selectedOrderIds : new Set();

  const isMultiDrag = selection.has(activeId) && selection.size > 1;
  const candidateIds = isMultiDrag ? Array.from(selection) : [activeId];

  const eligibleIds = candidateIds
    .map((id) => Number(id))
    .filter((id) => {
      const order = orderList.find((candidate) => Number(candidate?.pos_transaction_id) === id);
      return Boolean(order) && getRunAssignEligibility(order, {}).eligible;
    })
    .sort((left, right) => left - right);

  if (eligibleIds.length === 0) return null;

  return { targetRunId, orderIds: eligibleIds };
}

export default resolveRunDropAssignment;
