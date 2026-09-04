// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStorefrontCartPersistence } from './useStorefrontCartPersistence.js';
import {
  readStorefrontCartSnapshot,
  writeStorefrontCartSnapshot
} from '../model/storefrontCartStorage.js';

const LAUNDRY_LINE = {
  item_id: 94,
  cart_line_id: '94:default',
  name: 'Laundry wash and fold',
  category: 'service',
  quantity: 1,
  price: 500
};

const RETAIL_LINE = {
  item_id: 208,
  cart_line_id: '208:default',
  name: 'Canvas tote',
  category: 'retail',
  quantity: 2,
  price: 399
};

const SIMPLE_LINE = {
  item_id: 309,
  cart_line_id: '309:default',
  name: 'Pan de Coco',
  category: 'retail',
  quantity: 1,
  price: 25
};

function usePersistenceHarness({ mode, storeSlug, initialVoucherCode = '' }) {
  const [cart, setCart] = useState([LAUNDRY_LINE]);
  const [voucherCode, setVoucherCode] = useState(initialVoucherCode);
  const [promoCode, setPromoCode] = useState('');
  useStorefrontCartPersistence({
    cart,
    enabled: true,
    mode,
    promoCode,
    setCart,
    setPromoCode,
    setVoucherCode,
    storeSlug,
    voucherCode
  });
  return {
    cart, setCart, voucherCode, setVoucherCode, promoCode, setPromoCode
  };
}

