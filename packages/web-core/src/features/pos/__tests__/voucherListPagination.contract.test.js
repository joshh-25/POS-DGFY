import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const voucherPanelPath = path.resolve(__dirname, '../components/VoucherManagementPanel.jsx');
const terminalOperationsWorkspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const terminalWorkspaceShellPath = path.resolve(__dirname, '../components/TerminalWorkspaceShell.jsx');

describe('POS Vouchers mobile list pagination contract', () => {
  it('keeps every list state inside a flexible content region before pagination', () => {
    const source = fs.readFileSync(voucherPanelPath, 'utf8');

    expect(source).toContain('data-testid="pos-vouchers-content" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"');
    expect(source).toContain('data-testid="pos-vouchers-results" className="dgfy-pos-scroll-region min-h-0 min-w-0 flex-1');
    expect(source).toContain('testId="pos-vouchers-pagination"');
    expect(source).toContain('className="dgfy-pos-history-pagination-footer mt-auto shrink-0');
  });

  it('removes only the outer catalog workspace border for Vouchers and Pricelists', () => {
    const workspaceSource = fs.readFileSync(terminalOperationsWorkspacePath, 'utf8');
    const shellSource = fs.readFileSync(terminalWorkspaceShellPath, 'utf8');

    expect(workspaceSource).toContain('borderless={isFullBleedCatalogView}');
    expect(workspaceSource).toContain('pos-catalog-workspace-shell');
    expect(shellSource).toContain('borderless = false');
    expect(shellSource).toContain("? 'min-w-0 max-w-full rounded-xl bg-white shadow-sm shadow-slate-200/70'");
    expect(shellSource).toContain(" : 'min-w-0 max-w-full rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70'");
  });
});
