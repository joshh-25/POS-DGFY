import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const workspaceSource = fs.readFileSync(path.resolve(webCoreRoot, 'src/features/pos/components/TerminalOperationsWorkspace.jsx'), 'utf8');
const serviceSource = fs.readFileSync(path.resolve(webCoreRoot, 'src/features/pos/services/posService.js'), 'utf8');

describe('merchant-owned tender reconciliation UI contract', () => {
  it('shows the manager review only to close-day operators and states the non-PayMongo boundary', () => {
    expect(workspaceSource).toContain('{canCloseDay ? (');
    expect(workspaceSource).toContain('<MerchantTenderReconciliationPanel');
    expect(workspaceSource).toContain('This review never calls PayMongo or changes sales.');
  });

  it('collects all four store-owned observed totals and requires a note for variance', () => {
    expect(workspaceSource).toContain("{ key: 'gcash', label: 'GCash' }");
    expect(workspaceSource).toContain("{ key: 'maya', label: 'Maya' }");
    expect(workspaceSource).toContain("{ key: 'card', label: 'Card terminal' }");
    expect(workspaceSource).toContain("{ key: 'bank_transfer', label: 'Bank transfer' }");
    expect(workspaceSource).toContain('hasVariance && reviewNote.trim().length < 8');
  });

  it('shows Employee Credit as a read-only internal receivable instead of an observed external tender', () => {
    expect(workspaceSource).toContain('data-testid="employee-credit-reconciliation-row"');
    expect(workspaceSource).toContain('Employee Credit is shown read-only because it is an internal receivable.');
    expect(workspaceSource).toContain('salesSummary={shiftState.salesSummary}');
    expect(workspaceSource).toContain("=== 'employee_credit'");
    expect(workspaceSource).not.toContain("{ key: 'employee_credit'");
  });

  it('uses shift-scoped read and append-review endpoints', () => {
    expect(serviceSource).toContain('fetchMerchantTenderReconciliation');
    expect(serviceSource).toContain('reviewMerchantTenderReconciliation');
    expect(serviceSource).toContain('/merchant-tender-reconciliation`');
  });
});
