import { describe, expect, it } from 'vitest';
import { formatPeso } from '../numberUtils.js';

describe('formatPeso', () => {
  it('formats values with peso symbol and fixed decimals', () => {
    expect(formatPeso(10)).toBe('₱10.00');
    expect(formatPeso('9.5')).toBe('₱9.50');
    expect(formatPeso(null)).toBe('₱0.00');
  });

  it('supports legacy numeric decimals argument', () => {
    expect(formatPeso(12.3456, 3)).toBe('₱12.346');
  });

  it('supports grouping option', () => {
    expect(formatPeso(12345.6, { useGrouping: true })).toBe('₱12,345.60');
  });
});

