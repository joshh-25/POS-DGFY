import { describe, expect, it } from 'vitest';
import { getItemPriceLimitError, MAX_ITEM_PRICE } from '../itemPriceLimits.js';

describe('item price limits', () => {
  it('accepts the inclusive persisted maximum', () => {
    expect(MAX_ITEM_PRICE).toBe(999999.9999);
    expect(getItemPriceLimitError({ price: MAX_ITEM_PRICE, cost: 0 })).toBeNull();
  });

  it('rejects a selling price above the persisted maximum with an actionable message', () => {
    expect(getItemPriceLimitError({ price: MAX_ITEM_PRICE + 0.0001, cost: 0 }))
      .toBe('Selling price must not exceed ₱999,999.9999.');
    expect(getItemPriceLimitError({ price: 1000000, cost: 0 }))
      .toBe('Selling price must not exceed ₱999,999.9999.');
  });

  it('rejects a cost above the persisted maximum', () => {
    expect(getItemPriceLimitError({ price: 100, cost: 1000000 }))
      .toBe('Cost per unit must not exceed ₱999,999.9999.');
  });

  it('leaves empty and non-numeric values to the existing required-field checks', () => {
    expect(getItemPriceLimitError({ price: '', cost: '' })).toBeNull();
    expect(getItemPriceLimitError({ price: Number.NaN, cost: Number.NaN })).toBeNull();
  });
});
