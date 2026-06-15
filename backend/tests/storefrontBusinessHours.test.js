import {
  formatStorefrontBusinessHoursDisplay,
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
      mon: { enabled: true, open: '00:00', close: '00:00' }
    });

    expect(isDateWithinStorefrontBusinessHours(new Date('2026-06-01T15:30:00+08:00'), schedule)).toBe(true);
    expect(formatStorefrontBusinessHoursDisplay(schedule)).toContain('Mon 24 hours');
  });

  it('closes disabled structured days and respects configured timezone', () => {
    const schedule = weeklyHours({
      mon: { enabled: false, open: '09:00', close: '18:00' }
    });

    expect(isDateWithinStorefrontBusinessHours(new Date('2026-06-01T10:00:00+08:00'), schedule)).toBe(false);
  });
});
