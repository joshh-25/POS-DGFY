import { describe, expect, it } from 'vitest';
import { money } from './storefrontFormatters.js';

describe('storefront money formatter', () => {
  it('groups thousands while retaining two decimal places', () => {
    expect(money(45)).toBe('₱45.00');
    expect(money(144699610)).toBe('₱144,699,610.00');
  });

  it('uses a safe zero display for invalid values', () => {
    expect(money('not-a-number')).toBe('₱0.00');
  });
});
