// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCheckoutAuthResumeRestore } from './useCheckoutAuthResumeRestore.js';
import {
  clearCheckoutAuthResumeDraft,
  readCheckoutAuthResumeDraft,
  writeCheckoutAuthResumeDraft
} from '../model/storefrontCustomerStorage.js';
import { toSlug } from '../utils/storefrontFormatters.js';

// Regression coverage for #1100 (pr-reviewer RF-2): the checkout-entry ->
// login -> resume round trip end to end, one representative draft per
// checkout mode (retail/simple, F&B, services), asserting the restored
// cart/step/location state, `setIsCheckoutOpen(true)`, draft cleanup, and
// the success notice - not just that the marker/URL is clean (that's
// useCustomerAuthNavigation.test.jsx and
// useCustomerDashboardRoutePresentation.test.js's job).
const CART = [{ item_id: 1, name: 'Test item', quantity: 1, price: 100 }];

const buildRestoreProps = (overrides = {}) => ({
  catalog: [],
  clearCheckoutAuthResumeDraft,
  hasAppliedCheckoutAuthResume: false,
  isDgfyCustomerSignedIn: true,
  readCheckoutAuthResumeDraft,
  routeSlug: 'laundry-store',
  selectedStore: { slug: 'laundry-store' },
  setCart: vi.fn(),
  setCheckoutTab: vi.fn(),
  setCustomerAddress: vi.fn(),
  setCustomerPin: vi.fn(),
  setDeliveryLocationAction: vi.fn(),
  setFnbOrderStep: vi.fn(),
  setFnbScheduleMode: vi.fn(),
  setFnbScheduledFor: vi.fn(),
  setFnbSpecialInstructions: vi.fn(),
  setHasAppliedCheckoutAuthResume: vi.fn(),
  setIsCheckoutOpen: vi.fn(),
  setOrderMethod: vi.fn(),
  setResolvedDeliveryAddress: vi.fn(),
  setSelectedLocationId: vi.fn(),
  setSelectedSavedLocationId: vi.fn(),
  setSelectedServiceDetail: vi.fn(),
  setServiceAppointmentAt: vi.fn(),
  setServiceBookingStep: vi.fn(),
  setServiceIntakeResponses: vi.fn(),
  setServiceLocationLandmarkNote: vi.fn(),
  setServicePaymentTiming: vi.fn(),
  setSimpleOrderStep: vi.fn(),
  toSlug,
  toast: { success: vi.fn(), error: vi.fn() },
  ...overrides
});

