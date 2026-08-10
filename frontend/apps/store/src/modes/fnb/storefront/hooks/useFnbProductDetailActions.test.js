// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFnbProductDetailActions } from './useFnbProductDetailActions.js';

const requiredGroups = [{
  modifier_group_id: 1,
  group_name: 'Size',
  required: true,
  min_select: 1,
  max_select: 1,
  options: [{ modifier_option_id: 2, option_name: 'Regular', price_delta: 0 }]
}];

const buildProps = (overrides = {}) => ({
  addToCart: vi.fn(),
  goStoreOrderPage: vi.fn(),
  item: { item_id: 10, default_sale_price: 100 },
  modifierGroups: requiredGroups,
  quantity: 1,
  selectedModifiers: [],
  toast: { error: vi.fn() },
  ...overrides
});

describe('useFnbProductDetailActions modifier gating', () => {
  it('does not add an item while a required modifier is missing', () => {
    const props = buildProps();
    const { result } = renderHook(() => useFnbProductDetailActions(props));
    act(() => result.current.addDetailToCart());
    expect(props.addToCart).not.toHaveBeenCalled();
    expect(props.toast.error).toHaveBeenCalledWith('Size requires at least 1 selection.');
  });

  it('adds the valid modifier selection after required rules are satisfied', () => {
    const selectedModifiers = [{ modifier_group_id: 1, modifier_option_id: 2, option_name: 'Regular', price_delta: 0 }];
    const props = buildProps({ selectedModifiers });
    const { result } = renderHook(() => useFnbProductDetailActions(props));
    act(() => result.current.addDetailToCart());
    expect(props.addToCart).toHaveBeenCalledWith(props.item, expect.objectContaining({
      quantity: 1,
      line_modifiers: selectedModifiers
    }));
  });

  it('includes modifier quantity in the displayed total and cart payload', () => {
    const selectedModifiers = [{ modifier_group_id: 1, modifier_option_id: 2, option_name: 'Extra rice', price_delta: 15, quantity: 3 }];
    const props = buildProps({ selectedModifiers, quantity: 2 });
    const { result } = renderHook(() => useFnbProductDetailActions(props));
    expect(result.current.detailTotalPrice).toBe(290);
    act(() => result.current.addDetailToCart());
    expect(props.addToCart).toHaveBeenCalledWith(props.item, expect.objectContaining({ line_modifiers: selectedModifiers }));
  });
});
