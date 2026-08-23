import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const workspacePath = path.resolve(
  webCoreRoot,
  'src/features/pos/components/TerminalOperationsWorkspace.jsx'
);
const workspaceContent = fs.readFileSync(workspacePath, 'utf8');

describe('POS Customer Access Mode card selector contract', () => {
  it('renders the four existing modes as interactive cards', () => {
    expect(workspaceContent).toContain('Customer Access Mode options');
    expect(workspaceContent).toContain("label: 'Ghost'");
    expect(workspaceContent).toContain("label: 'Catalog Only'");
    expect(workspaceContent).toContain("label: 'Inquiry'");
    expect(workspaceContent).toContain("label: 'Transaction'");
    expect(workspaceContent).toContain('aria-pressed={isSelected}');
    expect(workspaceContent).toContain("'Applied automatically'");
  });

  it('preserves platform limits and the existing settings state update', () => {
    expect(workspaceContent).toContain('CUSTOMER_ACCESS_MODE_RANK[option.value] > CUSTOMER_ACCESS_MODE_RANK[platformMaxCustomerAccessMode]');
    expect(workspaceContent).toContain('customerAccessMode: option.value');
    expect(workspaceContent).toContain('id="pos-customer-access-mode"');
    expect(workspaceContent).toContain('void handleCustomerAccessModeChange(event.target.value)');
  });
});
