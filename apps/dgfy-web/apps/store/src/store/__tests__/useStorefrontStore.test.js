import { afterEach, describe, expect, it } from 'vitest';

import { useStorefrontStore } from '../useStorefrontStore.js';
import {
  selectIsDesktopViewport,
  selectIsMobileViewport,
  selectIsOnlinePaymentModalOpen,
  selectShowOrderSuccessAnimation,
  selectViewportWidth
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
    expect(selectViewportWidth(state)).toBeTypeOf('number');
    expect(selectIsOnlinePaymentModalOpen(state)).toBe(false);
    expect(selectShowOrderSuccessAnimation(state)).toBe(false);
  });
});

describe('uiSlice reference actions', () => {
  it('updates viewport width and derives breakpoints via selectors', () => {
    useStorefrontStore.getState().uiSetViewportWidth(500);
    let state = useStorefrontStore.getState();
    expect(selectViewportWidth(state)).toBe(500);
    expect(selectIsMobileViewport(state)).toBe(true);
    expect(selectIsDesktopViewport(state)).toBe(false);

    useStorefrontStore.getState().uiSetViewportWidth(1440);
    state = useStorefrontStore.getState();
    expect(selectIsMobileViewport(state)).toBe(false);
    expect(selectIsDesktopViewport(state)).toBe(true);
  });

  it('opens and closes the online-payment modal immutably', () => {
    const before = useStorefrontStore.getState().ui;
    useStorefrontStore.getState().uiOpenOnlinePaymentModal();
    expect(useStorefrontStore.getState().ui.isOnlinePaymentModalOpen).toBe(true);
    // Immutability: a new ui object was produced, not mutated in place.
    expect(useStorefrontStore.getState().ui).not.toBe(before);

    useStorefrontStore.getState().uiCloseOnlinePaymentModal();
    expect(useStorefrontStore.getState().ui.isOnlinePaymentModalOpen).toBe(false);
  });

  it('coerces truthiness for the order-success flag setter', () => {
    useStorefrontStore.getState().uiSetShowOrderSuccessAnimation('yes');
    expect(selectShowOrderSuccessAnimation(useStorefrontStore.getState())).toBe(true);
  });

  it('does not bleed one slice into another', () => {
    useStorefrontStore.getState().uiSetViewportWidth(700);
    // Touching ui must leave every other domain namespace untouched.
    expect(useStorefrontStore.getState().session).toEqual({});
    expect(useStorefrontStore.getState().cart).toEqual({ items: [] });
  });
});

describe('cartSlice (useState-compatible cartSet)', () => {
  it('starts with an empty items array', () => {
    expect(useStorefrontStore.getState().cart.items).toEqual([]);
  });

  it('accepts a direct value (setCart([...]))', () => {
    const items = [{ id: 'a', qty: 1 }];
    useStorefrontStore.getState().cartSet(items);
    expect(useStorefrontStore.getState().cart.items).toBe(items);
  });

  it('accepts an updater function (setCart(prev => ...))', () => {
    useStorefrontStore.getState().cartSet([{ id: 'a', qty: 1 }]);
    useStorefrontStore.getState().cartSet((prev) => [...prev, { id: 'b', qty: 2 }]);
    const { items } = useStorefrontStore.getState().cart;
    expect(items.map((line) => line.id)).toEqual(['a', 'b']);
  });

  it('clears via setCart([])', () => {
    useStorefrontStore.getState().cartSet([{ id: 'a', qty: 1 }]);
    useStorefrontStore.getState().cartSet([]);
    expect(useStorefrontStore.getState().cart.items).toEqual([]);
  });

  it('produces a new items reference on change (memo-dependency safety)', () => {
    const before = useStorefrontStore.getState().cart.items;
    useStorefrontStore.getState().cartSet((prev) => [...prev, { id: 'x', qty: 1 }]);
    expect(useStorefrontStore.getState().cart.items).not.toBe(before);
  });
});

describe('store reset', () => {
  it('restores initial state via getInitialState()', () => {
    useStorefrontStore.getState().uiOpenOnlinePaymentModal();
    useStorefrontStore.getState().uiSetViewportWidth(320);
    expect(useStorefrontStore.getState().ui.viewportWidth).toBe(320);

    useStorefrontStore.getState().reset();

    const state = useStorefrontStore.getState();
    expect(state.ui.isOnlinePaymentModalOpen).toBe(false);
    expect(state.ui.showOrderSuccessAnimation).toBe(false);
    expect(selectViewportWidth(state)).toBeTypeOf('number');
  });
});
