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
// (loadDgfyPanel). A backgrounded tab on a dead connection used to keep
// firing that fan-out every 30s indefinitely, each rejection burning a
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

    // pollMs() resolves to 30000 while hidden; the tick still fires but
    // refresh() itself must no-op.
    await vi.advanceTimersByTimeAsync(30000);
    expect(props.loadAccountPanelRef.current).not.toHaveBeenCalled();

    // The tab returns; the already-scheduled timer's next tick should pick
    // up the change without needing a remount.
    setVisibilityState('visible');
    await vi.advanceTimersByTimeAsync(30000);
    expect(props.loadAccountPanelRef.current).toHaveBeenCalledTimes(1);
  });

  it('skips the initial and polled refresh while offline, and resumes once back online', async () => {
    setOnLine(false);
    const props = buildProps();
    renderHook(() => useCustomerDashboardLiveSync(props));

    await vi.advanceTimersByTimeAsync(0);
    expect(props.loadAccountPanelRef.current).not.toHaveBeenCalled();

    // Visible + no active orders -> pollMs() is 15000.
    await vi.advanceTimersByTimeAsync(15000);
    expect(props.loadAccountPanelRef.current).not.toHaveBeenCalled();

    setOnLine(true);
    await vi.advanceTimersByTimeAsync(15000);
    expect(props.loadAccountPanelRef.current).toHaveBeenCalledTimes(1);
  });

  it('refreshes normally when the tab is visible and online', async () => {
    const props = buildProps();
    renderHook(() => useCustomerDashboardLiveSync(props));

    await vi.advanceTimersByTimeAsync(0);
    expect(props.loadAccountPanelRef.current).toHaveBeenCalledTimes(1);
  });
});
