// Phase 227 (#1273). Pure unit tests for the bulk "add to run" eligibility pre-filter -- these
// mirror buildAddDeliveryRunMembersUseCase's Step 4 rejection table (deliveryRunUseCases.js) in
// the same order, so a passing suite here is direct evidence the client-side filter can never
// disagree with the server's own validation (short of the unavoidable race window).

import { describe, expect, it } from 'vitest';
import {
  RUN_ASSIGN_INELIGIBLE_REASONS,
  getActiveRunMembership,
  getEligibleRunTargets,
  getRunAssignEligibility
} from '../deliveryRunEligibility.js';

const buildOrder = (overrides = {}) => ({
  pos_transaction_id: 9001,
  order_method: 'delivery',
  location_id: 10,
  deliveryJob: {
    provider: 'manual',
    status: 'pending_dispatch',
    delivery_run_id: null
  },
  ...overrides
});

describe('getRunAssignEligibility', () => {
  it('is eligible for a manual, pending-dispatch, run-less delivery order at the target location', () => {
    const result = getRunAssignEligibility(buildOrder(), { targetRunLocationId: 10 });
    expect(result).toEqual({ eligible: true, reasonCode: null, reason: null });
  });

  it('is eligible with no targetRunLocationId given (location check skipped, not target-run-blocked)', () => {
    const result = getRunAssignEligibility(buildOrder());
    expect(result.eligible).toBe(true);
  });

  it('rejects a non-delivery order', () => {
    const result = getRunAssignEligibility(buildOrder({ order_method: 'pickup' }), { targetRunLocationId: 10 });
    expect(result.eligible).toBe(false);
    expect(result.reasonCode).toBe(RUN_ASSIGN_INELIGIBLE_REASONS.NOT_DELIVERY_ORDER);
  });

  it('rejects an order with no delivery job', () => {
    const result = getRunAssignEligibility(buildOrder({ deliveryJob: null }), { targetRunLocationId: 10 });
    expect(result.reasonCode).toBe(RUN_ASSIGN_INELIGIBLE_REASONS.NO_DELIVERY_JOB);
  });

  it('rejects a non-manual (provider) delivery job', () => {
    const result = getRunAssignEligibility(
      buildOrder({ deliveryJob: { provider: 'lalamove', status: 'pending_dispatch', delivery_run_id: null } }),
      { targetRunLocationId: 10 }
    );
    expect(result.reasonCode).toBe(RUN_ASSIGN_INELIGIBLE_REASONS.NOT_MANUAL_JOB);
  });

  it('rejects a delivery job that is no longer pending_dispatch', () => {
    const result = getRunAssignEligibility(
      buildOrder({ deliveryJob: { provider: 'manual', status: 'out_for_delivery', delivery_run_id: null } }),
      { targetRunLocationId: 10 }
    );
    expect(result.reasonCode).toBe(RUN_ASSIGN_INELIGIBLE_REASONS.NOT_PENDING_DISPATCH);
  });

  it('rejects an order whose delivery job already has a delivery_run_id', () => {
    const result = getRunAssignEligibility(
      buildOrder({ deliveryJob: { provider: 'manual', status: 'pending_dispatch', delivery_run_id: 5 } }),
      { targetRunLocationId: 10 }
    );
    expect(result.reasonCode).toBe(RUN_ASSIGN_INELIGIBLE_REASONS.ALREADY_IN_RUN);
  });

  it('rejects an order whose location does not match the target run location', () => {
    const result = getRunAssignEligibility(buildOrder({ location_id: 99 }), { targetRunLocationId: 10 });
    expect(result.reasonCode).toBe(RUN_ASSIGN_INELIGIBLE_REASONS.LOCATION_MISMATCH);
  });

  it('checks conditions in order -- a non-delivery order with no job still reports NOT_DELIVERY_ORDER first', () => {
    const result = getRunAssignEligibility(buildOrder({ order_method: 'pickup', deliveryJob: null }), { targetRunLocationId: 10 });
    expect(result.reasonCode).toBe(RUN_ASSIGN_INELIGIBLE_REASONS.NOT_DELIVERY_ORDER);
  });

  it('returns false for a null order', () => {
    const result = getRunAssignEligibility(null, { targetRunLocationId: 10 });
    expect(result.eligible).toBe(false);
  });
});

