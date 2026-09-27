import { describe, expect, it } from 'vitest';
import { branchScheduleToIso, getBranchWallDate } from './storefrontScheduleTimezone.js';

describe('branch schedule timezone', () => {
  it('uses the branch wall clock even when the browser clock is elsewhere', () => {
    const hours = { timezone: 'Asia/Manila' };
    expect(getBranchWallDate(new Date('2026-09-25T17:00:00.000Z'), hours.timezone).getDate()).toBe(26);
    expect(branchScheduleToIso('2026-09-26T10:15', hours)).toBe('2026-09-26T02:15:00.000Z');
  });
});
