import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_TRACKING_POLL_INTERVALS,
  dedupeActiveCustomerOrders,
  mergeVisibleTrackingResult,
  resolveSelectedTrackingPollMs
} from '../tracking/customerTrackingRefresh.js';

describe('customer tracking refresh policy', () => {
  it('refreshes visible non-terminal tracking within the 3-5 second repair window', () => {
    expect(resolveSelectedTrackingPollMs({
      visibilityState: 'visible',
      status: 'preparing'
    })).toBe(4000);
    expect(CUSTOMER_TRACKING_POLL_INTERVALS.visibleActive).toBeGreaterThanOrEqual(3000);
    expect(CUSTOMER_TRACKING_POLL_INTERVALS.visibleActive).toBeLessThanOrEqual(5000);
  });

  it('backs off for hidden or terminal tracking views', () => {
    expect(resolveSelectedTrackingPollMs({
      visibilityState: 'hidden',
      status: 'preparing'
    })).toBe(90000);
    expect(resolveSelectedTrackingPollMs({
      visibilityState: 'visible',
      status: 'completed'
    })).toBe(30000);
  });

  it('dedupes active orders by tracking reference and keeps the newest status snapshot', () => {
    const result = dedupeActiveCustomerOrders([
      {
        activity_id: 'activity-1',
        reference: 'SK-ORDER01',
        status: 'confirmed',
        occurred_at: '2026-06-29T04:00:00.000Z'
      },
      {
        activity_id: 'activity-2',
        reference: 'sk-order01',
        status: 'preparing',
        occurred_at: '2026-06-29T04:05:00.000Z'
      }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      activity_id: 'activity-2',
      status: 'preparing'
    });
  });

  it('removes terminal orders from the active collection', () => {
    const result = dedupeActiveCustomerOrders([
      {
        reference: 'SK-ACTIVE1',
        status: 'ready_for_pickup',
        occurred_at: '2026-06-29T04:00:00.000Z'
      },
      {
        activity_id: 'new-terminal-snapshot',
        reference: 'SK-ACTIVE1',
        status: 'completed',
        occurred_at: '2026-06-29T04:05:00.000Z'
      },
      { reference: 'SK-CANCEL', status: 'cancelled' }
    ]);

    expect(result).toEqual([]);
  });

  it('merges a matching POS activity status into the visible tracking result', () => {
    const previous = {
      tracking_pin: 'SK-ORDER01',
      status: 'confirmed',
      status_label: 'Confirmed'
    };

    expect(mergeVisibleTrackingResult(previous, {
      reference: 'sk-order01',
      status: 'preparing',
      status_label: 'Preparing',
      occurred_at: '2026-06-29T04:05:00.000Z'
    })).toMatchObject({
      tracking_pin: 'SK-ORDER01',
      status: 'preparing',
      status_label: 'Preparing',
      updated_at: '2026-06-29T04:05:00.000Z'
    });

    expect(mergeVisibleTrackingResult(previous, {
      reference: 'SK-OTHER01',
      status: 'completed'
    })).toBe(previous);
  });
});
