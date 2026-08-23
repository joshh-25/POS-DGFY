import { describe, expect, it } from 'vitest';
import { formatModifierPriceDelta } from './ProductModifierGroups.jsx';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

describe('formatModifierPriceDelta', () => {
  it('renders positive, negative, and zero deltas without malformed signs', () => {
    expect(formatModifierPriceDelta(20, money)).toBe('+20.00');
    expect(formatModifierPriceDelta(-145, money)).toBe('-145.00');
    expect(formatModifierPriceDelta(0, money)).toBe('0.00');
  });
});
