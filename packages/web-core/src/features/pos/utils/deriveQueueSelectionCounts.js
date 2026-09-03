// Phase 257 (#1491). Extracted out of TerminalOperationsPanels.jsx so the Active Queue's bulk
// "add to run" selection math (Phase 231's own correctness crux, #1290) can be re-derived against
// two DIFFERENT candidate lists from one call site each -- the standalone Active Queue tab's
// `visibleIncomingOrders` (unchanged) and the split ("Queue + Run") view's own always-unassigned
// `splitQueueCandidates` (new, #1491 Part 2) -- without duplicating the logic across the two.
//
// `allOrders` is the full, unfiltered queue (for `selectedHiddenCount` -- a selection that's
// hidden by whichever view/filter is active but not actually gone); `candidateOrders` is whichever
// list is actually rendered/selectable in the calling branch right now.

import { getRunAssignEligibility } from './deliveryRunEligibility.js';

/**
 * @param {Array} allOrders - the full, unfiltered incoming-orders list.
 * @param {Array} candidateOrders - the list actually rendered/selectable by the calling branch
 *   (the standalone tab's run-filtered list, or the split view's unassigned-only candidate list).
 * @param {Set<number>} selectedOrderIds - pos_transaction_id values, never indexes.
 * @returns {{
 *   selectedEligibleOrders: Array,
 *   visibleSelectedCount: number,
 *   selectedDriftCount: number,
 *   selectedHiddenCount: number
 * }}
 */
export function deriveQueueSelectionCounts(allOrders, candidateOrders, selectedOrderIds) {
  const allList = Array.isArray(allOrders) ? allOrders : [];
  const candidateList = Array.isArray(candidateOrders) ? candidateOrders : [];

  const selectedEligibleOrders = candidateList.filter(
    (order) => selectedOrderIds.has(Number(order?.pos_transaction_id))
      && getRunAssignEligibility(order, {}).eligible
  );
  const visibleSelectedCount = candidateList.filter(
    (order) => selectedOrderIds.has(Number(order?.pos_transaction_id))
  ).length;
  // Recomputed against the candidate list only -- selectedOrderIds.size would count every
  // hidden-from-this-view selection as "ineligible drift" and show a wrong, alarming number.
  const selectedDriftCount = Math.max(0, visibleSelectedCount - selectedEligibleOrders.length);
  // Ids that are selected AND present in the full (unfiltered) list, but not in this call's
  // candidate list -- these will silently NOT be submitted by the bulk-add unless the operator is
  // told so.
  const selectedHiddenCount = allList.filter((order) => {
    const orderId = Number(order?.pos_transaction_id);
    if (!selectedOrderIds.has(orderId)) return false;
    return !candidateList.some((candidate) => Number(candidate?.pos_transaction_id) === orderId);
  }).length;

  return { selectedEligibleOrders, visibleSelectedCount, selectedDriftCount, selectedHiddenCount };
}

export default deriveQueueSelectionCounts;
