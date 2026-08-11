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
});
