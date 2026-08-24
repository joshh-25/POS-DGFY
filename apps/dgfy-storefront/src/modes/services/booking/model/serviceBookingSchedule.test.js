import { describe, expect, it } from 'vitest';
import {
  buildServiceCalendarDateOptions,
  buildServiceDateOptions,
  buildServiceTimeSlotOptions,
  formatServiceAppointmentSummary,
  getDatePartFromAppointment,
  getPreferredBookingTimeForDate
} from './serviceBookingSchedule.js';

const storefrontHours = {
  timezone: 'Asia/Manila',
  weekly: {
    sun: { enabled: false, intervals: [] },
    mon: { enabled: true, intervals: [{ open: '09:00', close: '18:00' }] },
    tue: { enabled: true, intervals: [{ open: '09:00', close: '18:00' }] },
    wed: { enabled: true, intervals: [{ open: '09:00', close: '18:00' }] },
    thu: { enabled: true, intervals: [{ open: '09:00', close: '18:00' }] },
    fri: { enabled: true, intervals: [{ open: '09:00', close: '18:00' }] },
    sat: { enabled: true, intervals: [{ open: '09:00', close: '18:00' }] }
  }
};

const service = {
  service_detail: {
    duration_minutes: 120,
    lead_time_minutes: 0
  }
};

const scheduleOptions = (now) => ({ storefrontHours, now: new Date(now) });

describe('Services handoff schedule resolver', () => {
  it('keeps future slots before opening and excludes slots that cannot finish before close', () => {
    const slots = buildServiceTimeSlotOptions(service, '2026-08-10', scheduleOptions('2026-08-10T00:30:00Z'));

    expect(slots.map((slot) => slot.value)).toEqual(['09:00', '11:00', '13:00', '15:00']);
  });

  it('removes passed same-day slots and recommends the next future slot', () => {
    const options = scheduleOptions('2026-08-10T04:30:00Z');
    const slots = buildServiceTimeSlotOptions(service, '2026-08-10', options);
    const dates = buildServiceDateOptions(service, 2, options);

    expect(slots.map((slot) => slot.value)).toEqual(['13:00', '15:00']);
    expect(dates[0]).toEqual(expect.objectContaining({
      value: '2026-08-10',
      recommended: true,
      recommendedTime: '13:00'
    }));
    expect(getPreferredBookingTimeForDate(service, '2026-08-10', '09:00', options)).toBe('13:00');
  });

  it('moves the recommendation to the next open future day after today is exhausted', () => {
    const options = scheduleOptions('2026-08-10T11:30:00Z');
    const dates = buildServiceDateOptions(service, 2, options);

    expect(dates[0]).toEqual(expect.objectContaining({
      value: '2026-08-11',
      recommended: true,
      recommendedTime: '09:00'
    }));
    expect(dates.some((date) => date.value === '2026-08-10')).toBe(false);
  });

  it('intersects service availability with store opening and closing intervals', () => {
    const serviceWithNarrowAvailability = {
      service_detail: {
        duration_minutes: 120,
        weekly_availability: {
          mon: [{ start: '10:00', end: '16:00' }]
        }
      }
    };
    const restrictedHours = {
      ...storefrontHours,
      weekly: {
        ...storefrontHours.weekly,
        mon: { enabled: true, intervals: [{ open: '09:00', close: '12:00' }] }
      }
    };

    expect(buildServiceTimeSlotOptions(serviceWithNarrowAvailability, '2026-08-10', {
      storefrontHours: restrictedHours,
      now: new Date('2026-08-09T16:00:00Z')
    }).map((slot) => slot.value)).toEqual(['10:00']);
  });

  it('returns no recommendation when the store has no future open interval', () => {
    const closedHours = {
      timezone: 'Asia/Manila',
      weekly: Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
        .map((day) => [day, { enabled: false, intervals: [] }]))
    };

    expect(buildServiceDateOptions(service, 7, {
      storefrontHours: closedHours,
      now: new Date('2026-08-10T04:30:00Z')
    })).toEqual([]);
    expect(buildServiceTimeSlotOptions(service, '2026-08-10', {
      storefrontHours: closedHours,
      now: new Date('2026-08-10T04:30:00Z')
    })).toEqual([]);
  });

  it('returns every future calendar date while keeping slot availability explicit', () => {
    const options = {
      storefrontHours,
      now: new Date('2026-08-09T04:30:00Z'),
      maxLookaheadDays: 3
    };
    const dates = buildServiceCalendarDateOptions(service, options);

    expect(dates.map((date) => date.value)).toEqual(['2026-08-09', '2026-08-10', '2026-08-11']);
    expect(dates[0]).toEqual(expect.objectContaining({ hasAvailability: false, recommended: false }));
    expect(dates[1]).toEqual(expect.objectContaining({ hasAvailability: true, recommended: true }));
  });

  it('preserves a date-only draft until the user chooses a valid time', () => {
    expect(getDatePartFromAppointment('2026-08-16')).toBe('2026-08-16');
    expect(formatServiceAppointmentSummary('2026-08-16')).toBe('Schedule needed');
  });
});
