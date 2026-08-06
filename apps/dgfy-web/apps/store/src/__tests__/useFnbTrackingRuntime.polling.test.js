/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFnbTrackingRuntime } from '../modes/fnb/tracking/hooks/useFnbTrackingRuntime.js';

// Regression coverage for the runaway-polling bug: the selected-pin tracking
// effect used to depend on `guestTrackedOrders`, an array that got a new
// identity on every successful poll (even when nothing changed), which tore
// down and immediately recreated the interval — producing several requests
// per second and tripping the backend's 429 rate limiter.

// vi.advanceTimersByTimeAsync flushes real timers but @testing-library's
// waitFor polls with its own timer, which deadlocks under fake timers. Flush
// pending microtasks (promise resolutions inside the poll) directly instead.
const flushMicrotasks = async (times = 5) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
};

const buildTrackingResponse = (overrides = {}) => ({
  status: 'preparing',
  status_label: 'Preparing',
  tracking_pin: 'SK-E31P1F',
  order: { order_method: 'pickup', items: [] },
  ...overrides
});

const buildRuntimeProps = (requestJson) => ({
  checkoutTab: 'track',
  isFnbOrderSubpage: true,
  normalizeErrorMessage: (error, fallback) => error?.message || fallback,
  requestJson,
  routeSlug: 'demo-store',
  selectedStore: { slug: 'demo-store' },
  toSlug: (slug) => String(slug || '').trim().toLowerCase(),
  trackingAdapterRegistry: { resolve: () => null },
  trackingMode: 'fnb'
});

describe('useFnbTrackingRuntime polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not refetch again just because the previous response resolved (no runaway loop)', async () => {
    const requestJson = vi.fn().mockResolvedValue(buildTrackingResponse());
    const { result, unmount } = renderHook(() => useFnbTrackingRuntime(buildRuntimeProps(requestJson)));

    act(() => { result.current.setSelectedTrackingPin('SK-E31P1F'); });
    await flushMicrotasks();
    expect(requestJson).toHaveBeenCalledTimes(1);

    // Flush more microtasks with timers frozen. If the dependency-array bug
    // were still present, the effect would keep tearing down/recreating
    // itself and firing more requests without any timer ever advancing.
    await flushMicrotasks(10);
    expect(requestJson).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('waits for the resolved delay before polling again', async () => {
    const requestJson = vi.fn().mockResolvedValue(buildTrackingResponse());
    const { result, unmount } = renderHook(() => useFnbTrackingRuntime(buildRuntimeProps(requestJson)));

    act(() => { result.current.setSelectedTrackingPin('SK-E31P1F'); });
    await flushMicrotasks();
    expect(requestJson).toHaveBeenCalledTimes(1);

    // 'preparing' resolves to the 15s visible-active tier.
    await act(async () => { await vi.advanceTimersByTimeAsync(14000); });
    expect(requestJson).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await flushMicrotasks();
    expect(requestJson).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('stops polling once the order reaches a terminal status', async () => {
    const requestJson = vi.fn().mockResolvedValue(buildTrackingResponse({ status: 'completed', status_label: 'Completed' }));
    const { result, unmount } = renderHook(() => useFnbTrackingRuntime(buildRuntimeProps(requestJson)));

    act(() => { result.current.setSelectedTrackingPin('SK-E31P1F'); });
    await flushMicrotasks();
    expect(requestJson).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    expect(requestJson).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('backs off using Retry-After when the server responds 429', async () => {
    const rateLimitError = Object.assign(new Error('Too many tracking refresh requests'), {
      status: 429,
      retryAfterSeconds: 120
    });
    const requestJson = vi.fn()
      .mockResolvedValueOnce(buildTrackingResponse())
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue(buildTrackingResponse());

    const { result, unmount } = renderHook(() => useFnbTrackingRuntime(buildRuntimeProps(requestJson)));

    act(() => { result.current.setSelectedTrackingPin('SK-E31P1F'); });
    await flushMicrotasks();
    expect(requestJson).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await flushMicrotasks();
    expect(requestJson).toHaveBeenCalledTimes(2);
    expect(result.current.trackingError).toMatch(/Retrying in/);

    // Normal 15s tier would have fired the next request already; the 120s
    // Retry-After backoff must suppress that.
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(requestJson).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
    await flushMicrotasks();
    expect(requestJson).toHaveBeenCalledTimes(3);

    unmount();
  });
});
