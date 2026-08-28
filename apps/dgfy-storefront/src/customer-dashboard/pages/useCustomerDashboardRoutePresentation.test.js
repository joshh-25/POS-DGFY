// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCustomerDashboardRoutePresentation } from './useCustomerDashboardRoutePresentation.js';

// Regression coverage for #1100: this effect's `dgfy_account=1` handling is
// the mechanism that hijacked a returning checkout login and hard-redirected
// the customer to the dashboard, discarding the resumed checkout state.
// `useCustomerAuthNavigation`'s checkout return-URL builder no longer emits
// the marker (see its own test file) - this pins the consumer side: a
// checkout URL with no marker must never trigger the dashboard takeover,
// while the marker still does its intended job on the header/account flow.
const buildProps = (overrides = {}) => ({
  currentPathname: '/tenant-store/laundry-store',
  currentPathSubpage: '',
  routeSubpage: '',
  routeSlug: 'laundry-store',
  isSignedIn: true,
  isDrawerOpen: false,
  onCloseDrawer: vi.fn(),
  onCloseCheckout: vi.fn(),
  onCloseGuestTrackingDrawer: vi.fn(),
  onLoadAccountPanel: vi.fn(),
  onGoDiscovery: vi.fn(),
  onGoStore: vi.fn(),
  resolveAccountUrl: vi.fn(() => '/map-dgfy/account'),
  ...overrides
});

describe('useCustomerDashboardRoutePresentation - dgfy_account marker handling (#1100)', () => {
  let locationUrl;

  // jsdom doesn't implement real navigation - stub `window.location` the
  // same way discoveryHeaderAccount.integration.test.jsx does, so assigning
  // `window.location.href` (the effect's dashboard-takeover redirect) is
  // observable instead of throwing/no-op-ing.
  beforeEach(() => {
    locationUrl = new URL('http://localhost/tenant-store/laundry-store');
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        get href() { return locationUrl.toString(); },
        set href(value) { locationUrl = new URL(String(value || ''), locationUrl.toString()); },
        get pathname() { return locationUrl.pathname; },
        get search() { return locationUrl.search; }
      }
    });
  });

  it('does not close checkout or redirect for a signed-in checkout URL with no dgfy_account marker', () => {
    const props = buildProps();
    renderHook(() => useCustomerDashboardRoutePresentation(props));

    expect(props.onCloseCheckout).not.toHaveBeenCalled();
    expect(props.onCloseGuestTrackingDrawer).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/tenant-store/laundry-store');
  });

  it('still force-redirects to the dashboard when the marker is present on a non-account page (intended header-flow behavior)', () => {
    locationUrl = new URL('http://localhost/tenant-store/laundry-store?dgfy_account=1');
    const props = buildProps();

    act(() => {
      renderHook(() => useCustomerDashboardRoutePresentation(props));
    });

    expect(props.onCloseCheckout).toHaveBeenCalled();
    expect(props.resolveAccountUrl).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/map-dgfy/account');
  });
});
