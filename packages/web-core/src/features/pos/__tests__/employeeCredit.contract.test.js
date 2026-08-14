import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const readPosFile = (relativePath) => fs.readFileSync(
  path.resolve(webCoreRoot, `src/features/pos/${relativePath}`),
  'utf8'
);

const checkoutContent = readPosFile('components/POSCheckoutTerminal.jsx');
const receiptContent = readPosFile('components/ReceiptPrintView.jsx');
const hardwareContent = readPosFile('utils/iminHardwareBridge.js');
const serviceContent = readPosFile('services/employeeCreditService.js');
const employeeServiceContent = readPosFile('services/employeeService.js');
const employeePanelContent = readPosFile('components/EmployeeManagementPanel.jsx');
const employeeCreditPanelContent = readPosFile('components/EmployeeCreditManagementPanel.jsx');
const employeeCreditPaymentContent = readPosFile('components/EmployeeCreditPaymentPanel.jsx');
const employeeCreditReportContent = readPosFile('components/EmployeeCreditReportPanel.jsx');
const settingsWorkspaceContent = readPosFile('components/TerminalOperationsWorkspace.jsx');
const terminalPageContent = readPosFile('pages/TerminalPage.jsx');
const reportsWorkspaceContent = readPosFile('components/PosReportsAnalyticsWorkspace.jsx');

describe('Employee Credit POS contract', () => {
  it('offers the tender and submits only its governed authorization details', () => {
    expect(checkoutContent).toContain('<option value="employee_credit">Employee Credit</option>');
    expect(checkoutContent).toContain("payment_handoff_mode: ['cash', 'employee_credit'].includes(paymentType) ? 'internal' : 'external'");
    expect(checkoutContent).toContain('account_code: employeeCreditAccountCode.trim().toUpperCase()');
    expect(checkoutContent).toContain('onSelectEmployee={handleSelectEmployeeCredit}');
    expect(checkoutContent).toContain('fetchEmployeeCreditAccount(accountCode)');
    expect(checkoutContent).toContain('const sameSelectedAccount = Boolean(');
    expect(checkoutContent).not.toContain("new CustomEvent('pos:employee-credit-ledger-updated')");
    expect(checkoutContent).toContain('const employeeCreditReady = Boolean(');
    expect(checkoutContent).toContain('selectedEmployeeCreditOption?.account_configured');
    expect(checkoutContent).toContain('selectedEmployeeCreditOption?.is_eligible');
    expect(checkoutContent).not.toContain('employeeCreditBalance >= cartTotal');
    expect(checkoutContent).toContain('disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isCheckoutWorkflowValid || !isCustomerPaymentSufficient}');
    expect(checkoutContent).not.toContain('employeeCreditPin');
    expect(employeeCreditPaymentContent).not.toMatch(/\bPIN\b/i);
    expect(employeeCreditPaymentContent).toContain('Select Employee');
    expect(employeeCreditPaymentContent).toContain('<PopoverTrigger asChild>');
    expect(employeeCreditPaymentContent).toContain('Search and select employee');
    expect(employeeCreditPaymentContent).toContain('Outstanding after sale');
    expect(employeeCreditPaymentContent).toContain('Eligible. This sale will be added to the employee outstanding balance.');
    expect(employeeCreditPaymentContent).not.toContain('available credit');
    expect(employeeCreditPaymentContent).not.toContain('placeholder="Employee account code"');
    expect(employeeCreditPaymentContent).not.toContain("'Verify'");
    expect(checkoutContent).toContain('{!isEmployeeCreditPayment && (');
    expect(checkoutContent).toContain("cash_received: isCashPayment ? Number(customerPaymentAmount || 0) : undefined");
    expect(checkoutContent).toContain("const shouldOpenDrawer = String(transaction?.payment_type || '').trim().toLowerCase() === 'cash'");
  });

  it('uses permissioned account, lookup, and report endpoints', () => {
    expect(serviceContent).toContain("'/pos/employee-credit/lookup'");
    expect(serviceContent).toContain("'/pos/employee-credit/checkout-options'");
    expect(serviceContent).toContain("'/pos/employee-credit/accounts'");
    expect(serviceContent).toContain("'/pos/employee-credit/report'");
    expect(serviceContent).toContain("Employee Credit report returned an invalid response.");
    expect(serviceContent).toContain('`/pos/employee-credit/accounts/${userId}`');
    expect(serviceContent).toContain('`/pos/employee-credit/employee-accounts/${employeeId}`');
    expect(serviceContent).toContain('`/pos/employee-credit/accounts/${accountId}/repay`');
    expect(serviceContent).toContain('`/pos/employee-credit/accounts/${accountId}/adjust-outstanding`');
  });

  it('uses one report refresh path and preserves ledger rows during refreshes', () => {
    expect(employeeCreditReportContent).toContain('requestSequence');
    expect(employeeCreditReportContent).toContain('controller.abort()');
    expect(employeeCreditReportContent).toContain('manualRefreshKey');
    expect(employeeCreditReportContent).not.toContain("pos:employee-credit-ledger-updated");
    expect(employeeCreditReportContent).toContain('Refreshing Employee Credit report...');
    expect(terminalPageContent).toContain('const [employeeCreditReportRefreshKey, setEmployeeCreditReportRefreshKey] = useState(0)');
    expect(terminalPageContent).toContain("completedTransaction?.payment_type || ''");
    expect(terminalPageContent).toContain("=== 'employee_credit'");
    expect(terminalPageContent).toContain('const offlineSnapshotScope = useMemo(() => ({');
    expect(reportsWorkspaceContent).toContain('refreshKey={employeeCreditReportRefreshKey}');
  });

  it('manages non-login employees and refreshes credit configuration after directory changes', () => {
    expect(employeeServiceContent).toContain("'/pos/employees'");
    expect(employeeServiceContent).toContain('`/pos/employees/${employeeId}`');
    expect(employeePanelContent).toContain('Add workmates without creating POS usernames, passwords, or roles.');
    expect(employeeCreditPanelContent).toContain('entry.employee_id');
    expect(employeeCreditPanelContent).toContain('refreshKey');
    expect(settingsWorkspaceContent).toContain('employeeDirectoryRevision');
    expect(settingsWorkspaceContent).toContain('onEmployeesChanged');
  });

  it('prints non-cash credit evidence and an employee signature line', () => {
    expect(receiptContent).toContain("transaction.payment_type === 'employee_credit'");
    expect(receiptContent).toContain('employee_credit_employee_name_snapshot');
    expect(receiptContent).toContain('employee_credit_account_code_snapshot');
    expect(receiptContent).toContain('employee_credit_balance_after');
    expect(receiptContent).toContain('employee_credit_authorization_reference');
    expect(receiptContent).toContain('Employee Signature');
    expect(hardwareContent).toContain("transaction?.payment_type === 'employee_credit'");
    expect(hardwareContent).toContain('Employee Signature');
  });
});
