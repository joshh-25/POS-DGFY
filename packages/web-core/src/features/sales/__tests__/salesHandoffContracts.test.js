import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const salesPagePath = path.resolve(__dirname, '../pages/SalesPage.jsx');

describe('sales handoff and export UX contracts', () => {
  let salesPageContent = '';

  beforeAll(() => {
    salesPageContent = fs.readFileSync(salesPagePath, 'utf8');
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
    expect(salesPageContent).toContain("showAdvancedFilters ? 'Hide filters' : 'Filters'");
    expect(salesPageContent).toContain('aria-label="Clear sales filters"');
    expect(salesPageContent).toContain('aria-controls="sales-advanced-filters"');
    expect(salesPageContent).toContain('aria-label="Sales transaction cards"');
    expect(salesPageContent).toContain('Loading sales activity');
  });
});
