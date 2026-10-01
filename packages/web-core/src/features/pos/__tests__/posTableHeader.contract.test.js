import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const readPosFile = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, 'src/features/pos', relativePath), 'utf8');
const tableSurfaceSource = readPosFile('components/PosTableSurface.jsx');
const reportsTableSource = readPosFile('components/PosReportsResponsiveTable.jsx');
const historyTableSource = readPosFile('components/POSTransactionHistoryPanel.jsx');
const employeeTableSource = readPosFile('components/EmployeeManagementPanel.jsx');
const discountTableSource = readPosFile('settings/PosDiscountManagementPane.jsx');
const cashierAccessTableSource = readPosFile('settings/PosTerminalCashierAccessTable.jsx');
const appStyles = fs.readFileSync(path.resolve(webCoreRoot, 'src/index.css'), 'utf8');

describe('POS standard data-table header contract', () => {
  it('uses one shared 51px header height for History, Reports, and Settings tables', () => {
    expect(tableSurfaceSource).toContain("export const POS_TABLE_HEADER_STANDARD_CLASS = 'pos-table-header--standard';");
    expect(tableSurfaceSource).toContain('`${POS_TABLE_HEADER_STANDARD_CLASS} border-b border-slate-200');
    expect(appStyles).toMatch(/--pos-table-header-height:\s*3\.1875rem;/);
    expect(appStyles).toMatch(/\.pos-table-header--standard > tr > th\s*\{\s*height:\s*var\(--pos-table-header-height\);/);

    expect(reportsTableSource).toContain('<thead className={POS_TABLE_HEADER_CLASS}>');
    expect(historyTableSource).toContain('<thead className={POS_TABLE_HEADER_STANDARD_CLASS}>');
    expect(employeeTableSource).toContain('<thead className={POS_TABLE_HEADER_CLASS}>');
    expect(discountTableSource).toContain('<thead className={`${POS_TABLE_HEADER_STANDARD_CLASS} border-b border-slate-100 bg-slate-50`}>');
    expect(cashierAccessTableSource).toContain('<thead className={`${POS_TABLE_HEADER_STANDARD_CLASS} bg-slate-50');
  });

  it('keeps tablet History headings vertically centered when text-size styles top-align table cells', () => {
    expect(appStyles).toMatch(/body\[data-pos-text-size\]\s+\.dgfy-pos-history-table--tablet\s*>\s*thead\s*>\s*tr\s*>\s*th\s*\{\s*vertical-align:\s*middle;/);
  });
});