describe('getEligibleRunTargets', () => {
  const buildRun = (overrides = {}) => ({
    delivery_run_id: 1,
    status: 'draft',
    location_id: 10,
    personnel: [{ is_accountable: true }],
    ...overrides
  });

  it('includes a draft/scheduled run with exactly one accountable person at the matching location', () => {
    const runs = [buildRun(), buildRun({ delivery_run_id: 2, status: 'scheduled' })];
    const result = getEligibleRunTargets(runs, { locationId: 10 });
    expect(result.map((run) => run.delivery_run_id)).toEqual([1, 2]);
  });

  it('excludes dispatched/completed/cancelled runs', () => {
    const runs = [
      buildRun({ delivery_run_id: 1, status: 'dispatched' }),
      buildRun({ delivery_run_id: 2, status: 'completed' }),
      buildRun({ delivery_run_id: 3, status: 'cancelled' })
    ];
    expect(getEligibleRunTargets(runs, { locationId: 10 })).toEqual([]);
  });

  it('excludes a run with zero accountable personnel', () => {
    const runs = [buildRun({ personnel: [] })];
    expect(getEligibleRunTargets(runs, { locationId: 10 })).toEqual([]);
  });

  it('excludes a run with MORE than one accountable person (exactly-one invariant, not "at least one")', () => {
    const runs = [buildRun({ personnel: [{ is_accountable: true }, { is_accountable: true }] })];
    expect(getEligibleRunTargets(runs, { locationId: 10 })).toEqual([]);
  });

  it('excludes a run whose location does not match the given locationId', () => {
    const runs = [buildRun({ location_id: 99 })];
    expect(getEligibleRunTargets(runs, { locationId: 10 })).toEqual([]);
  });

  it('returns an empty list when locationId is not given', () => {
    const runs = [buildRun()];
    expect(getEligibleRunTargets(runs, {})).toEqual([]);
    expect(getEligibleRunTargets(runs)).toEqual([]);
  });

  it('returns an empty list for a non-array input', () => {
    expect(getEligibleRunTargets(null, { locationId: 10 })).toEqual([]);
    expect(getEligibleRunTargets(undefined, { locationId: 10 })).toEqual([]);
  });
});

// Phase 229 (#1291). Mirrors RUN_DISPATCH_BLOCKED_STATUSES: a run is "active" (still owns the
// out_for_delivery transition) unless it is completed or cancelled -- and cancelling a run does
// NOT clear its members' delivery_run_id, so the status check is load-bearing, not defensive.
describe('getActiveRunMembership', () => {
  const buildOrderWithRun = (runStatus, overrides = {}) => ({
    pos_transaction_id: 9001,
    order_method: 'delivery',
    deliveryJob: {
      delivery_run_id: 5,
      deliveryRun: runStatus === undefined ? undefined : { delivery_run_id: 5, label: 'Run A', status: runStatus }
    },
    ...overrides
  });

  it('is not in an active run when there is no deliveryJob at all', () => {
    const result = getActiveRunMembership({ pos_transaction_id: 1 });
    expect(result).toEqual({ inActiveRun: false, runId: null, runLabel: null, runStatus: null });
  });

  it('is not in an active run when delivery_run_id is null', () => {
    const result = getActiveRunMembership({ deliveryJob: { delivery_run_id: null } });
    expect(result.inActiveRun).toBe(false);
    expect(result.runId).toBeNull();
  });

  it.each(['draft', 'scheduled', 'dispatched'])('is in an active run when the run status is %s', (status) => {
    const result = getActiveRunMembership(buildOrderWithRun(status));
    expect(result.inActiveRun).toBe(true);
    expect(result.runId).toBe(5);
    expect(result.runLabel).toBe('Run A');
    expect(result.runStatus).toBe(status);
  });

  it.each(['completed', 'cancelled'])('is NOT in an active run when the run status is %s', (status) => {
    const result = getActiveRunMembership(buildOrderWithRun(status));
    expect(result.inActiveRun).toBe(false);
  });

  it('fails closed (treats as active) when delivery_run_id is set but the deliveryRun record is missing', () => {
    const result = getActiveRunMembership({
      deliveryJob: { delivery_run_id: 5, deliveryRun: null }
    });
    expect(result.inActiveRun).toBe(true);
    expect(result.runId).toBe(5);
    expect(result.runLabel).toBeNull();
    expect(result.runStatus).toBeNull();
  });
});
