// Phase 230 (#1290). Pure client-side view filter for the Active Queue -- lets an operator narrow
// the already-fetched incoming-orders list down to one delivery run (or "unassigned"). Zero backend
// change: `deliveryJob.delivery_run_id` was already added to every queue order by Phase 227
// (posRepository.js's buildTransactionInclude()).
//
// Deliberately NOT built on top of getEligibleRunTargets (deliveryRunEligibility.js) -- that
// function answers a different question ("which run can I add MORE orders to right now") and
// excludes dispatched/completed/cancelled runs for that reason. A dispatched run's members are
// still sitting in the Active Queue as out_for_delivery orders with delivery_job.status = assigned
// -- those are exactly the orders an operator most wants to filter to, so a *view* filter needs a
// broader, differently-shaped option list. Do not "unify" these two functions.

const VIEW_FILTER_EXCLUDED_STATUSES = new Set(['completed', 'cancelled']);

/**
 * Builds the run options a view filter should offer: every run at the given location whose
 * members could plausibly still be sitting in the Active Queue. Excludes `completed`/`cancelled`
 * runs (their members have finished their fulfillment lifecycle and are no longer in this queue);
 * keeps `draft`, `scheduled`, and -- unlike getEligibleRunTargets -- `dispatched`.
 *
 * Sorted by scheduled_date (nulls last), then label, so the dropdown reads in a stable, predictable
 * order rather than API response order.
 */
export function getQueueRunFilterOptions(runs, { locationId = null } = {}) {
  const list = Array.isArray(runs) ? runs : [];
  if (locationId === null || locationId === undefined) return [];

  return list
    .filter((run) => {
      if (VIEW_FILTER_EXCLUDED_STATUSES.has(String(run?.status || '').trim())) return false;
      if (Number(run?.location_id) !== Number(locationId)) return false;
      return true;
    })
    .sort((left, right) => {
      const leftDate = left?.scheduled_date ? new Date(left.scheduled_date).getTime() : null;
      const rightDate = right?.scheduled_date ? new Date(right.scheduled_date).getTime() : null;
      if (leftDate !== rightDate) {
        if (leftDate === null) return 1;
        if (rightDate === null) return -1;
        return leftDate - rightDate;
      }
      return String(left?.label || '').localeCompare(String(right?.label || ''));
    });
}

export const QUEUE_RUN_FILTER_ALL = 'all';
export const QUEUE_RUN_FILTER_UNASSIGNED = 'unassigned';

/**
 * Filters an order list against a run-filter value. `'all'` passes everything through unchanged;
 * `'unassigned'` keeps only orders with no delivery_run_id at all; any other value is treated as a
 * delivery_run_id and keeps only orders belonging to that run.
 *
 * Coerces both sides to Number before comparing -- the <select> element's value is always a
 * string, while delivery_run_id may arrive as either a string or a number depending on the API
 * response shape.
 */
export function filterOrdersByRun(orders, runFilter) {
  const list = Array.isArray(orders) ? orders : [];
  if (!runFilter || runFilter === QUEUE_RUN_FILTER_ALL) return list;

  if (runFilter === QUEUE_RUN_FILTER_UNASSIGNED) {
    return list.filter((order) => !order?.deliveryJob?.delivery_run_id);
  }

  const targetRunId = Number(runFilter);
  return list.filter((order) => Number(order?.deliveryJob?.delivery_run_id) === targetRunId);
}
