/* @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFnbCartDrawerRouteProps } from '../modes/fnb/checkout/hooks/useFnbCartDrawerRouteProps.js';

const baseProps = () => ({
  cart: [],
  cartAddOnsTotal: 0,
  cartCount: 0,
  cartImageErrors: {},
  cartSubtotal: 0,
  cartTotal: 0,
  checkoutTab: 'cart',
  fnbOrderBrand: null,
  getLineTotal: vi.fn(),
  goStoreCatalogPage: vi.fn(),
  goStoreOrderPage: vi.fn(),
  isDesktopCheckout: false,
  isFnbMode: true,
  isFnbOrderSubpage: false,
  isCheckoutOpen: true,
  isMobileViewport: false,
  money: vi.fn(),
  onEditCartLine: vi.fn(),
  removeCartItem: vi.fn(),
  renderPromoCodePanel: vi.fn(),
  servicesBodyFont: '',
  setCartImageErrors: vi.fn(),
  setIsCheckoutOpen: vi.fn(),
  updateQty: vi.fn(),
  withAssetOrigin: vi.fn()
});

describe('useFnbCartDrawerRouteProps (#1732)', () => {
  it('is active with a stale checkoutTab left over from a click before isFnbMode resolved (regression)', () => {
    // This is exactly the stuck state #1732 produces: StorefrontCartFab read isFnbMode as false
    // at click time and set checkoutTab to 'checkout', but isFnbMode has since resolved true.
    // Against the pre-fix `checkoutTab === 'cart'` gate this would be false; the fix drops that
    // dependency because 'checkout' has no valid UI here while !isFnbOrderSubpage anyway.
    const { result } = renderHook(() => useFnbCartDrawerRouteProps({
      ...baseProps(),
      checkoutTab: 'checkout',
      isFnbMode: true,
      isCheckoutOpen: true,
      isFnbOrderSubpage: false
    }));
    expect(result.current.isActive).toBe(true);
  });

  it('is inactive when the drawer is closed', () => {
    const { result } = renderHook(() => useFnbCartDrawerRouteProps({
      ...baseProps(),
      isCheckoutOpen: false
    }));
    expect(result.current.isActive).toBe(false);
  });

  it('is inactive on the dedicated F&B order subpage, regardless of checkoutTab/isFnbMode', () => {
    const { result } = renderHook(() => useFnbCartDrawerRouteProps({
      ...baseProps(),
      checkoutTab: 'cart',
      isFnbMode: true,
      isCheckoutOpen: true,
      isFnbOrderSubpage: true
    }));
    expect(result.current.isActive).toBe(false);
  });

  it('is inactive outside F&B mode', () => {
    const { result } = renderHook(() => useFnbCartDrawerRouteProps({
      ...baseProps(),
      isFnbMode: false
    }));
    expect(result.current.isActive).toBe(false);
  });

  it('flips active on isFnbMode resolving, without any further mutation (race simulation)', () => {
    // Simulates the actual timeline: FAB clicked while isFnbMode was still false (captured
    // checkoutTab as 'checkout'), then isFnbMode resolves true from the async store-info fetch.
    // Pre-fix, nothing re-syncs checkoutTab until the next cart mutation (useCartMutations.js);
    // post-fix, isActive must flip true purely from isFnbMode resolving, with checkoutTab still
    // sitting on its stale 'checkout' value.
    const { result, rerender } = renderHook(
      (props) => useFnbCartDrawerRouteProps(props),
      { initialProps: { ...baseProps(), isFnbMode: false, checkoutTab: 'cart' } }
    );

    // FAB click before isFnbMode resolved: checkoutTab lands on 'checkout'.
    rerender({ ...baseProps(), isFnbMode: false, checkoutTab: 'checkout' });
    expect(result.current.isActive).toBe(false);

    // isFnbMode resolves; checkoutTab is still 'checkout' -- no mutation has happened.
    rerender({ ...baseProps(), isFnbMode: true, checkoutTab: 'checkout' });
    expect(result.current.isActive).toBe(true);
  });
});
