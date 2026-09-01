// Phase 227 (#1273). Pure client-side pre-filter for the Active Queue's bulk "add to run" flow.
//
// F-2 (source-verified, see the Phase 227 impact declaration): POST /pos/delivery-runs/:id/members
// is all-or-nothing -- it throws 409 on the FIRST per-order problem in the batch and writes
// NOTHING. There is no server-side best-effort/partial-apply mode to lean on, so an invalid batch
// has to be made unconstructable on the client instead. These two pure functions mirror the
// use case's own rejection table (deliveryRunUseCases.js's buildAddDeliveryRunMembersUseCase,
// Step 4) exactly, in the same order, so "eligible here" and "would 409 there" never disagree
// except in the unavoidable race window between a client read and the server's own locking read
// (handled separately, at the caller, via the 409 recovery loop -- not this module's job).

export const RUN_ASSIGN_INELIGIBLE_REASONS = Object.freeze({
  NOT_DELIVERY_ORDER: 'not_delivery_order',
  NO_DELIVERY_JOB: 'no_delivery_job',
  NOT_MANUAL_JOB: 'not_manual_job',
  NOT_PENDING_DISPATCH: 'not_pending_dispatch',
  ALREADY_IN_RUN: 'already_in_run',
  LOCATION_MISMATCH: 'location_mismatch'
});

const REASON_MESSAGES = Object.freeze({
  [RUN_ASSIGN_INELIGIBLE_REASONS.NOT_DELIVERY_ORDER]: 'Not a delivery order.',
  [RUN_ASSIGN_INELIGIBLE_REASONS.NO_DELIVERY_JOB]: 'No delivery job on this order.',
  [RUN_ASSIGN_INELIGIBLE_REASONS.NOT_MANUAL_JOB]: 'Delivery job is not a manual job.',
  [RUN_ASSIGN_INELIGIBLE_REASONS.NOT_PENDING_DISPATCH]: 'Delivery job is no longer pending dispatch.',
  [RUN_ASSIGN_INELIGIBLE_REASONS.ALREADY_IN_RUN]: 'Order already belongs to a delivery run.',
  [RUN_ASSIGN_INELIGIBLE_REASONS.LOCATION_MISMATCH]: "Order's location does not match the run's location."
});

const ineligible = (reasonCode) => ({
  eligible: false,
  reasonCode,
  reason: REASON_MESSAGES[reasonCode] || 'Not eligible for this run.'
});

const ELIGIBLE = Object.freeze({ eligible: true, reasonCode: null, reason: null });

/**
 * Mirrors buildAddDeliveryRunMembersUseCase's Step 4 validation, in the same order:
 * delivery order -> manual job -> pending_dispatch -> no delivery_run_id -> location match.
 *
 * `targetRunLocationId` is optional -- when omitted (no target run chosen yet), every check
 * except the location match runs, so this doubles as a target-run-agnostic "is this order still
 * a plausible bulk-add candidate at all" check (used for the ineligible-drift hint against a
 * polled order list, before any run has been picked) as well as the target-run-specific
 * eligibility check the toolbar's "select all eligible" and final submit use.
 */
export function getRunAssignEligibility(order, { targetRunLocationId = null } = {}) {
  if (!order || order.order_method !== 'delivery') {
    return ineligible(RUN_ASSIGN_INELIGIBLE_REASONS.NOT_DELIVERY_ORDER);
  }

  const deliveryJob = order.deliveryJob || null;
  if (!deliveryJob) {
    return ineligible(RUN_ASSIGN_INELIGIBLE_REASONS.NO_DELIVERY_JOB);
  }

  if (String(deliveryJob.provider || '').trim().toLowerCase() !== 'manual') {
    return ineligible(RUN_ASSIGN_INELIGIBLE_REASONS.NOT_MANUAL_JOB);
  }

  if (String(deliveryJob.status || '').trim().toLowerCase() !== 'pending_dispatch') {
    return ineligible(RUN_ASSIGN_INELIGIBLE_REASONS.NOT_PENDING_DISPATCH);
  }

  if (deliveryJob.delivery_run_id) {
    return ineligible(RUN_ASSIGN_INELIGIBLE_REASONS.ALREADY_IN_RUN);
  }

  if (targetRunLocationId !== null && targetRunLocationId !== undefined) {
    if (Number(order.location_id) !== Number(targetRunLocationId)) {
      return ineligible(RUN_ASSIGN_INELIGIBLE_REASONS.LOCATION_MISMATCH);
    }
  }

  return ELIGIBLE;
}

