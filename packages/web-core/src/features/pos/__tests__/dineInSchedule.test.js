import { describe, expect, it } from 'vitest';
import {
  DINE_IN_SCHEDULE_STATES,
  formatDineInScheduleCountdown,
  getDineInScheduleAlertMilestone,
  getDineInScheduleCountdownLabel,
  getDineInScheduleRemainingSeconds,
  getDineInScheduleState,
  getDineInScheduleStateLabel,
  isDineInOrder,
  getDineInScheduleTimingLabel,
  isScheduledDineInOrder,
  sortDineInScheduleOrders
} from '../utils/dineInSchedule.js';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

const buildOrder = (overrides = {}) => ({
  pos_transaction_id: 9001,
  order_method: 'dine_in',
  scheduled_for: '2026-09-23T13:00:00.000Z',
  created_at: '2026-09-23T10:00:00.000Z',
  fulfillment_status: 'confirmed',
  ...overrides
});

describe('dine-in schedule helpers', () => {
  it('only treats valid scheduled dine-in orders as scheduled service work', () => {
    expect(isDineInOrder(buildOrder())).toBe(true);
    expect(isDineInOrder(buildOrder({ order_method: 'pickup' }))).toBe(false);
    expect(isScheduledDineInOrder(buildOrder())).toBe(true);
    expect(isScheduledDineInOrder(buildOrder({ order_method: 'pickup' }))).toBe(false);
    expect(isScheduledDineInOrder(buildOrder({ scheduled_for: 'not-a-date' }))).toBe(false);
  });

  it('classifies upcoming, late, and ready-to-serve orders', () => {
    expect(getDineInScheduleState(buildOrder(), NOW)).toBe(DINE_IN_SCHEDULE_STATES.UPCOMING);
    expect(getDineInScheduleState(buildOrder({ scheduled_for: '2026-09-23T11:30:00.000Z' }), NOW))
      .toBe(DINE_IN_SCHEDULE_STATES.LATE);
    expect(getDineInScheduleState(buildOrder({
      fulfillment_status: 'ready_for_pickup',
      scheduled_for: '2026-09-23T11:30:00.000Z'
    }), NOW)).toBe(DINE_IN_SCHEDULE_STATES.READY);
    expect(getDineInScheduleStateLabel(DINE_IN_SCHEDULE_STATES.READY)).toBe('Ready to Serve');
  });

  it('shows the time remaining or lateness in cashier-friendly terms', () => {
    expect(getDineInScheduleTimingLabel(buildOrder(), NOW)).toBe('In 1h');
    expect(getDineInScheduleTimingLabel(buildOrder({ scheduled_for: '2026-09-23T12:00:00.000Z' }), NOW))
      .toBe('Due now');
    expect(getDineInScheduleTimingLabel(buildOrder({ scheduled_for: '2026-09-23T11:30:00.000Z' }), NOW))
      .toBe('Late by 30 min');
  });

  it('formats an exact countdown and preserves due and late states', () => {
    const countdownOrder = buildOrder({ scheduled_for: '2026-09-23T12:14:32.000Z' });

    expect(getDineInScheduleRemainingSeconds(countdownOrder, NOW)).toBe(872);
    expect(formatDineInScheduleCountdown(872)).toBe('00h 14m 32s');
    expect(formatDineInScheduleCountdown(11884)).toBe('03h 18m 04s');
    expect(getDineInScheduleCountdownLabel(countdownOrder, NOW)).toBe('In 00h 14m 32s');
    expect(getDineInScheduleCountdownLabel(
      buildOrder({ scheduled_for: '2026-09-23T15:18:04.000Z' }),
      NOW
    )).toBe('In 03h 18m 04s');
    expect(getDineInScheduleCountdownLabel(
      buildOrder({ scheduled_for: '2026-09-23T12:00:00.000Z' }),
      NOW
    )).toBe('Due now');
    expect(getDineInScheduleCountdownLabel(
      buildOrder({ scheduled_for: '2026-09-23T11:58:29.000Z' }),
      NOW
    )).toBe('Late by 00h 01m 31s');
  });

  it('selects one catch-up alert milestone for each warning window', () => {
    expect(getDineInScheduleAlertMilestone(buildOrder({ scheduled_for: '2026-09-23T12:15:00.000Z' }), NOW)).toBe(15);
    expect(getDineInScheduleAlertMilestone(buildOrder({ scheduled_for: '2026-09-23T12:14:59.000Z' }), NOW)).toBe(15);
    expect(getDineInScheduleAlertMilestone(buildOrder({ scheduled_for: '2026-09-23T12:05:00.000Z' }), NOW)).toBe(5);
    expect(getDineInScheduleAlertMilestone(buildOrder({ scheduled_for: '2026-09-23T12:02:00.000Z' }), NOW)).toBe(3);
    expect(getDineInScheduleAlertMilestone(buildOrder({ scheduled_for: '2026-09-23T12:00:30.000Z' }), NOW)).toBe(1);
    expect(getDineInScheduleAlertMilestone(buildOrder({ scheduled_for: '2026-09-23T12:00:00.000Z' }), NOW)).toBe(null);
  });

  it('sorts scheduled dine-in orders first and keeps immediate dine-in service after them', () => {
    const later = buildOrder({ pos_transaction_id: 9002, scheduled_for: '2026-09-23T14:00:00.000Z' });
    const earlier = buildOrder({ pos_transaction_id: 9003, scheduled_for: '2026-09-23T12:30:00.000Z' });
    const immediate = buildOrder({ pos_transaction_id: 9004, scheduled_for: null });
    const pickup = buildOrder({ pos_transaction_id: 9005, order_method: 'pickup' });

    expect(sortDineInScheduleOrders([later, pickup, immediate, earlier]).map((order) => order.pos_transaction_id))
      .toEqual([9003, 9002, 9004]);
  });
});
