import { describe, expect, it } from 'vitest';
import { formatRunPickerOptionLabel } from '../deliveryRunLabels.js';

describe('delivery run picker labels', () => {
  it('shows a single schedule date', () => {
    expect(formatRunPickerOptionLabel({ label: 'Aklan Route', scheduled_date: '2026-10-28' }))
      .toBe('Aklan Route · Oct 28');
  });

  it('shows a same-month date range without repeating the month', () => {
    expect(formatRunPickerOptionLabel({
      label: 'Aklan Route', scheduled_date: '2026-10-28', scheduled_date_end: '2026-10-30'
    })).toBe('Aklan Route · Oct 28–30');
  });

  it('shows a distinct month for a cross-month range and a missing-date fallback', () => {
    expect(formatRunPickerOptionLabel({
      label: 'Aklan Route', scheduled_date: '2026-10-30T00:00:00Z', scheduled_date_end: '2026-11-02T00:00:00Z'
    })).toBe('Aklan Route · Oct 30–Nov 2');
    expect(formatRunPickerOptionLabel({ label: 'Aklan Route' })).toBe('Aklan Route · No date');
  });
});
