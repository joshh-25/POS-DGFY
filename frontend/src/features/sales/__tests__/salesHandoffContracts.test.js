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
});
