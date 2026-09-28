import { formatReportDate, formatReportDateTime, REPORT_TIME_ZONE } from '../src/modules/shared/utils/reportTimezone.js';

describe('report timezone formatting', () => {
    it('formats exported datetimes in Asia/Manila with an explicit timezone label', () => {
        expect(REPORT_TIME_ZONE).toBe('Asia/Manila');
        expect(formatReportDateTime('2026-09-01T08:00:00.000Z'))
            .toBe('2026-09-01 16:00:00 (Asia/Manila)');
        expect(formatReportDate('2026-08-31T16:00:00.000Z')).toBe('2026-09-01');
    });

    it('preserves empty and invalid values without throwing', () => {
        expect(formatReportDateTime('')).toBe('');
        expect(formatReportDateTime('not-a-date')).toBe('not-a-date');
        expect(formatReportDate('not-a-date')).toBe('not-a-date');
    });
});