describe('useStorefrontCartPersistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('clears a previous store cart and restores only the destination store snapshot', async () => {
    writeStorefrontCartSnapshot({
      storeSlug: 'laundry-store',
      mode: 'services',
      cart: [LAUNDRY_LINE]
    });

    const { result, rerender } = renderHook(
      (props) => usePersistenceHarness(props),
      { initialProps: { mode: 'services', storeSlug: 'laundry-store' } }
    );

    await waitFor(() => {
      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0]).toMatchObject(LAUNDRY_LINE);
    });

    rerender({ mode: 'fnb', storeSlug: 'fnb-store' });
    await waitFor(() => expect(result.current.cart).toEqual([]));
    expect(readStorefrontCartSnapshot('fnb-store', { mode: 'fnb' })).toBeNull();

    // A route transition can briefly have the destination mode with the
    // previous store slug before the destination profile resolves. That must
    // not delete the previous mode's valid snapshot.
    rerender({ mode: 'fnb', storeSlug: 'laundry-store' });
    await waitFor(() => expect(result.current.cart).toEqual([]));
    expect(readStorefrontCartSnapshot('laundry-store', { mode: 'services' })).not.toBeNull();

    rerender({ mode: 'services', storeSlug: 'laundry-store' });
    await waitFor(() => {
      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0]).toMatchObject(LAUNDRY_LINE);
    });
  });

  it('does not let a stale cart write into the destination scope during hydration', async () => {
    const { result, rerender } = renderHook(
      (props) => usePersistenceHarness(props),
      { initialProps: { mode: 'services', storeSlug: 'laundry-store' } }
    );

    await waitFor(() => expect(result.current.cart).toEqual([]));
    act(() => result.current.setCart([LAUNDRY_LINE]));

    rerender({ mode: 'fnb', storeSlug: 'fnb-store' });
    await waitFor(() => expect(result.current.cart).toEqual([]));
    expect(readStorefrontCartSnapshot('fnb-store', { mode: 'fnb' })).toBeNull();
  });

  it('restores an unfinished retail cart after a hard-refresh remount', async () => {
    const firstRender = renderHook(
      (props) => usePersistenceHarness(props),
      { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
    );

    await waitFor(() => expect(firstRender.result.current.cart).toEqual([]));
    act(() => firstRender.result.current.setCart([RETAIL_LINE]));
    await waitFor(() => {
      expect(readStorefrontCartSnapshot('northline-retail', { mode: 'retail' })?.cart).toHaveLength(1);
    });
    firstRender.unmount();

    const refreshedRender = renderHook(
      (props) => usePersistenceHarness(props),
      { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
    );

    await waitFor(() => expect(refreshedRender.result.current.cart[0]).toMatchObject(RETAIL_LINE));
  });

  it('keeps unfinished retail carts isolated between storefronts', async () => {
    writeStorefrontCartSnapshot({ storeSlug: 'northline-retail', mode: 'retail', cart: [RETAIL_LINE] });

    const { result, rerender } = renderHook(
      (props) => usePersistenceHarness(props),
      { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
    );
    await waitFor(() => expect(result.current.cart[0]).toMatchObject(RETAIL_LINE));

    rerender({ mode: 'retail', storeSlug: 'another-retail-store' });
    await waitFor(() => expect(result.current.cart).toEqual([]));
    expect(readStorefrontCartSnapshot('another-retail-store', { mode: 'retail' })).toBeNull();
    expect(readStorefrontCartSnapshot('northline-retail', { mode: 'retail' })?.cart[0]).toMatchObject(RETAIL_LINE);
  });

  it('keeps unfinished Simple MSME carts isolated between storefronts', async () => {
    writeStorefrontCartSnapshot({ storeSlug: 'simple-store-a', mode: 'simple', cart: [SIMPLE_LINE] });

    const { result, rerender } = renderHook(
      (props) => usePersistenceHarness(props),
      { initialProps: { mode: 'simple', storeSlug: 'simple-store-a' } }
    );
    await waitFor(() => expect(result.current.cart[0]).toMatchObject(SIMPLE_LINE));

    rerender({ mode: 'simple', storeSlug: 'simple-store-b' });
    await waitFor(() => expect(result.current.cart).toEqual([]));
    expect(readStorefrontCartSnapshot('simple-store-b', { mode: 'simple' })).toBeNull();
    expect(readStorefrontCartSnapshot('simple-store-a', { mode: 'simple' })?.cart[0]).toMatchObject(SIMPLE_LINE);

    rerender({ mode: 'simple', storeSlug: 'simple-store-a' });
    await waitFor(() => expect(result.current.cart[0]).toMatchObject(SIMPLE_LINE));
  });

  it('clears only the matching retail store snapshot when the cart is emptied after checkout', async () => {
    writeStorefrontCartSnapshot({ storeSlug: 'northline-retail', mode: 'retail', cart: [RETAIL_LINE] });
    writeStorefrontCartSnapshot({ storeSlug: 'another-retail-store', mode: 'retail', cart: [{ ...RETAIL_LINE, item_id: 209 }] });

    const { result } = renderHook(
      (props) => usePersistenceHarness(props),
      { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
    );
    await waitFor(() => expect(result.current.cart).toHaveLength(1));
    act(() => result.current.setCart([]));

    await waitFor(() => expect(readStorefrontCartSnapshot('northline-retail', { mode: 'retail' })).toBeNull());
    expect(readStorefrontCartSnapshot('another-retail-store', { mode: 'retail' })).not.toBeNull();
  });

  // #768: applying a voucher only updated React state, initialized exclusively from a URL query
  // param that applying a code never rewrites -- so it was lost on any refresh even though the
  // cart lines survived. These pin the fix: the code rides the same snapshot as the cart.
  describe('#768 voucher/promo code persistence', () => {
    it('restores an applied voucher code after a hard-refresh remount', async () => {
      const firstRender = renderHook(
        (props) => usePersistenceHarness(props),
        { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
      );

      await waitFor(() => expect(firstRender.result.current.cart).toEqual([]));
      act(() => firstRender.result.current.setCart([RETAIL_LINE]));
      act(() => firstRender.result.current.setVoucherCode('GRACEOFFER'));
      await waitFor(() => {
        expect(readStorefrontCartSnapshot('northline-retail', { mode: 'retail' })?.voucherCode).toBe('GRACEOFFER');
      });
      firstRender.unmount();

      const refreshedRender = renderHook(
        (props) => usePersistenceHarness(props),
        { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
      );

      await waitFor(() => expect(refreshedRender.result.current.cart[0]).toMatchObject(RETAIL_LINE));
      expect(refreshedRender.result.current.voucherCode).toBe('GRACEOFFER');
    });

    it('restores an applied promo code the same way', async () => {
      const firstRender = renderHook(
        (props) => usePersistenceHarness(props),
        { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
      );

      await waitFor(() => expect(firstRender.result.current.cart).toEqual([]));
      act(() => firstRender.result.current.setCart([RETAIL_LINE]));
      act(() => firstRender.result.current.setPromoCode('SAVE10'));
      await waitFor(() => {
        expect(readStorefrontCartSnapshot('northline-retail', { mode: 'retail' })?.promoCode).toBe('SAVE10');
      });
      firstRender.unmount();

      const refreshedRender = renderHook(
        (props) => usePersistenceHarness(props),
        { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
      );

      await waitFor(() => expect(refreshedRender.result.current.promoCode).toBe('SAVE10'));
    });

    // PR #769 RF-1 regression guard: `?voucher=LINKCODE` seeds React state (StorefrontApp.jsx)
    // BEFORE this hook's hydration effect ever runs. That effect must not blow the deep-linked
    // code away with an empty (or absent) snapshot on the component's first hydration.
    it('lets a URL-seeded voucher code survive first hydration when no snapshot exists', async () => {
      const { result } = renderHook(
        (props) => usePersistenceHarness(props),
        { initialProps: { mode: 'retail', storeSlug: 'northline-retail', initialVoucherCode: 'LINKCODE' } }
      );

      await waitFor(() => expect(result.current.cart).toEqual([]));
      expect(result.current.voucherCode).toBe('LINKCODE');
      expect(readStorefrontCartSnapshot('northline-retail', { mode: 'retail' })).toBeNull();
    });

    it('does not carry a voucher code over to a different store', async () => {
      writeStorefrontCartSnapshot({
        storeSlug: 'northline-retail',
        mode: 'retail',
        cart: [RETAIL_LINE],
        voucherCode: 'GRACEOFFER'
      });

      const { result, rerender } = renderHook(
        (props) => usePersistenceHarness(props),
        { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
      );
      await waitFor(() => expect(result.current.voucherCode).toBe('GRACEOFFER'));

      rerender({ mode: 'retail', storeSlug: 'another-retail-store' });
      await waitFor(() => expect(result.current.cart).toEqual([]));
      expect(result.current.voucherCode).toBe('');
    });

    it('clears the voucher code when the cart empties after checkout', async () => {
      writeStorefrontCartSnapshot({
        storeSlug: 'northline-retail',
        mode: 'retail',
        cart: [RETAIL_LINE],
        voucherCode: 'GRACEOFFER'
      });

      const { result } = renderHook(
        (props) => usePersistenceHarness(props),
        { initialProps: { mode: 'retail', storeSlug: 'northline-retail' } }
      );
      await waitFor(() => expect(result.current.cart).toHaveLength(1));
      act(() => result.current.setCart([]));

      await waitFor(() => expect(readStorefrontCartSnapshot('northline-retail', { mode: 'retail' })).toBeNull());
    });
  });
});
