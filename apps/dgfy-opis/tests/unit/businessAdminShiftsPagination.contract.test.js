import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const businessAdminPage = fs.readFileSync(
    path.resolve(__dirname, '../../src/features/businessAdmin/BusinessAdminPage.jsx'),
    'utf8'
);
const businessAdminCss = fs.readFileSync(
    path.resolve(__dirname, '../../src/features/businessAdmin/businessAdmin.css'),
    'utf8'
);

describe('Business Admin Shifts & cash pagination contract', () => {
    it('keeps the shift summary metrics and uses the cash table as shift history', () => {
        expect(businessAdminPage).toContain('aria-label="Shift summary"');
        expect(businessAdminPage).toContain('title="Shift history"');
        expect(businessAdminPage).toContain('<th>Cashier</th>');
        expect(businessAdminPage).toContain('{row.cashier_name || \'—\'}');
        expect(businessAdminPage).not.toContain('className="business-admin-shifts-section-card"');
        expect(businessAdminPage).not.toContain('<ShiftsPagination');
    });

    it('loads the closed-shift cash summary with the reference table contract', () => {
        expect(businessAdminPage).toContain('const BUSINESS_ADMIN_CASH_SUMMARY_PAGE_SIZE = 10;');
        expect(businessAdminPage).toContain("status: 'closed'");
        expect(businessAdminPage).toContain('cashSummaryPagination');
        expect(businessAdminPage).toContain('aria-label="Shift history pagination"');
        expect(businessAdminPage).toContain('No data to display');
        expect(businessAdminPage).toContain('There are no closed shifts in the selected time period');
        expect(businessAdminPage).toContain('<th>Expected cash amount</th>');
        expect(businessAdminPage).toContain('<th>Actual cash amount</th>');
        expect(businessAdminPage).toContain('<th>Difference</th>');
        expect(businessAdminCss).toContain('.business-admin-cash-summary-table');
        expect(businessAdminCss).toContain('business-admin-cash-summary-table td:nth-child(7)');
        expect(businessAdminCss).toContain('width: 14.33%; text-align: right;');
        expect(businessAdminCss).toContain('white-space: nowrap;');
        expect(businessAdminCss).toContain('.business-admin-cash-summary-empty');
    });

    it('exports every filtered closed-shift cash-summary row as CSV', () => {
        expect(businessAdminPage).toContain("aria-label=\"Export shift history as CSV\"");
        expect(businessAdminPage).toContain("{exportingCashSummary ? 'Exporting…' : 'Export CSV'}");
        expect(businessAdminPage).toContain('const BUSINESS_ADMIN_CASH_SUMMARY_EXPORT_PAGE_SIZE = 100;');
        expect(businessAdminPage).toContain("status: 'closed'");
        expect(businessAdminPage).toContain('buildCashSummaryCsv(rows)');
        expect(businessAdminPage).toContain('downloadCsv(`shift-history-${dateFromPart}-${dateToPart}.csv`');
    });

});
