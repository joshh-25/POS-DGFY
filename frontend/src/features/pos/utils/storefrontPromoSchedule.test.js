import { describe, expect, it } from 'vitest';
import { getStorefrontPromoScheduleValidationError } from './storefrontPromoSchedule.js';

describe('Storefront promo schedule validation', () => {
  it('accepts the valid date and 24-hour time window shown in POS settings', () => {
    expect(getStorefrontPromoScheduleValidationError({
      valid_from: '2026-07-13',
      valid_time_start: '13:24',
      valid_until: '2026-07-13',
      valid_time_end: '17:24'
    })).toBe('');
  });

  it('keeps date ranges optional independently from time ranges, matching the API contract', () => {
    expect(getStorefrontPromoScheduleValidationError({
      valid_from: '2026-07-13',
      valid_until: '2026-07-20'
    })).toBe('');
    expect(getStorefrontPromoScheduleValidationError({
      valid_time_start: '10:00',
      valid_time_end: '14:00'
    })).toBe('');
  });

  it('rejects incomplete date or time ranges with an actionable message', () => {
    expect(getStorefrontPromoScheduleValidationError({ valid_from: '2026-07-13' }))
      .toBe('Promo validity range requires both From and To dates.');
    expect(getStorefrontPromoScheduleValidationError({ valid_time_start: '10:00' }))
      .toBe('Promo valid time range requires both start and end times.');
  });
});
