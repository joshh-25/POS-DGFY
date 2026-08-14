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

function usePersistenceHarness({ mode, storeSlug }) {
  const [cart, setCart] = useState([LAUNDRY_LINE]);
  useStorefrontCartPersistence({
    cart,
    enabled: true,
    mode,
    setCart,
    storeSlug
  });
  return { cart, setCart };
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
});
