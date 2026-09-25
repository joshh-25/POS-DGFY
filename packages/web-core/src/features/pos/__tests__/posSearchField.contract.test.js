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

describe('POS shared search field contract', () => {
  it('keeps the Employees search visual contract in one reusable component', () => {
    expect(componentSource).toContain("export const POS_SEARCH_FIELD_INPUT_CLASS = 'h-10 pl-9 text-sm placeholder:text-slate-500';");
    expect(componentSource).toContain('h-4 w-4 -translate-y-1/2 text-slate-400');
    expect(componentSource).toContain("import { Input } from '@/components/ui/input';");
  });

  it('uses the shared field for Employees, History, and the Reports toolbar', () => {
    expect(employeeSource).toContain("import PosSearchField from './PosSearchField.jsx';");
    expect(historySource).toContain("import PosSearchField from './PosSearchField.jsx';");
    expect(reportsSource).toContain("import PosSearchField from './PosSearchField.jsx';");
    expect(employeeSource).toContain('<PosSearchField');
    expect(historySource).toContain('<PosSearchField');
    expect(reportsSource).toContain('<PosSearchField');
  });
});
