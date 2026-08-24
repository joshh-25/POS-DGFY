/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCustomerDashboardLiveSync } from '../useCustomerDashboardLiveSync.js';

const setVisibilityState = (value) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
};

const setOnLine = (value) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
};

const buildProps = (overrides = {}) => ({
  isDgfyCustomerSignedIn: true,
  isAccountDrawerOpen: false,
  isStandaloneAccountPage: true,
  isGuestTrackingDrawerOpen: false,
  activeCustomerOrderCount: 0,
  accountPanelRefreshInFlightRef: { current: false },
  loadAccountPanelRef: { current: vi.fn().mockResolvedValue(undefined) },
  mergeLiveAccountActivityRef: { current: vi.fn() },
  setAccountPanel: vi.fn(),
  withApiOrigin: (path) => path,
  ...overrides
});

// The dashboard poll fans out into ~11 parallel requestJson calls per tick
// (loadDgfyPanel) and is a reconciliation safety net behind a live SSE
// channel (see the second effect in the hook), not the primary update path.
// #958/#509: this used to poll every 3s while an order was active, enough
// for one phone to exhaust the shared production rate-limit budget in
// ~5.5 minutes and lock out everyone on the same network -- now 60s/120s
// regardless of active-order state. A backgrounded tab on a dead connection
// used to keep firing that fan-out indefinitely, each rejection burning a
// Sentry event. These tests lock in that a hidden tab or an offline browser
// skips the actual fetch (not the timer), and resumes on its own once the
// tab is visible/online again -- no remount required.
describe('useCustomerDashboardLiveSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState('visible');
    setOnLine(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips the initial and polled refresh while the tab is hidden, and resumes once visible', async () => {
    setVisibilityState('hidden');
    const props = buildProps();
    renderHook(() => useCustomerDashboardLiveSync(props));

    // The unconditional `void refresh()` on mount must not call through
    // while hidden.
    await vi.advanceTimersByTimeAsync(0);
    expect(props.loadAccountPanelRef.current).not.toHaveBeenCalled();

    // pollMs() resolves to 120000 while hidden; the tick still fires but
    // refresh() itself must no-op.
    await vi.advanceTimersByTimeAsync(120000);
    expect(props.loadAccountPanelRef.current).not.toHaveBeenCalled();

    // The tab returns; but the timer that fired at t=120000 already
    // rescheduled itself for another 120000 (pollMs() is read synchronously
    // right after that refresh, still hidden at that instant) -- so it's
    // *that* pending timer, not a fresh one, that picks up the visibility
    // change on its next tick.
    setVisibilityState('visible');
    await vi.advanceTimersByTimeAsync(120000);
    expect(props.loadAccountPanelRef.current).toHaveBeenCalledTimes(1);
  });

  it('skips the initial and polled refresh while offline, and resumes once back online', async () => {
    setOnLine(false);
    const props = buildProps();
    renderHook(() => useCustomerDashboardLiveSync(props));

    await vi.advanceTimersByTimeAsync(0);
    expect(props.loadAccountPanelRef.current).not.toHaveBeenCalled();

    // Visible -> pollMs() is 60000 regardless of active-order state.
    await vi.advanceTimersByTimeAsync(60000);
    expect(props.loadAccountPanelRef.current).not.toHaveBeenCalled();

    setOnLine(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(props.loadAccountPanelRef.current).toHaveBeenCalledTimes(1);
  });

  it('refreshes normally when the tab is visible and online', async () => {
    const props = buildProps();
    renderHook(() => useCustomerDashboardLiveSync(props));

    await vi.advanceTimersByTimeAsync(0);
    expect(props.loadAccountPanelRef.current).toHaveBeenCalledTimes(1);
  });

  // #958/#509 regression: an active order used to drop the visible-tab
  // interval to 3s (~3.7 req/s from the 11-request fan-out), which was
  // enough on its own to exhaust the shared production rate-limit budget.
  // The poll must stay at the 60s reconciliation-net cadence regardless of
  // active-order count -- the SSE channel in the hook's second effect is
  // what actually carries real-time updates now.
  it('does not speed up polling for an active order', async () => {
    const props = buildProps({ activeCustomerOrderCount: 1 });
    renderHook(() => useCustomerDashboardLiveSync(props));

    await vi.advanceTimersByTimeAsync(0);
    expect(props.loadAccountPanelRef.current).toHaveBeenCalledTimes(1);

    // Old behavior would have fired again well before 60s (at 3s ticks).
    await vi.advanceTimersByTimeAsync(59999);
    expect(props.loadAccountPanelRef.current).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(props.loadAccountPanelRef.current).toHaveBeenCalledTimes(2);
  });

  // #958/#509: a 429 must extend the next poll past the normal 60s cadence
  // by retryAfterSeconds -- re-arming at the normal interval into a limiter
  // that just rejected the request is exactly what turned a 429 into a
  // multi-minute outage on 2026-08-24.
  it('backs off past the normal cadence after a 429', async () => {
    const props = buildProps();
    const loadAccountPanel = vi.fn().mockResolvedValue({ retryAfterSeconds: 274 });
    props.loadAccountPanelRef.current = loadAccountPanel;
    renderHook(() => useCustomerDashboardLiveSync(props));

    await vi.advanceTimersByTimeAsync(0);
    expect(loadAccountPanel).toHaveBeenCalledTimes(1);

    // Next poll would normally fire at 60000, but retryAfterSeconds=274s
    // (274000ms) must win since it's the larger delay -- confirm it has
    // not fired again well before that (proves the 60000 cadence alone was
    // NOT used), then confirm it does fire once the backoff window passes.
    // A small buffer around the exact 274000ms boundary absorbs the sub-ms
    // Date.now() drift fake timers introduce across the await in refresh().
    await vi.advanceTimersByTimeAsync(270000);
    expect(loadAccountPanel).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10000);
    expect(loadAccountPanel).toHaveBeenCalledTimes(2);
  });
});
