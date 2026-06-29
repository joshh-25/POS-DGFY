import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_TRACKING_POLL_INTERVALS,
  buildTrackingPinKey,
  createCompletionTrackingScheduler,
  dedupeActiveCustomerOrders,
  formatTrackingCooldown,
  getTrackingRetryAfterSeconds,
  mergeVisibleTrackingResult,
  resolveSelectedTrackingPollMs,
  resolveTrackingRetryDelayMs
} from '../tracking/customerTrackingRefresh.js';

describe('customer tracking refresh policy', () => {
  it('uses customer-safe visible polling intervals instead of the old 3-5 second loop', () => {
    expect(resolveSelectedTrackingPollMs({
      visibilityState: 'visible',
      status: 'placed'
    })).toBe(20000);
    expect(resolveSelectedTrackingPollMs({
      visibilityState: 'visible',
      status: 'preparing'
    })).toBe(15000);
    expect(resolveSelectedTrackingPollMs({
      visibilityState: 'visible',
      status: 'out_for_delivery'
    })).toBe(10000);
    expect(CUSTOMER_TRACKING_POLL_INTERVALS.visibleFastActive).toBeGreaterThan(5000);
  });

  it('starts once, prevents overlapping requests, and schedules only after completion', async () => {
    const scheduled = [];
    let resolvePoll;
    let requestCount = 0;
    const scheduler = createCompletionTrackingScheduler({
      poll: () => {
        requestCount += 1;
        return new Promise((resolve) => {
          resolvePoll = resolve;
        });
      },
      resolveDelayMs: () => 15000,
      setTimeoutFn: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return scheduled.length;
      },
      clearTimeoutFn: () => {}
    });

    scheduler.start();
    scheduler.start();
    await scheduler.runNow();
    expect(requestCount).toBe(1);
    expect(scheduler.isInFlight()).toBe(true);
    expect(scheduled).toEqual([]);

    resolvePoll({ status: 'preparing' });
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduler.isInFlight()).toBe(false);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delayMs).toBe(15000);

    const nextPoll = scheduled.shift();
    void nextPoll.callback();
    expect(requestCount).toBe(2);
    scheduler.stop();
  });

  it('honors server retry metadata without replacing the last successful status', async () => {
    const scheduled = [];
    let requestCount = 0;
    let visibleTracking = { tracking_pin: 'SK-ORDER01', status: 'placed' };
    const error = Object.assign(new Error('Too many tracking requests'), {
      status: 429,
      retryAfterSeconds: 878
    });
    const scheduler = createCompletionTrackingScheduler({
      poll: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          visibleTracking = { ...visibleTracking, status: 'preparing' };
          return visibleTracking;
        }
        throw error;
      },
      resolveDelayMs: ({ error: pollError }) => resolveTrackingRetryDelayMs({
        error: pollError,
        normalDelayMs: 15000
      }),
      setTimeoutFn: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return scheduled.length;
      },
      clearTimeoutFn: () => {}
    });

    scheduler.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(visibleTracking.status).toBe('preparing');
    expect(scheduled[0].delayMs).toBe(15000);

    await scheduled.shift().callback();
    expect(visibleTracking.status).toBe('preparing');
    expect(scheduled[0].delayMs).toBe(878000);
    scheduler.stop();
  });

  it('changes the background scheduler key only when normalized PIN membership changes', () => {
    const initial = buildTrackingPinKey([
      { tracking_pin: 'sk-bg02', status: 'placed', updated_at: '2026-06-29T10:00:00Z' },
      { tracking_pin: 'SK-BG01', status: 'confirmed' }
    ], { excludePin: 'SK-SELECTED' });
    const metadataOnly = buildTrackingPinKey([
      { tracking_pin: 'SK-BG01', status: 'completed', updated_at: '2026-06-29T10:05:00Z' },
      { tracking_pin: 'SK-BG02', status: 'preparing' }
    ], { excludePin: 'SK-SELECTED' });
    const membershipChanged = buildTrackingPinKey([
      { tracking_pin: 'SK-BG01' },
      { tracking_pin: 'SK-BG03' }
    ], { excludePin: 'SK-SELECTED' });

    expect(initial).toBe('SK-BG01|SK-BG02');
    expect(metadataOnly).toBe(initial);
    expect(membershipChanged).not.toBe(initial);
    expect(buildTrackingPinKey([{ tracking_pin: 'SK-BG01' }], { enabled: false })).toBe('');
  });

  it('backs off for hidden views and stops terminal tracking views', () => {
    expect(resolveSelectedTrackingPollMs({
      visibilityState: 'hidden',
      status: 'preparing'
    })).toBe(90000);
    expect(resolveSelectedTrackingPollMs({
      visibilityState: 'visible',
      status: 'completed'
    })).toBe(0);
  });

  it('does not schedule a follow-up request when the resolved delay is zero', async () => {
    const scheduled = [];
    const scheduler = createCompletionTrackingScheduler({
      poll: async () => ({ status: 'completed' }),
      resolveDelayMs: ({ result }) => resolveSelectedTrackingPollMs({ status: result.status }),
      setTimeoutFn: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return scheduled.length;
      },
      clearTimeoutFn: () => {}
    });

    scheduler.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduled).toEqual([]);
    scheduler.stop();
  });

  it('extracts retry metadata and formats calm countdown copy', () => {
    expect(getTrackingRetryAfterSeconds({ retryAfterSeconds: 61 })).toBe(61);
    expect(getTrackingRetryAfterSeconds({ details: { retryAfterSeconds: 120 } })).toBe(120);
    expect(getTrackingRetryAfterSeconds({ data: { retryAfterSeconds: 12.2 } })).toBe(13);
    expect(formatTrackingCooldown(45)).toBe('45 seconds');
    expect(formatTrackingCooldown(61)).toBe('2 minutes');
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
