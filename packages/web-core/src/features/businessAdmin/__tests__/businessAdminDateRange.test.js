import { describe, expect, it } from 'vitest';
import {
    DATE_RANGE_PRESETS,
    formatDateRangeLabel,
    getDateRangeForPreset,
    getDefaultDateRangeForSection,
    getDefaultDateRangePreset,
    isHistoricalBusinessAdminSection,
    shiftDateOnly
} from '../businessAdminDateRange.js';

describe('Business Admin historical date-range model', () => {
    it('uses a bounded 30-day default only for historical data sections', () => {
        expect(getDefaultDateRangePreset('orders')).toBe('last_30_days');
        expect(getDefaultDateRangePreset('shifts')).toBe('last_30_days');
        expect(getDefaultDateRangePreset('expenses')).toBe('last_30_days');
        expect(getDefaultDateRangePreset('audit')).toBe('last_30_days');
        expect(getDefaultDateRangePreset('overview')).toBe('today');
        expect(getDefaultDateRangeForSection('orders', '2026-09-16')).toEqual({
            dateFrom: '2026-08-18',
            dateTo: '2026-09-16'
        });
        expect(isHistoricalBusinessAdminSection('attendance')).toBe(false);
    });

    it('calculates calendar-day presets without local timezone drift', () => {
        expect(shiftDateOnly('2026-03-01', -1)).toBe('2026-02-28');
        expect(getDateRangeForPreset('last_7_days', '2026-09-16')).toEqual({
            dateFrom: '2026-09-10',
            dateTo: '2026-09-16'
        });
        expect(getDateRangeForPreset('last_30_days', '2026-09-16')).toEqual({
            dateFrom: '2026-08-18',
            dateTo: '2026-09-16'
        });
    });

    it('keeps the preset contract and produces an explicit range label', () => {
        expect(DATE_RANGE_PRESETS.map((preset) => preset.value)).toEqual([
            'today', 'last_7_days', 'last_30_days', 'custom'
        ]);
        expect(formatDateRangeLabel('2026-09-16', '2026-09-16')).toBe('2026-09-16');
        expect(formatDateRangeLabel('2026-08-18', '2026-09-16')).toBe('2026-08-18 – 2026-09-16');
    });
});
