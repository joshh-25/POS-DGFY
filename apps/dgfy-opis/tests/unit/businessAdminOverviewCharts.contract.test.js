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

describe('Business Admin overview chart contract', () => {
  it('renders chart-focused overview panels for the dashboard datasets', () => {
    expect(businessAdminPage).toContain("from 'recharts'");
    expect(businessAdminPage).toContain('data-testid="business-admin-overview-sales-chart"');
    expect(businessAdminPage).toContain('data-testid="business-admin-overview-branch-chart"');
    expect(businessAdminPage).toContain('data-testid="business-admin-overview-payment-chart"');
    expect(businessAdminPage).toContain('data-testid="business-admin-overview-register-chart"');
    expect(businessAdminPage).toContain('data-testid="business-admin-overview-orders-chart"');
    expect(businessAdminPage).toContain('AreaChart data={salesTrend}');
    expect(businessAdminPage).toContain('stopColor="#2563eb"');
    expect(businessAdminPage).toContain("color: '#2563eb'");
    expect(businessAdminPage).toContain('aria-label="Sales chart metric"');
    expect(businessAdminPage).toContain("{ key: 'gross_sales', label: 'Gross Sales'");
    expect(businessAdminPage).toContain("{ key: 'gross_profit', label: 'Gross Profit'");
    expect(businessAdminPage).toContain('<option value="all">All</option>');
    expect(businessAdminPage).toContain('salesChartSeries.map');
    expect(businessAdminPage).toContain('const salesXAxisInterval = salesTrend.length > 12 ? Math.ceil(salesTrend.length / 8) - 1 : 0;');
    expect(businessAdminPage).toContain('const isSingleDate = Boolean(data?.filters?.date_from && data?.filters?.date_from === data?.filters?.date_to);');
    expect(businessAdminPage).toContain('const periodKeys = isSingleDate ? buildOverviewHourKeys(data.filters.date_from) : dateKeys;');
    expect(businessAdminPage).toContain('{salesMetric === \'all\' ? <Legend /> : null}');
    expect(businessAdminPage).not.toContain('Area · Days');
    expect(businessAdminPage).not.toContain('Daily completed sales for the selected date range');
    expect(businessAdminPage).toContain('BarChart data={branchSales}');
    expect(businessAdminPage).toContain('BarChart data={paymentMix}');
    expect(businessAdminPage).not.toContain('title="Operational notifications"');
    expect(businessAdminPage).not.toContain('data-testid="business-admin-overview-notifications"');
  });

  it('keeps chart cards responsive and preserves dedicated detail links', () => {
    expect(businessAdminPage).toContain('Manage locations');
    expect(businessAdminPage).toContain('View registers');
    expect(businessAdminPage).toContain('View orders');
    expect(businessAdminCss).toContain('.business-admin-overview-chart-grid');
    expect(businessAdminCss).toContain('.business-admin-overview-chart-plot');
    expect(businessAdminCss).toContain('.business-admin-overview-chart-grid { grid-template-columns: minmax(0, 1fr); }');
    expect(businessAdminCss).toContain('.business-admin-overview-sales-card { grid-column: auto; }');
  });

  it('fills the selected date range while keeping the API trend as the source of values', () => {
    expect(businessAdminPage).toContain('buildOverviewDateKeys(data?.filters?.date_from, data?.filters?.date_to)');
    expect(businessAdminPage).toContain('Array.isArray(data?.sales_trend)');
    expect(businessAdminPage).toContain('gross_sales: Number(trendByDate.get(period)?.gross_sales) || 0');
  });

  it('uses the scoped financial trend for the overview KPI cards', () => {
    const overviewStart = businessAdminPage.indexOf('function OverviewWorkspace');
    const overviewEnd = businessAdminPage.indexOf('const BranchSummaryMetric', overviewStart);
    const overviewSource = businessAdminPage.slice(overviewStart, overviewEnd);

    expect(overviewSource).toContain('vat: Number(trendByDate.get(period)?.vat) || 0');
    expect(overviewSource).toContain('const overviewFinancialTotals = salesTrend.reduce');
    expect(overviewSource).toContain('gross_sales: totals.gross_sales + row.gross_sales');
    expect(overviewSource).toContain('refunds: totals.refunds + row.refunds');
    expect(overviewSource).toContain('discounts: totals.discounts + row.discounts');
    expect(overviewSource).toContain('net_sales: totals.net_sales + row.net_sales');
    expect(overviewSource).toContain('gross_profit: totals.gross_profit + row.gross_profit');
    expect(overviewSource).toContain('vat: totals.vat + row.vat');
    expect(overviewSource).toContain('<Metric label="Gross sales"');
    expect(overviewSource).toContain('<Metric label="Refunds"');
    expect(overviewSource).toContain('<Metric label="Discounts"');
    expect(overviewSource).toContain('<Metric label="Net sales"');
    expect(overviewSource).toContain('<Metric label="Gross profit"');
    expect(overviewSource).toContain('<Metric label="VAT"');
    expect(overviewSource).not.toContain('<Metric label="Active branches"');
    expect(overviewSource).not.toContain('<Metric label="Cash difference"');
    expect(businessAdminCss).toContain('grid-template-columns: repeat(6, minmax(0, 1fr));');
  });
});
