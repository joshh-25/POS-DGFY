// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCartMutations } from './useCartMutations.js';

const buildProps = (cart, setCart) => ({
  bookingPermitted: true,
  cart,
  isFnbMode: true,
  isRetailMode: false,
  isServicesMode: false,
  isSimpleMode: false,
  productCartPermitted: true,
  serviceCartFabRef: { current: null },
  servicePaymentTiming: 'postpaid',
  setCart,
  setCartImageErrors: vi.fn(),
  setCheckoutTab: vi.fn(),
  setIsCheckoutOpen: vi.fn()
});

const burger = {
  item_id: 10,
  name: 'Chicken Burger',
  default_sale_price: 180,
  is_available: true,
  fnb_modifier_groups: [{ modifier_group_id: 1, required: false, options: [] }]
};

describe('useCartMutations F&B line editing', () => {
  it('replaces a customized line without creating a second line', () => {
    let cart = [{
      item_id: 10,
      cart_line_id: '10:old',
      name: 'Chicken Burger',
      quantity: 1,
      price: 180,
      line_modifiers: [{ modifier_group_id: 1, modifier_option_id: 2, option_name: 'Cheese', price_delta: 20, quantity: 1 }]
    }];
    const setCart = vi.fn((updater) => {
      cart = typeof updater === 'function' ? updater(cart) : updater;
    });
    const { result } = renderHook(() => useCartMutations(buildProps(cart, setCart)));

    act(() => result.current.replaceCartLine('10:old', burger, {
      quantity: 2,
      line_modifiers: [{ modifier_group_id: 1, modifier_option_id: 3, option_name: 'Bacon', price_delta: 35, quantity: 1 }]
    }));

    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ cart_line_id: '10:old', quantity: 2, price: 180 });
    expect(cart[0].line_modifiers).toEqual([expect.objectContaining({ modifier_option_id: 3, option_name: 'Bacon' })]);
  });

  it('merges into an existing identical modifier variant when editing', () => {
    let cart = [
      {
        item_id: 10,
        cart_line_id: '10:old',
        quantity: 1,
        price: 180,
        line_modifiers: [{ modifier_group_id: 1, modifier_option_id: 2, quantity: 1 }]
      },
      {
        item_id: 10,
        cart_line_id: '10:cheese',
        quantity: 2,
        price: 180,
        line_modifiers: [{ modifier_group_id: 1, modifier_option_id: 3, quantity: 1 }]
      }
    ];
    const setCart = vi.fn((updater) => {
      cart = typeof updater === 'function' ? updater(cart) : updater;
    });
    const { result } = renderHook(() => useCartMutations(buildProps(cart, setCart)));

    act(() => result.current.replaceCartLine('10:old', burger, {
      quantity: 1,
      line_modifiers: [{ modifier_group_id: 1, modifier_option_id: 3, quantity: 1 }]
    }));

    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({ cart_line_id: '10:cheese', quantity: 3 });
  });
});