describe('useCheckoutAuthResumeRestore - checkout-entry-to-login-to-resume round trip (#1100)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('resumes a retail/simple checkout draft: cart, location, address, step, and checkout reopened', () => {
    writeCheckoutAuthResumeDraft({
      routeSlug: 'laundry-store',
      returnTo: 'https://dgfy.ph/tenant-store/laundry-store',
      checkoutTab: 'checkout',
      cart: CART,
      selectedLocationId: 42,
      orderMethod: 'delivery',
      customerAddress: '123 Rizal St',
      resolvedDeliveryAddress: '123 Rizal St, Manila',
      deliveryLocationAction: 'confirmed'
    });

    const props = buildRestoreProps();
    renderHook(() => useCheckoutAuthResumeRestore(props));

    expect(props.setCart).toHaveBeenCalledWith(CART);
    expect(props.setSelectedLocationId).toHaveBeenCalledWith(42);
    expect(props.setOrderMethod).toHaveBeenCalledWith('delivery');
    expect(props.setCustomerAddress).toHaveBeenCalledWith('123 Rizal St');
    expect(props.setResolvedDeliveryAddress).toHaveBeenCalledWith('123 Rizal St, Manila');
    expect(props.setDeliveryLocationAction).toHaveBeenCalledWith('confirmed');
    expect(props.setSimpleOrderStep).toHaveBeenCalledWith(1);
    expect(props.setCheckoutTab).toHaveBeenCalledWith('checkout');
    expect(props.setIsCheckoutOpen).toHaveBeenCalledWith(true);
    expect(props.setHasAppliedCheckoutAuthResume).toHaveBeenCalledWith(true);
    expect(readCheckoutAuthResumeDraft()).toBeNull();
    expect(props.toast.success).toHaveBeenCalledWith('Signed in. Resuming your checkout.');
  });

  it('resumes an F&B cart-tab draft with the F&B-specific step and schedule fields', () => {
    writeCheckoutAuthResumeDraft({
      routeSlug: 'fnb-store',
      returnTo: 'https://dgfy.ph/tenant-store/fnb-store',
      checkoutTab: 'cart',
      cart: CART,
      fnbScheduleMode: 'scheduled',
      fnbScheduledFor: '2026-08-29T12:00:00.000Z',
      fnbSpecialInstructions: 'No onions'
    });

    const props = buildRestoreProps({ routeSlug: 'fnb-store', selectedStore: { slug: 'fnb-store' } });
    renderHook(() => useCheckoutAuthResumeRestore(props));

    expect(props.setCart).toHaveBeenCalledWith(CART);
    expect(props.setFnbScheduleMode).toHaveBeenCalledWith('scheduled');
    expect(props.setFnbScheduledFor).toHaveBeenCalledWith('2026-08-29T12:00:00.000Z');
    expect(props.setFnbSpecialInstructions).toHaveBeenCalledWith('No onions');
    expect(props.setFnbOrderStep).toHaveBeenCalledWith(3);
    expect(props.setCheckoutTab).toHaveBeenCalledWith('cart');
    expect(props.setIsCheckoutOpen).toHaveBeenCalledWith(true);
    expect(readCheckoutAuthResumeDraft()).toBeNull();
  });

  it('resumes a services booking draft: matches the catalog item, sets the booking step, forces checkout tab', () => {
    writeCheckoutAuthResumeDraft({
      routeSlug: 'services-store',
      returnTo: 'https://dgfy.ph/tenant-store/services-store',
      checkoutTab: 'menu',
      cart: CART,
      selectedServiceItemId: 7,
      serviceAppointmentAt: '2026-08-30T09:00:00.000Z',
      servicePaymentTiming: 'now'
    });

    const matchedService = { item_id: 7, name: 'Haircut' };
    const props = buildRestoreProps({
      routeSlug: 'services-store',
      selectedStore: { slug: 'services-store' },
      catalog: [matchedService]
    });
    renderHook(() => useCheckoutAuthResumeRestore(props));

    expect(props.setCart).toHaveBeenCalledWith(CART);
    expect(props.setServiceAppointmentAt).toHaveBeenCalledWith('2026-08-30T09:00:00.000Z');
    expect(props.setServicePaymentTiming).toHaveBeenCalledWith('now');
    expect(props.setServiceBookingStep).toHaveBeenCalledWith(1);
    expect(props.setSelectedServiceDetail).toHaveBeenCalledWith(matchedService);
    // A service draft always forces the checkout tab, regardless of which
    // tab it was saved under (useCheckoutAuthResumeRestore.js:74).
    expect(props.setCheckoutTab).toHaveBeenCalledWith('checkout');
    expect(props.setIsCheckoutOpen).toHaveBeenCalledWith(true);
    expect(readCheckoutAuthResumeDraft()).toBeNull();
  });

  it('does not resume across a different store (route slug mismatch)', () => {
    writeCheckoutAuthResumeDraft({
      routeSlug: 'laundry-store',
      returnTo: 'https://dgfy.ph/tenant-store/laundry-store',
      checkoutTab: 'checkout',
      cart: CART
    });

    const props = buildRestoreProps({ routeSlug: 'another-store', selectedStore: { slug: 'another-store' } });
    renderHook(() => useCheckoutAuthResumeRestore(props));

    expect(props.setCart).not.toHaveBeenCalled();
    expect(props.setIsCheckoutOpen).not.toHaveBeenCalled();
    // The draft is left in place for whichever store it actually belongs to.
    expect(readCheckoutAuthResumeDraft()).not.toBeNull();
  });

  it('does not resume before the customer is actually signed in', () => {
    writeCheckoutAuthResumeDraft({
      routeSlug: 'laundry-store',
      returnTo: 'https://dgfy.ph/tenant-store/laundry-store',
      checkoutTab: 'checkout',
      cart: CART
    });

    const props = buildRestoreProps({ isDgfyCustomerSignedIn: false });
    renderHook(() => useCheckoutAuthResumeRestore(props));

    expect(props.setCart).not.toHaveBeenCalled();
    expect(props.setIsCheckoutOpen).not.toHaveBeenCalled();
    expect(readCheckoutAuthResumeDraft()).not.toBeNull();
  });
});
