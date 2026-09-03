import { describe, expect, it } from 'vitest';

import { formatServiceMoney, formatServiceNumber } from './servicesFormatters.js';

describe('service storefront formatters', () => {
  it('groups thousands in service prices while keeping two decimals', () => {
    expect(formatServiceMoney(1000)).toBe('PHP 1,000.00');
    expect(formatServiceMoney(1234567.8)).toBe('PHP 1,234,567.80');
  });

  it('groups service counts without changing their integer meaning', () => {
    expect(formatServiceNumber(1000)).toBe('1,000');
    expect(formatServiceNumber(1234567)).toBe('1,234,567');
  });
});
