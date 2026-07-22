import { afterEach, describe, expect, it } from 'vitest';

import { useStorefrontStore } from '../useStorefrontStore.js';
import {
  selectIsMobileViewport,
  selectIsOnlinePaymentModalOpen,
  selectShowOrderSuccessAnimation
} from '../selectors/uiSelectors.js';

// The store is a module singleton; reset after every test so cases stay isolated
// (this is exactly the reset contract the slices rely on in the app shell).
afterEach(() => {
  useStorefrontStore.getState().reset();
});

describe('useStorefrontStore scaffolding', () => {
  it('composes every domain slice namespace', () => {
    const state = useStorefrontStore.getState();
    expect(state.ui).toBeTypeOf('object');
    expect(state.session).toBeTypeOf('object');
    expect(state.catalog).toBeTypeOf('object');
    expect(state.cart).toBeTypeOf('object');
    expect(state.checkout).toBeTypeOf('object');
    expect(state.serviceBooking).toBeTypeOf('object');
    expect(state.discovery).toBeTypeOf('object');
    expect(state.reset).toBeTypeOf('function');
  });

  it('exposes the ui reference slice initial state', () => {
    const state = useStorefrontStore.getState();
    expect(selectIsOnlinePaymentModalOpen(state)).toBe(false);
    expect(selectShowOrderSuccessAnimation(state)).toBe(false);
    expect(selectIsMobileViewport(state)).toBe(false);
  });
});

describe('uiSlice reference actions', () => {
  it('opens and closes the online-payment modal immutably', () => {
    const before = useStorefrontStore.getState().ui;
    useStorefrontStore.getState().uiOpenOnlinePaymentModal();
    expect(useStorefrontStore.getState().ui.isOnlinePaymentModalOpen).toBe(true);
    // Immutability: a new ui object was produced, not mutated in place.
    expect(useStorefrontStore.getState().ui).not.toBe(before);

    useStorefrontStore.getState().uiCloseOnlinePaymentModal();
    expect(useStorefrontStore.getState().ui.isOnlinePaymentModalOpen).toBe(false);
  });

  it('coerces truthiness for the flag setters', () => {
    useStorefrontStore.getState().uiSetShowOrderSuccessAnimation('yes');
    useStorefrontStore.getState().uiSetMobileViewport(1);
    const state = useStorefrontStore.getState();
    expect(selectShowOrderSuccessAnimation(state)).toBe(true);
    expect(selectIsMobileViewport(state)).toBe(true);
  });

  it('does not bleed one slice into another', () => {
    useStorefrontStore.getState().uiSetMobileViewport(true);
    // Touching ui must leave every other domain namespace untouched.
    expect(useStorefrontStore.getState().session).toEqual({});
    expect(useStorefrontStore.getState().cart).toEqual({});
  });
});

describe('store reset', () => {
  it('restores initial state via getInitialState()', () => {
    useStorefrontStore.getState().uiOpenOnlinePaymentModal();
    useStorefrontStore.getState().uiSetMobileViewport(true);
    expect(useStorefrontStore.getState().ui.isMobileViewport).toBe(true);

    useStorefrontStore.getState().reset();

    const state = useStorefrontStore.getState();
    expect(state.ui.isOnlinePaymentModalOpen).toBe(false);
    expect(state.ui.isMobileViewport).toBe(false);
    expect(state.ui.showOrderSuccessAnimation).toBe(false);
  });
});
