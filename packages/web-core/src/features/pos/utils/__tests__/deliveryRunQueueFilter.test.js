// Phase 230 (#1290). Pure unit tests for the Active Queue's client-side delivery-run view filter.

import { describe, expect, it } from 'vitest';
import {
  QUEUE_RUN_FILTER_ALL,
  QUEUE_RUN_FILTER_UNASSIGNED,
  filterOrdersByRun,
  getQueueRunFilterOptions
} from '../deliveryRunQueueFilter.js';

const buildRun = (overrides = {}) => ({
  delivery_run_id: 501,
  label: 'Morning Run',
  status: 'draft',
  location_id: 10,
  scheduled_date: null,
  ...overrides
});

const buildOrder = (overrides = {}) => ({
  pos_transaction_id: 9001,
  order_method: 'delivery',
  location_id: 10,
  deliveryJob: { provider: 'manual', status: 'pending_dispatch', delivery_run_id: null },
  ...overrides
});

describe('getQueueRunFilterOptions', () => {
  it('excludes completed and cancelled runs', () => {
    const runs = [
      buildRun({ delivery_run_id: 1, status: 'completed' }),
      buildRun({ delivery_run_id: 2, status: 'cancelled' }),
      buildRun({ delivery_run_id: 3, status: 'draft' })
    ];
    const options = getQueueRunFilterOptions(runs, { locationId: 10 });
    expect(options.map((run) => run.delivery_run_id)).toEqual([3]);
  });

  it('keeps a dispatched run -- the explicit regression guard against reusing getEligibleRunTargets', () => {
    const runs = [buildRun({ delivery_run_id: 1, status: 'dispatched' })];
    const options = getQueueRunFilterOptions(runs, { locationId: 10 });
    expect(options.map((run) => run.delivery_run_id)).toEqual([1]);
  });

  it('excludes runs at a different location', () => {
    const runs = [buildRun({ delivery_run_id: 1, location_id: 99 })];
    expect(getQueueRunFilterOptions(runs, { locationId: 10 })).toEqual([]);
  });

  it('returns nothing when locationId is null or undefined', () => {
    const runs = [buildRun()];
    expect(getQueueRunFilterOptions(runs, {})).toEqual([]);
    expect(getQueueRunFilterOptions(runs, { locationId: undefined })).toEqual([]);
  });

  it('sorts by scheduled_date, then label, with null dates last', () => {
    const runs = [
      buildRun({ delivery_run_id: 1, label: 'Zebra Run', scheduled_date: null }),
      buildRun({ delivery_run_id: 2, label: 'B Run', scheduled_date: '2026-09-05' }),
      buildRun({ delivery_run_id: 3, label: 'A Run', scheduled_date: '2026-09-01' }),
      buildRun({ delivery_run_id: 4, label: 'Alpha Run', scheduled_date: null })
    ];
    const options = getQueueRunFilterOptions(runs, { locationId: 10 });
    expect(options.map((run) => run.delivery_run_id)).toEqual([3, 2, 4, 1]);
  });

  it('handles empty and non-array input', () => {
    expect(getQueueRunFilterOptions(null, { locationId: 10 })).toEqual([]);
    expect(getQueueRunFilterOptions(undefined, { locationId: 10 })).toEqual([]);
    expect(getQueueRunFilterOptions([], { locationId: 10 })).toEqual([]);
  });
});

describe('filterOrdersByRun', () => {
  it("'all' passes every order through unchanged", () => {
    const orders = [buildOrder({ pos_transaction_id: 1 }), buildOrder({ pos_transaction_id: 2 })];
    expect(filterOrdersByRun(orders, QUEUE_RUN_FILTER_ALL)).toEqual(orders);
  });

  it("'unassigned' keeps only orders with no delivery_run_id", () => {
    const unassigned = buildOrder({ pos_transaction_id: 1, deliveryJob: { delivery_run_id: null } });
    const assigned = buildOrder({ pos_transaction_id: 2, deliveryJob: { delivery_run_id: 501 } });
    const noJobAtAll = buildOrder({ pos_transaction_id: 3, deliveryJob: null });
    const result = filterOrdersByRun([unassigned, assigned, noJobAtAll], QUEUE_RUN_FILTER_UNASSIGNED);
    expect(result.map((order) => order.pos_transaction_id)).toEqual([1, 3]);
  });

  it('a numeric-string run id keeps only orders in that run', () => {
    const inRun = buildOrder({ pos_transaction_id: 1, deliveryJob: { delivery_run_id: 501 } });
    const otherRun = buildOrder({ pos_transaction_id: 2, deliveryJob: { delivery_run_id: 502 } });
    const result = filterOrdersByRun([inRun, otherRun], '501');
    expect(result.map((order) => order.pos_transaction_id)).toEqual([1]);
  });

  it('coerces a number delivery_run_id against a string filter value (select value is always a string)', () => {
    const order = buildOrder({ pos_transaction_id: 1, deliveryJob: { delivery_run_id: 501 } });
    expect(filterOrdersByRun([order], '501')).toEqual([order]);
    expect(filterOrdersByRun([order], '502')).toEqual([]);
  });

  it('an order with no deliveryJob at all is excluded from a specific-run filter', () => {
    const order = buildOrder({ pos_transaction_id: 1, deliveryJob: null });
    expect(filterOrdersByRun([order], '501')).toEqual([]);
  });

  it('handles empty and non-array input', () => {
    expect(filterOrdersByRun(null, QUEUE_RUN_FILTER_ALL)).toEqual([]);
    expect(filterOrdersByRun(undefined, '501')).toEqual([]);
    expect(filterOrdersByRun([], '501')).toEqual([]);
  });

  it('falls back to "all" behavior for an empty/falsy filter value', () => {
    const orders = [buildOrder({ pos_transaction_id: 1 })];
    expect(filterOrdersByRun(orders, '')).toEqual(orders);
    expect(filterOrdersByRun(orders, null)).toEqual(orders);
    expect(filterOrdersByRun(orders, undefined)).toEqual(orders);
  });
});
