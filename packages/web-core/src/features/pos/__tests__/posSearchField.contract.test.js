import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const componentSource = fs.readFileSync(path.resolve(__dirname, '../components/PosSearchField.jsx'), 'utf8');
const employeeSource = fs.readFileSync(path.resolve(__dirname, '../components/EmployeeManagementPanel.jsx'), 'utf8');
const historySource = fs.readFileSync(path.resolve(__dirname, '../components/POSTransactionHistoryPanel.jsx'), 'utf8');
const reportsSource = fs.readFileSync(path.resolve(__dirname, '../components/PosReportsToolbar.jsx'), 'utf8');
const checkoutSource = fs.readFileSync(path.resolve(__dirname, '../components/POSCheckoutTerminalView.jsx'), 'utf8');
const auditSource = fs.readFileSync(path.resolve(__dirname, '../components/AuditWorkspacePanel.jsx'), 'utf8');
const itemsSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'), 'utf8');
const sharedPageSearchSources = [
  '../components/DeliveryPersonnelManagementPanel.jsx',
  '../components/EmployeeCreditManagementPanel.jsx',
  '../components/TerminalOperationsPanels.jsx',
  '../components/PricelistManagementPanel.jsx',
  '../components/PosServicesOperationsWorkspace.jsx',
  '../components/PosFnbModifiersWorkspace.jsx',
  '../settings/PosTerminalCashierAccessTable.jsx',
  '../settings/StorefrontReviewsSettings.jsx',
  '../settings/PosStorefrontSettingsPane.jsx'
].map((sourcePath) => fs.readFileSync(path.resolve(__dirname, sourcePath), 'utf8'));

describe('POS shared search field contract', () => {
  it('provides the Sell-style input, reserved clear-button space, and an inset enlarged clear control', () => {
    expect(componentSource).toContain("export const POS_SEARCH_FIELD_INPUT_CLASS = 'h-10 w-full rounded-lg border border-slate-300 bg-white pl-11 pr-10 text-[13px] text-[#0F172A] shadow-sm placeholder:text-[#64748B] transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100';");
    expect(componentSource).toContain('h-5 w-5 -translate-y-1/2 text-[#1A4E8D]');
    expect(componentSource).toContain('absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2');
    expect(componentSource).toContain('<Delete className="h-[18px] w-[18px]"');
    expect(componentSource).toContain('type="text"');
    expect(componentSource).toContain('role="searchbox"');
    expect(componentSource).toContain("import { Input } from '@/components/ui/input';");
  });

  it('uses the shared field for Sell, Items, Employees, History, Reports, and Audit searches', () => {
    expect(checkoutSource).toContain("import PosSearchField from './PosSearchField.jsx';");
    expect(employeeSource).toContain("import PosSearchField from './PosSearchField.jsx';");
    expect(historySource).toContain("import PosSearchField from './PosSearchField.jsx';");
    expect(reportsSource).toContain("import PosSearchField from './PosSearchField.jsx';");
    expect(auditSource).toContain("import PosSearchField from './PosSearchField.jsx';");
    expect(itemsSource).toContain("import PosSearchField from './PosSearchField.jsx';");
    expect(checkoutSource).toContain('<PosSearchField');
    expect(employeeSource).toContain('<PosSearchField');
    expect(historySource).toContain('<PosSearchField');
    expect(reportsSource).toContain('<PosSearchField');
    expect(auditSource).toContain('<PosSearchField');
    expect(itemsSource).toContain('<PosSearchField');
  });

  it('uses the shared field with explicit clear handlers across the remaining page-level searches', () => {
    for (const source of sharedPageSearchSources) {
      expect(source).toContain('<PosSearchField');
      expect(source).toContain('onClear=');
    }
  });
});
