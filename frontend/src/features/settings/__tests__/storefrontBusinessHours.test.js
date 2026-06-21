import { describe, expect, it } from 'vitest';
import {
  applyStorefrontBusinessHoursRange,
  addStorefrontBusinessHoursInterval,
  createDefaultStorefrontBusinessHours,
  formatStorefrontBusinessHoursDisplay,
  getStorefrontBusinessHoursDayIssues,
  isStorefrontBusinessHoursAlwaysOpen,
  normalizeStorefrontBusinessHours,
  updateStorefrontBusinessHoursInterval,
  setStorefrontBusinessHoursOpenAllDay
} from '../storefrontBusinessHours.js';

describe('storefront business hours helpers', () => {
  it('sets every day to the existing 24-hour convention', () => {
    const hours = setStorefrontBusinessHoursOpenAllDay(createDefaultStorefrontBusinessHours(), true);

    expect(isStorefrontBusinessHoursAlwaysOpen(hours)).toBe(true);
    expect(Object.values(hours.weekly)).toEqual(expect.arrayContaining([
      { enabled: true, open: '00:00', close: '00:00', intervals: [{ open: '00:00', close: '00:00' }] }
    ]));
    expect(Object.values(hours.weekly).every((day) => day.enabled && day.open === '00:00' && day.close === '00:00')).toBe(true);
  });

  it('applies a selected range only to selected days', () => {
    const hours = applyStorefrontBusinessHoursRange(createDefaultStorefrontBusinessHours(), {
      open: '09:00',
      close: '17:00',
      dayKeys: ['mon', 'wed']
    });

    expect(hours.weekly.mon).toEqual({ enabled: true, open: '09:00', close: '17:00', intervals: [{ open: '09:00', close: '17:00' }] });
    expect(hours.weekly.wed).toEqual({ enabled: true, open: '09:00', close: '17:00', intervals: [{ open: '09:00', close: '17:00' }] });
    expect(hours.weekly.tue).toEqual({ enabled: true, open: '09:00', close: '18:00', intervals: [{ open: '09:00', close: '18:00' }] });
  });

  it('falls back invalid apply times to safe defaults', () => {
    const hours = applyStorefrontBusinessHoursRange(createDefaultStorefrontBusinessHours(), {
      open: 'bad',
      close: '99:99',
      dayKeys: ['fri']
    });

    expect(hours.weekly.fri).toEqual({ enabled: true, open: '09:00', close: '17:00', intervals: [{ open: '09:00', close: '17:00' }] });
  });

  it('formats all-day and closed schedules for display', () => {
    const allDay = setStorefrontBusinessHoursOpenAllDay(createDefaultStorefrontBusinessHours(), true);
    const closed = setStorefrontBusinessHoursOpenAllDay(createDefaultStorefrontBusinessHours(), false);

    expect(formatStorefrontBusinessHoursDisplay(allDay)).toContain('24 hours');
    expect(formatStorefrontBusinessHoursDisplay(closed)).toBe('Closed');
  });

  it('normalizes legacy display strings into the weekly schema', () => {
    const normalized = normalizeStorefrontBusinessHours('9:00 AM - 5:00 PM Mon, Tue');

    expect(normalized.weekly.mon).toEqual({ enabled: true, open: '09:00', close: '17:00', intervals: [{ open: '09:00', close: '17:00' }] });
    expect(normalized.weekly.tue).toEqual({ enabled: true, open: '09:00', close: '17:00', intervals: [{ open: '09:00', close: '17:00' }] });
    expect(normalized.weekly.wed.enabled).toBe(false);
  });

  it('supports multiple intervals in one day and detects overlap', () => {
    let hours = addStorefrontBusinessHoursInterval(createDefaultStorefrontBusinessHours(), 'mon');
    hours = updateStorefrontBusinessHoursInterval(hours, 'mon', 0, { open: '06:00', close: '12:00' });
    hours = updateStorefrontBusinessHoursInterval(hours, 'mon', 1, { open: '13:00', close: '20:00' });

    expect(hours.weekly.mon.intervals).toEqual([
      { open: '06:00', close: '12:00' },
      { open: '13:00', close: '20:00' }
    ]);
    expect(formatStorefrontBusinessHoursDisplay(hours)).toContain('Mon 6:00 AM - 12:00 PM, 1:00 PM - 8:00 PM');
    expect(getStorefrontBusinessHoursDayIssues(hours.weekly.mon)).toEqual([]);

    const overlapping = updateStorefrontBusinessHoursInterval(hours, 'mon', 1, { open: '11:00', close: '20:00' });
    expect(getStorefrontBusinessHoursDayIssues(overlapping.weekly.mon)).toEqual(['Time intervals cannot overlap.']);
  });
});
