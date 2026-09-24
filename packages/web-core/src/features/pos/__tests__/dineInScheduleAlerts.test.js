import { describe, expect, it } from 'vitest';
import {
  appendDineInScheduleAlertQueue,
  getDineInScheduleAlertCandidates,
  isDineInScheduleAlertsEnabled
} from '../utils/dineInScheduleAlerts.js';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

const buildOrder = (overrides = {}) => ({
  pos_transaction_id: 9301,
  invoice_number: 'INV-9301',
  order_method: 'dine_in',
  scheduled_for: '2026-09-23T12:15:00.000Z',
  fulfillment_status: 'confirmed',
  ...overrides
});
describe('Dine-in schedule alert scheduler', () => {
  it('only enables cashier alerts for an active, authorized F&B terminal', () => {
    const eligibleState = {
      workflowMode: 'fnb',
      onlineOrderQueueEnabled: true,
      incomingOrdersAccessState: 'allowed',
      hasActiveShift: true,
      canTransactPos: true,
      locked: false
    };

    expect(isDineInScheduleAlertsEnabled(eligibleState)).toBe(true);
    expect(isDineInScheduleAlertsEnabled({ ...eligibleState, workflowMode: 'retail' })).toBe(false);
    expect(isDineInScheduleAlertsEnabled({ ...eligibleState, onlineOrderQueueEnabled: false })).toBe(false);
    expect(isDineInScheduleAlertsEnabled({ ...eligibleState, incomingOrdersAccessState: 'denied' })).toBe(false);
    expect(isDineInScheduleAlertsEnabled({ ...eligibleState, hasActiveShift: false })).toBe(false);
    expect(isDineInScheduleAlertsEnabled({ ...eligibleState, canTransactPos: false })).toBe(false);
    expect(isDineInScheduleAlertsEnabled({ ...eligibleState, locked: true })).toBe(false);
  });

  it('creates alerts for each warning window and ignores non-actionable orders', () => {
    const orders = [
      buildOrder({ pos_transaction_id: 9301, scheduled_for: '2026-09-23T12:15:00.000Z' }),
      buildOrder({ pos_transaction_id: 9302, scheduled_for: '2026-09-23T12:05:00.000Z' }),
      buildOrder({ pos_transaction_id: 9303, scheduled_for: '2026-09-23T12:03:00.000Z' }),
      buildOrder({ pos_transaction_id: 9304, scheduled_for: '2026-09-23T12:01:00.000Z' }),
      buildOrder({ pos_transaction_id: 9305, scheduled_for: '2026-09-23T12:20:00.000Z' }),
      buildOrder({
        pos_transaction_id: 9306,
        order_method: 'pickup',
        scheduled_for: '2026-09-23T12:15:00.000Z'
      }),
      buildOrder({
        pos_transaction_id: 9307,
        fulfillment_status: 'ready_for_pickup',
        scheduled_for: '2026-09-23T12:15:00.000Z'
      })
    ];

    const alerts = getDineInScheduleAlertCandidates(orders, {
      now: NOW,
      scopeKey: 'shift-1:location-10'
    });

    expect(alerts.map(({ milestone, order }) => [order.pos_transaction_id, milestone]))
      .toEqual([
        [9301, 15],
        [9302, 5],
        [9303, 3],
        [9304, 1]
      ]);
  });

  it('deduplicates repeated polling while allowing the next milestone', () => {
    const order = buildOrder({ pos_transaction_id: 9310 });
    const alertedKeys = new Set();

    const firstPoll = getDineInScheduleAlertCandidates([order], {
      now: NOW,
      scopeKey: 'shift-1:location-10',
      alertedKeys
    });
    firstPoll.forEach(({ alertKey }) => alertedKeys.add(alertKey));

    expect(firstPoll).toHaveLength(1);
    expect(firstPoll[0].milestone).toBe(15);
    expect(getDineInScheduleAlertCandidates([order], {
      now: NOW,
      scopeKey: 'shift-1:location-10',
      alertedKeys
    })).toEqual([]);

    const nextMilestonePoll = getDineInScheduleAlertCandidates([order], {
      now: Date.parse('2026-09-23T12:10:00.000Z'),
      scopeKey: 'shift-1:location-10',
      alertedKeys
    });

    expect(nextMilestonePoll).toHaveLength(1);
    expect(nextMilestonePoll[0].milestone).toBe(5);
    expect(nextMilestonePoll[0].alertKey).not.toBe(firstPoll[0].alertKey);
  });

  it('queues earlier serve times first and does not add the same alert twice', () => {
    const later = getDineInScheduleAlertCandidates([
      buildOrder({ pos_transaction_id: 9320, scheduled_for: '2026-09-23T12:15:00.000Z' })
    ], { now: NOW, scopeKey: 'shift-1:location-10' })[0];
    const earlier = getDineInScheduleAlertCandidates([
      buildOrder({ pos_transaction_id: 9321, scheduled_for: '2026-09-23T12:05:00.000Z' })
    ], { now: NOW, scopeKey: 'shift-1:location-10' })[0];

    const queue = appendDineInScheduleAlertQueue(
      [later],
      [later, earlier]
    );

    expect(queue.map(({ order }) => order.pos_transaction_id)).toEqual([9321, 9320]);
    expect(new Set(queue.map(({ alertKey }) => alertKey)).size).toBe(2);
  });
});
