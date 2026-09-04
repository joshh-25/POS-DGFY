import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspacePath = path.resolve(__dirname, '../components/PosReportsAnalyticsWorkspace.jsx');
const workspaceSource = fs.readFileSync(workspacePath, 'utf8');

describe('POS report category filter contract', () => {
  it('separates attendance, cashier sales, register reconciliation, and handoff reporting', () => {
    expect(workspaceSource).toContain("{ id: 'attendance', label: 'Attendance' }");
    expect(workspaceSource).toContain("{ id: 'cashiers', label: 'Cashier Sales' }");
    expect(workspaceSource).toContain("{ id: 'registers', label: 'Registers' }");
    expect(workspaceSource).toContain("{ id: 'handoffs', label: 'Handoffs' }");
    expect(workspaceSource).toContain('Drawer variance is shown under Registers, never assigned to an uncounted relief cashier.');
    expect(workspaceSource).toContain('legacy rows are disclosed in transaction detail');
  });

  it('uses active folder IDs rather than date-dependent category names', () => {
    expect(workspaceSource).toContain("const [categoryId, setCategoryId] = useState('');");
    expect(workspaceSource).toContain('category_id: categoryId || undefined');
    expect(workspaceSource).toContain('value={entry.folder_id || \'\'}');
    expect(workspaceSource).toContain('{entry.name}');
    expect(workspaceSource).not.toContain('value={category}');
  });

  it('keeps report cards viewport-safe and renders table rows as mobile cards', () => {
    expect(workspaceSource).toContain('min-w-0 max-w-full overflow-hidden rounded-2xl');
    expect(workspaceSource).toContain('grid min-w-0 gap-3 sm:hidden');
    expect(workspaceSource).toContain('hidden min-w-0 max-w-full overflow-x-auto overscroll-x-contain');
    expect(workspaceSource).toContain('min-w-[720px]');
  });

  it('stacks report date controls on narrow screens without widening the filter card', () => {
    expect(workspaceSource).toContain('grid min-w-0 grid-cols-1 gap-3 sm:contents');
    expect(workspaceSource).toContain('pos-report-date-input h-11 w-full min-w-0 max-w-full');
    expect(workspaceSource).toContain('order-2 min-w-0 max-w-full overflow-hidden rounded-2xl');
  });

  it('prints the selected cashier cash reconciliation and filtered transaction rows', () => {
    expect(workspaceSource).toContain('Cashier Sales & Cash Reconciliation');
    expect(workspaceSource).toContain('dailyReport.transaction_rows');
    expect(workspaceSource).toContain('Cash Reconciliation');
    expect(workspaceSource).toContain('Filtered Transactions');
    expect(workspaceSource).toContain('reportCashierLabel');
  });

  // Phase 261 (#1488): pre-run procurement CSV export button, independent of the loaded report.
  it('exposes a procurement CSV export button that is not gated on report data', () => {
    expect(workspaceSource).toContain('exportProcurementCsv');
    expect(workspaceSource).toContain('handleExportProcurementCsv');
    expect(workspaceSource).toContain('Procurement CSV');
    expect(workspaceSource).toContain('onClick={handleExportProcurementCsv}');
  });
});