const RUN_TARGET_BLOCKED_STATUSES = new Set(['dispatched', 'completed', 'cancelled']);

/**
 * Excludes (not merely disables) any run that would 409 on the ADD leg regardless of which
 * orders are selected: locked/dispatched/completed/cancelled runs, runs without EXACTLY one
 * accountable person (Phase 226's RF-5 fix -- `.filter().length === 1`, NOT `.some()`, matching
 * the actual invariant rather than "at least one"), and runs whose location doesn't match the
 * active shift's location (this third filter is new for Phase 227 -- it's what makes
 * DELIVERY_RUN_LOCATION_MISMATCH unreachable by construction from this picker).
 */
export function getEligibleRunTargets(runs, { locationId = null } = {}) {
  const list = Array.isArray(runs) ? runs : [];
  if (locationId === null || locationId === undefined) return [];

  return list.filter((run) => {
    if (RUN_TARGET_BLOCKED_STATUSES.has(String(run?.status || '').trim())) return false;

    const accountableCount = Array.isArray(run?.personnel)
      ? run.personnel.filter((person) => person?.is_accountable).length
      : 0;
    if (accountableCount !== 1) return false;

    if (Number(run?.location_id) !== Number(locationId)) return false;

    return true;
  });
}

// Phase 229 (#1291). A run that is `completed`/`cancelled` no longer accepts dispatch
// (RUN_DISPATCH_BLOCKED_STATUSES in deliveryRunUseCases.js), but cancelling a run does NOT clear
// its members' `delivery_run_id` -- only the explicit remove-member use case does that. So
// `delivery_run_id` truthy alone is not "still an active run member"; the run's own `status` has
// to be checked too, or a cancelled run's members would be stranded with neither the per-order
// action nor a working run dispatch.
//
// Deliberately a blocklist, not an allowlist, mirroring RUN_DISPATCH_BLOCKED_STATUSES exactly:
// an unknown/missing `deliveryRun` alongside a truthy `delivery_run_id` (stale cached payload, a
// future status value) is treated as still-active (fail-closed toward "use the run"). This is
// safe because removing a member has no run-status guard at all (buildRemoveDeliveryRunMemberUseCase
// checks only run-exists and member-exists), so an operator always has an escape hatch.
export const RUN_INACTIVE_STATUSES = Object.freeze(['completed', 'cancelled']);

/**
 * Is this order currently a member of a run that hasn't completed or been cancelled?
 * Returns `{ inActiveRun, runId, runLabel, runStatus }` -- never throws on a missing/malformed
 * `deliveryJob`/`deliveryRun`.
 */
export function getActiveRunMembership(order) {
  const deliveryJob = order?.deliveryJob || null;
  const runId = deliveryJob?.delivery_run_id ?? null;

  if (!runId) {
    return { inActiveRun: false, runId: null, runLabel: null, runStatus: null };
  }

  const deliveryRun = deliveryJob?.deliveryRun || null;
  const runStatus = deliveryRun ? String(deliveryRun.status || '').trim().toLowerCase() : null;
  const runLabel = deliveryRun?.label ?? null;

  // Fail-closed: an unknown or missing run record is treated as still active.
  const inActiveRun = !runStatus || !RUN_INACTIVE_STATUSES.includes(runStatus);

  return { inActiveRun, runId, runLabel, runStatus };
}
