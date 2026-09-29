import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../../../');
const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Back Office sales and stock report presentation contract', () => {
  const reportsPage = readRepoFile('packages/web-core/src/features/merchantBackOffice/pages/ReportsPage.jsx');
  const reportPanel = readRepoFile('packages/web-core/src/features/merchantBackOffice/components/SalesStockReportPanel.jsx');
  const reportApi = readRepoFile('packages/web-core/src/features/merchantBackOffice/api/businessAdminReportsApi.js');

  it('exposes a clear sales and stock tab beside the existing report views', () => {
    expect(reportsPage).toContain("'sales-stock': 'Sales & stock'");
    expect(reportsPage).toContain('value="sales-stock"');
    expect(reportsPage).toContain('<SalesStockReportPanel dateFilters={dateFilters} />');
  });

  it('keeps the panel read-only and makes the two answers visible without opening a detail view', () => {
    expect(reportPanel).toContain('Sales &amp; stock');
    expect(reportPanel).toContain('>Sold<');
    expect(reportPanel).toContain('>Stock left<');
    expect(reportPanel).toContain('>Status<');
    expect(reportPanel).toContain("const REPORT_KEY = 'sales_and_stock_by_item';");
    expect(reportPanel).toContain('Export CSV');
  });

  it('uses the protected Business Admin dataset and export endpoints', () => {
    expect(reportApi).toContain('/business-admin/reports/datasets/');
    expect(reportApi).toContain("responseType: 'blob'");
    expect(reportPanel).toContain('date_from: dateFilters.startDate || undefined');
    expect(reportPanel).toContain('branch_id: dateFilters.location_id || undefined');
  });

  it('keeps report investigation handoffs exact and preserves the report scope', () => {
    expect(reportPanel).toContain('sort_by: sortBy');
    expect(reportPanel).toContain('sort_direction: sortDirection');
    expect(reportPanel).toContain('item_id: row.item_id');
    expect(reportPanel).toContain('Analyze sales');
    expect(reportPanel).toContain('Open orders');
    expect(reportPanel).toContain('Page {currentPage} of {totalPages}');
    expect(reportPanel).not.toContain('search: row.item_name');
  });

  it('documents the summary-to-investigation handoff in Reports', () => {
    expect(reportsPage).toContain('Investigation handoff');
    expect(reportsPage).toContain('Sales timeline');
    expect(reportsPage).toContain('Order center');
    expect(reportsPage).toContain('Employee-focused summaries');
  });
});
