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

  it('merges repeated identical service adds into one line quantity', () => {
    let cart = [];
    const setCart = vi.fn((updater) => {
      cart = typeof updater === 'function' ? updater(cart) : updater;
    });
    const service = {
      item_id: 501,
      name: 'Comforter Care',
      category: 'service',
      default_sale_price: 1800,
      is_available: true
    };
    const { result } = renderHook(() => useCartMutations({
      ...buildProps(cart, setCart),
      isFnbMode: false,
      isServicesMode: true
    }));

    act(() => {
      result.current.addToCart(service);
      result.current.addToCart(service);
    });

    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({
      item_id: 501,
      category: 'service',
      quantity: 2,
      price: 1800
    });
  });

  it('keeps service variants with different options as separate lines', () => {
    let cart = [];
    const setCart = vi.fn((updater) => {
      cart = typeof updater === 'function' ? updater(cart) : updater;
    });
    const service = {
      item_id: 501,
      name: 'Comforter Care',
      category: 'service',
      default_sale_price: 1800,
      is_available: true
    };
    const { result } = renderHook(() => useCartMutations({
      ...buildProps(cart, setCart),
      isFnbMode: false,
      isServicesMode: true
    }));

    act(() => {
      result.current.addToCart(service, {
        selected_option_ids: [701],
        selected_options: [{ option_id: 701, name: 'Single / Queen' }],
        unit_price: 1800
      });
      result.current.addToCart(service, {
        selected_option_ids: [702],
        selected_options: [{ option_id: 702, name: 'King' }],
        unit_price: 2200
      });
    });

    expect(cart).toHaveLength(2);
    expect(cart.map((line) => line.quantity)).toEqual([1, 1]);
  });

  it('updates service add-ons on the existing line and recalculates the unit price', () => {
    let cart = [{
      item_id: 501,
      cart_line_id: 'service-501',
      category: 'service',
      name: 'Comforter Care',
      quantity: 1,
      base_price: 1800,
      price: 1800,
      selected_options: [{ option_id: 701, group_id: 70, group_type: 'variation', name: 'Minimum Weight', price_adjustment_centavos: 0 }]
    }];
    const setCart = vi.fn((updater) => {
      cart = typeof updater === 'function' ? updater(cart) : updater;
    });
    const { result } = renderHook(() => useCartMutations({
      ...buildProps(cart, setCart),
      isFnbMode: false,
      isServicesMode: true
    }));

    const serviceOptionGroups = [{
      group_id: 71,
      name: 'Extra care',
      group_type: 'addon',
      selection_type: 'single',
      min_selections: 0,
      max_selections: 1,
      options: [{ option_id: 711, name: 'Stain treatment', price_adjustment_centavos: 2500 }]
    }];
    act(() => result.current.updateServiceLineOptions('service-501', [
      { option_id: 701, group_id: 70, group_type: 'variation', name: 'Minimum Weight', price_adjustment_centavos: 0 },
      { option_id: 711, group_id: 71, group_type: 'addon', name: 'Stain treatment', price_adjustment_centavos: 2500 }
    ], serviceOptionGroups));

    expect(cart[0]).toMatchObject({ price: 1825, base_price: 1800, selected_option_ids: [701, 711], service_option_groups: serviceOptionGroups });
    expect(cart[0].selected_options).toEqual(expect.arrayContaining([
      expect.objectContaining({ option_id: 711, group_type: 'addon' })
    ]));
  });
});
