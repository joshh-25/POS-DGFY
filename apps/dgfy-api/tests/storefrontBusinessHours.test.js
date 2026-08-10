import {
  formatStorefrontBusinessHoursDisplay,
  normalizeStorefrontBusinessHours,
  isDateWithinStorefrontBusinessHours,
  getZonedDayStart
} from '../src/modules/shared/utils/storefrontBusinessHours.js';

const weeklyHours = (weekly) => ({
  mode: 'weekly',
  timezone: 'Asia/Manila',
  weekly: {
    sun: { enabled: false, open: '09:00', close: '18:00' },
    mon: { enabled: true, open: '09:00', close: '18:00' },
    tue: { enabled: true, open: '09:00', close: '18:00' },
    wed: { enabled: true, open: '09:00', close: '18:00' },
    thu: { enabled: true, open: '09:00', close: '18:00' },
    fri: { enabled: true, open: '09:00', close: '18:00' },
    sat: { enabled: true, open: '09:00', close: '18:00' },
    ...weekly
  }
});

describe('storefront business hours utility', () => {
  it('treats equal structured open and close times as 24 hours', () => {
    const schedule = weeklyHours({
      mon: { enabled: true, open: '00:00', close: '00:00', intervals: [{ open: '00:00', close: '00:00' }] }
    });

    expect(isDateWithinStorefrontBusinessHours(new Date('2026-06-01T15:30:00+08:00'), schedule)).toBe(true);
    expect(formatStorefrontBusinessHoursDisplay(schedule)).toContain('Mon 24 hours');
  });

  it('closes disabled structured days and respects configured timezone', () => {
    const schedule = weeklyHours({
      mon: { enabled: false, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] }
    });

    expect(isDateWithinStorefrontBusinessHours(new Date('2026-06-01T10:00:00+08:00'), schedule)).toBe(false);
  });

  it('accepts split same-day intervals and rejects the gap between them', () => {
    const schedule = weeklyHours({
      mon: {
        enabled: true,
        open: '06:00',
        close: '12:00',
        intervals: [
          { open: '06:00', close: '12:00' },
          { open: '13:00', close: '20:00' }
        ]
      }
    });

    expect(isDateWithinStorefrontBusinessHours(new Date('2026-06-01T07:30:00+08:00'), schedule)).toBe(true);
    expect(isDateWithinStorefrontBusinessHours(new Date('2026-06-01T12:30:00+08:00'), schedule)).toBe(false);
    expect(isDateWithinStorefrontBusinessHours(new Date('2026-06-01T19:30:00+08:00'), schedule)).toBe(true);
    expect(formatStorefrontBusinessHoursDisplay(schedule)).toContain('Mon 6:00 AM - 12:00 PM, 1:00 PM - 8:00 PM');
  });

  it('normalizes long structured display text to compact storage length', () => {
    const schedule = weeklyHours({
      mon: {
        enabled: true,
        open: '06:00',
        close: '22:00',
        intervals: [
          { open: '06:00', close: '10:00' },
          { open: '11:00', close: '15:00' },
          { open: '16:00', close: '22:00' }
        ]
      }
    });
    const normalized = normalizeStorefrontBusinessHours({
      ...schedule,
      display: Array.from({ length: 8 }, (_, index) => `Segment ${index + 1} 6:00 AM - 10:00 PM`).join('; ')
    });

    expect(normalized.display.length).toBeLessThanOrEqual(120);
  });

  it('getZonedDayStart returns the UTC instant for local midnight in the given timezone', () => {
    // Jan 1 20:00 UTC is already Jan 2 04:00 in Manila (UTC+8) -- the zoned
    // day start must roll to Jan 2 00:00 Manila (= Jan 1 16:00 UTC), not stay
    // on the UTC calendar day.
    expect(getZonedDayStart(new Date('2026-01-01T20:00:00Z'), 'Asia/Manila').toISOString())
      .toBe('2026-01-01T16:00:00.000Z');
    // Jan 1 05:00 UTC is still Jan 1 13:00 in Manila -- day start stays on Jan 1.
    expect(getZonedDayStart(new Date('2026-01-01T05:00:00Z'), 'Asia/Manila').toISOString())
      .toBe('2025-12-31T16:00:00.000Z');
  });

  it('getZonedDayStart defaults to Asia/Manila when no timezone is given', () => {
    expect(getZonedDayStart(new Date('2026-01-01T05:00:00Z'), null).toISOString())
      .toBe(getZonedDayStart(new Date('2026-01-01T05:00:00Z'), 'Asia/Manila').toISOString());
  });

  it('getZonedDayStart computes local midnight for a distinct timezone (no DST in January)', () => {
    // Jan 1 05:00 UTC is Jan 1 00:00 in America/New_York (UTC-5 in January).
    expect(getZonedDayStart(new Date('2026-01-01T05:00:00Z'), 'America/New_York').toISOString())
      .toBe('2026-01-01T05:00:00.000Z');
  });
});
