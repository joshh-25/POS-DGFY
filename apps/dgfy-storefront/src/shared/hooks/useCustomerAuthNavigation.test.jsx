// @vitest-environment jsdom
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

import { useCustomerAuthNavigation } from './useCustomerAuthNavigation.js';
import { buildDgfyAuthUrl } from '../utils/businessRegistrationUrl.js';

// Regression coverage for #1100: logging in from checkout must return the
// customer to checkout, not the dashboard. The dashboard-redirect effect
// (`useCustomerDashboardRoutePresentation`) treats a `?dgfy_account=1`
// query marker on the post-login return URL as "force the customer onto
// the dashboard" - so the checkout return-URL builder must never emit it.
const buildProps = (overrides = {}) => ({
  activeServiceCartLine: null,
  buildBusinessRegistrationUrl: vi.fn(),
  buildDgfyAuthUrl,
  cart: [],
  checkoutTab: 'checkout',
  customerAddress: null,
  customerPin: '',
  deliveryLocationAction: null,
  dgfyAuthToken: '',
  firstServiceLine: null,
  fnbOrderStep: 1,
  fnbScheduleMode: 'asap',
  fnbScheduledFor: null,
  fnbSpecialInstructions: '',
  hasDgfyExplicitSignOut: vi.fn(() => false),
  isDgfyCustomerSignedIn: false,
  normalizeStorefrontErrorMessage: vi.fn((message) => message),
  orderMethod: 'delivery',
  readDgfySignedOutEmail: vi.fn(() => ''),
  requestJson: vi.fn(),
  resolveStorefrontAccountUrl: vi.fn(() => '/map-dgfy/account'),
  resolvedDeliveryAddress: null,
  routeSlug: 'laundry-store',
  selectedLocationId: null,
  selectedSavedLocationId: null,
  selectedServiceDetail: null,
  selectedStore: { slug: 'laundry-store' },
  serviceAppointmentAt: null,
  serviceBookingStep: 1,
  serviceIntakeResponses: {},
  serviceLocationLandmarkNote: '',
  servicePaymentTiming: 'now',
  setIsCheckoutOpen: vi.fn(),
  setIsGuestTrackingDrawerOpen: vi.fn(),
  simpleOrderStep: 1,
  toast: { success: vi.fn(), error: vi.fn() },
  writeCheckoutAuthResumeDraft: vi.fn(),
  ...overrides
});

const wrapper = ({ children }) => <BrowserRouter>{children}</BrowserRouter>;

describe('useCustomerAuthNavigation - checkout login return path (#1100)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/tenant-store/laundry-store?checkoutTab=checkout');
  });

  it('sends openCheckoutAuthFlow to /login with a return_to that points back at checkout, without the dashboard marker', () => {
    const props = buildProps();
    const { result } = renderHook(() => useCustomerAuthNavigation(props), { wrapper });

    act(() => result.current.openCheckoutAuthFlow('sign-in', { checkoutTab: 'checkout' }));

    expect(window.location.pathname).toBe('/login');
    const authParams = new URLSearchParams(window.location.search);
    expect(authParams.get('mode')).toBe('sign-in');
    const returnTo = new URL(authParams.get('return_to'));
    expect(returnTo.pathname).toBe('/tenant-store/laundry-store');
    expect(returnTo.searchParams.has('dgfy_account')).toBe(false);
  });

  it('persists the checkout resume draft with a returnTo that also lacks the dashboard marker', () => {
    const props = buildProps();
    const { result } = renderHook(() => useCustomerAuthNavigation(props), { wrapper });

    act(() => result.current.openCheckoutAuthFlow('sign-in', { checkoutTab: 'checkout' }));

    expect(props.writeCheckoutAuthResumeDraft).toHaveBeenCalledTimes(1);
    const draft = props.writeCheckoutAuthResumeDraft.mock.calls[0][0];
    expect(new URL(draft.returnTo).searchParams.has('dgfy_account')).toBe(false);
  });

  it('leaves the header/account-panel sign-in flow on the dashboard return path, unaffected by the checkout fix', () => {
    const props = buildProps({ isDgfyCustomerSignedIn: false });
    const { result } = renderHook(() => useCustomerAuthNavigation(props), { wrapper });

    act(() => result.current.openStorefrontHeaderAccount());

    expect(window.location.pathname).toBe('/login');
    const authParams = new URLSearchParams(window.location.search);
    expect(authParams.get('return_to')).toBe('/map-dgfy/account');
  });
});
