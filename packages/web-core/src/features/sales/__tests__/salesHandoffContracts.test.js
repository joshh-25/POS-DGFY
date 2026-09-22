import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const salesPagePath = path.resolve(__dirname, '../pages/SalesPage.jsx');
const salesDateRangePickerPath = path.resolve(__dirname, '../components/SalesDateRangePicker.jsx');

describe('sales handoff and export UX contracts', () => {
  let salesPageContent = '';
  let salesDateRangePickerContent = '';

  beforeAll(() => {
    salesPageContent = fs.readFileSync(salesPagePath, 'utf8');
    salesDateRangePickerContent = fs.readFileSync(salesDateRangePickerPath, 'utf8');
  });

  it('hydrates and persists filters from query params including source_id handoff', () => {
    expect(salesPageContent).toContain('setSourceId(params.get(\'source_id\') || \'\');');
    expect(salesPageContent).toContain('setPosOrderSource(params.get(\'pos_order_source\') || \'all\');');
    expect(salesPageContent).toContain('if (sourceId) params.set(\'source_id\', sourceId);');
    expect(salesPageContent).toContain('if (posOrderSource !== \'all\') params.set(\'pos_order_source\', posOrderSource);');
    expect(salesPageContent).toContain('source_id: sourceId || undefined');
    expect(salesPageContent).toContain('pos_order_source: posOrderSource === \'all\' ? undefined : posOrderSource');
  });

  it('includes export precheck dialog and post-export confirmation metadata', () => {
    expect(salesPageContent).toContain('setShowExportPrecheck(true);');
    expect(salesPageContent).toContain('<Dialog open={showExportPrecheck}');
    expect(salesPageContent).toContain('setLastExportMeta({');
    expect(salesPageContent).toContain('Export complete:');
  });

  it('uses one source dropdown beside the export action and removes redundant activity labels', () => {
    expect(salesPageContent).toContain('aria-label="Sales source"');
    expect(salesPageContent).toContain('<option value="ALL">All sources</option>');
    expect(salesPageContent).toContain('<option value="POS">POS</option>');
    expect(salesPageContent).toContain('<option value="DISPATCH">Dispatch</option>');
    expect(salesPageContent).not.toContain('Transaction activity');
    expect(salesPageContent).not.toContain('<div role="group" aria-label="Sales source">');
    expect(salesPageContent).not.toContain('showAdvancedFilters');
    expect(salesPageContent).not.toContain('sales-advanced-filters');
    expect(salesPageContent).not.toContain('Filter by payment');
    expect(salesPageContent).not.toContain('aria-label="Clear sales filters"');
  });

  it('uses the single date-range picker while preserving the existing date filter state', () => {
    expect(salesPageContent).toContain("import SalesDateRangePicker from '../components/SalesDateRangePicker.jsx';");
    expect(salesPageContent).toContain('<SalesDateRangePicker');
    expect(salesPageContent).toContain('dateFrom={dateFrom}');
    expect(salesPageContent).toContain('dateTo={dateTo}');
    expect(salesPageContent).toContain('setDateFrom(nextDateFrom);');
    expect(salesPageContent).toContain('setDateTo(nextDateTo);');
    expect(salesPageContent).not.toContain('aria-label="Sales date from"');
    expect(salesPageContent).not.toContain('aria-label="Sales date to"');
    expect(salesDateRangePickerContent).toContain('aria-label="Select sales date range"');
    expect(salesDateRangePickerContent).toContain('Last 30 days');
    expect(salesDateRangePickerContent).toContain('Start date');
    expect(salesDateRangePickerContent).toContain('End date');
  });

  it('shows VAT instead of Party and removes Status from the transaction list', () => {
    expect(salesPageContent).toContain('<th scope="col" className="px-3 py-3 text-right">VAT</th>');
    expect(salesPageContent).not.toContain('<th scope="col" className="px-3 py-3 text-left">Party</th>');
    expect(salesPageContent).not.toContain('<th scope="col" className="px-3 py-3 text-left">Status</th>');
    expect(salesPageContent).toContain('<td colSpan={8}');
  });

  it('exposes the requested financial totals in the At a glance cards', () => {
    expect(salesPageContent).toContain('<SummaryMetric label="Gross sales"');
    expect(salesPageContent).toContain('<SummaryMetric label="Discount"');
    expect(salesPageContent).toContain('<SummaryMetric label="VAT sales"');
    expect(salesPageContent).toContain('<SummaryMetric label="VAT"');
    expect(salesPageContent).toContain('<SummaryMetric label="Net sales"');
    expect(salesPageContent).toContain('value={money(summary.discounts)}');
    expect(salesPageContent).toContain('value={money(summary.vatable_sales)}');
    expect(salesPageContent).toContain('value={money(summary.vat)}');
    expect(salesPageContent).toContain('value={money(summary.net_sales)}');
  });

  it('keeps keyboard and screen-reader affordances for transaction table interactions', () => {
    expect(salesPageContent).toContain('aria-label="Unified sales transactions table"');
    expect(salesPageContent).toContain('Action');
    expect(salesPageContent).toContain('aria-label={`View transaction ${row.reference_no || row.source_id}`}');
    expect(salesPageContent).toContain('aria-live="polite"');
  });

  it('opens transaction details in an accessible read-only modal', () => {
    expect(salesPageContent).toContain('const [detailOpen, setDetailOpen] = useState(false);');
    expect(salesPageContent).toContain('setDetailOpen(true);');
    expect(salesPageContent).toContain('<Dialog open={detailOpen && Boolean(selected)}');
    expect(salesPageContent).toContain('aria-label="Selected transaction detail"');
    expect(salesPageContent).toContain('aria-label="Close transaction detail"');
    expect(salesPageContent).toContain('TransactionMetric label="Gross sales"');
    expect(salesPageContent).toContain('TransactionDetailSection title="Tax breakdown"');
  });

  it('supports an embedded Back Office presentation without changing the direct sales route', () => {
    expect(salesPageContent).toContain('export default function SalesPage({ embedded = false })');
    expect(salesPageContent).toContain('{!embedded && (');
    expect(salesPageContent).toContain('Sales overview');
    expect(salesPageContent).toContain('aria-label="Sales transaction cards"');
    expect(salesPageContent).toContain('Loading sales activity');
  });
});
