/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCustomerDashboardTracking } from '../customer-dashboard/hooks/useCustomerDashboardTracking.js';
import { mapAccountActivityToTrackedOrderEntry } from '../tracking/accountActivity.js';
import { mergeTrackedOrderEntries } from '../tracking/storage.js';

// Regression coverage for the same runaway-request shape fixed in
// useFnbTrackingRuntime: mergeTrackedOrderEntries always returns a new array
// identity, so accountTrackedOrders is recomputed (and the enrichment effect
// re-runs) on every account-panel live-sync poll (~3s). Before this fix, an
// order that never returns `items` from /track would be re-fetched every
// cycle for as long as its `updated_at` kept moving, even with no real
// status change.

const flushMicrotasks = async (times = 5) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
};

const buildActiveOrder = (overrides = {}) => ({
  reference: 'SK-E31P1F',
  status: 'preparing',
  updated_at: new Date().toISOString(),
  ...overrides
});

const buildProps = ({ accountPanel, setAccountPanel, fetchTrackingPayload }) => ({
  accountPanel,
  setAccountPanel,
  selectedStore: { slug: 'demo-store' },
  routeSlug: 'demo-store',
  knownStoreRouteCandidates: [],
  dgfySessionAccount: { id: 'acct-1' },
  setIsAccountDrawerOpen: () => {},
  getFetchTrackingPayload: () => fetchTrackingPayload,
  getBuildTrackedOrderEntryFromTrackingPayload: () => (payload, fallbackPin) => ({ tracking_pin: fallbackPin, items: payload?.order?.items || [] }),
  getGoStoreTrackPage: () => () => {},
  mapAccountActivityToTrackedOrderEntry,
  mergeTrackedOrderEntries,
  mergeAccountPanelActivity: (previous) => previous,
  resolveStorefrontRouteSlug: () => '',
  toSlug: (slug) => String(slug || '').trim().toLowerCase(),
  withAssetOrigin: (url) => url,
  requestJson: vi.fn(),
  normalizeStorefrontErrorMessage: (error, fallback) => error?.message || fallback,
  readDgfyAuthToken: () => 'token'
});

describe('useCustomerDashboardTracking enrichment effect', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not re-fetch a pin every poll cycle when only updated_at changes (no status transition)', async () => {
    const fetchTrackingPayload = vi.fn().mockResolvedValue({ raw: { order: { items: [] } }, normalized: null });
    let accountPanel = { orders: [buildActiveOrder()] };
    const setAccountPanel = vi.fn((updater) => {
      accountPanel = typeof updater === 'function' ? updater(accountPanel) : updater;
    });

    const { rerender } = renderHook(
      (props) => useCustomerDashboardTracking(props),
      { initialProps: buildProps({ accountPanel, setAccountPanel, fetchTrackingPayload }) }
    );

    await flushMicrotasks();
    expect(fetchTrackingPayload).toHaveBeenCalledTimes(1);

    // Simulate the ~3s live-sync poll refreshing accountPanel.orders with a
    // new updated_at but the same status ('preparing' -> 'preparing').
    for (let cycle = 0; cycle < 5; cycle += 1) {
      accountPanel = { orders: [buildActiveOrder({ updated_at: new Date(Date.now() + cycle * 3000).toISOString() })] };
      // eslint-disable-next-line no-await-in-loop
      rerender(buildProps({ accountPanel, setAccountPanel, fetchTrackingPayload }));
      // eslint-disable-next-line no-await-in-loop
      await flushMicrotasks();
    }

    expect(fetchTrackingPayload).toHaveBeenCalledTimes(1);
  });

  it('does re-fetch when the order transitions to a new status', async () => {
    const fetchTrackingPayload = vi.fn().mockResolvedValue({ raw: { order: { items: [] } }, normalized: null });
    let accountPanel = { orders: [buildActiveOrder({ status: 'placed' })] };
    const setAccountPanel = vi.fn();

    const { rerender } = renderHook(
      (props) => useCustomerDashboardTracking(props),
      { initialProps: buildProps({ accountPanel, setAccountPanel, fetchTrackingPayload }) }
    );

    await flushMicrotasks();
    expect(fetchTrackingPayload).toHaveBeenCalledTimes(1);

    accountPanel = { orders: [buildActiveOrder({ status: 'confirmed' })] };
    rerender(buildProps({ accountPanel, setAccountPanel, fetchTrackingPayload }));
    await flushMicrotasks();

    expect(fetchTrackingPayload).toHaveBeenCalledTimes(2);
  });
});
