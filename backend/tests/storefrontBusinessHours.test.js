import {
  formatStorefrontBusinessHoursDisplay,
  normalizeStorefrontBusinessHours,
  isDateWithinStorefrontBusinessHours
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
});
