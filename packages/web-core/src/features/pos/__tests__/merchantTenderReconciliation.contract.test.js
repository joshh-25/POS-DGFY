import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const workspaceSource = fs.readFileSync(path.resolve(process.cwd(), 'src/features/pos/components/TerminalOperationsWorkspace.jsx'), 'utf8');
const serviceSource = fs.readFileSync(path.resolve(process.cwd(), 'src/features/pos/services/posService.js'), 'utf8');

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

  it('uses shift-scoped read and append-review endpoints', () => {
    expect(serviceSource).toContain('fetchMerchantTenderReconciliation');
    expect(serviceSource).toContain('reviewMerchantTenderReconciliation');
    expect(serviceSource).toContain('/merchant-tender-reconciliation`');
  });
});
