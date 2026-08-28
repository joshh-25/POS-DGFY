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
const checkoutViewContent = readPosFile('components/POSCheckoutTerminalView.jsx');
const checkoutDialogContent = readPosFile('components/POSCheckoutConfirmDialog.jsx');
const checkoutRenderContent = `${checkoutContent}\n${checkoutViewContent}\n${checkoutDialogContent}`;
const checkoutWorkflowContent = readPosFile('hooks/usePosCheckoutWorkflow.js');
const receiptHardwareWorkflowContent = readPosFile('hooks/usePosReceiptHardwareWorkflow.js');
const employeeCreditWorkflowContent = readPosFile('hooks/usePosEmployeeCreditWorkflow.js');
const financialWorkflowContent = readPosFile('hooks/usePosFinancialWorkflow.js');
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
  it('shows the Employee Credit selector only for that tender without a duplicate Sale Summary', () => {
    const orderSettingsIndex = checkoutDialogContent.indexOf('data-testid="pos-checkout-order-settings"');
    const employeeCreditPanelIndex = checkoutDialogContent.indexOf('{isEmployeeCreditPayment && (');
    const discountControlsIndex = checkoutDialogContent.indexOf('aria-label="Apply Discount"');

    expect(employeeCreditPanelIndex).toBeGreaterThan(orderSettingsIndex);
    expect(discountControlsIndex).toBeGreaterThan(employeeCreditPanelIndex);
    expect(checkoutDialogContent).toContain('data-testid="pos-checkout-employee-credit"');
    expect(checkoutDialogContent).not.toContain('data-testid="pos-checkout-sale-summary"');
    expect(checkoutRenderContent).toContain('{!isEmployeeCreditPayment && !splitPaymentReady && (');
  });

  it('offers the tender and submits only its governed authorization details', () => {
    expect(checkoutRenderContent).toContain("{ value: 'employee_credit', label: 'Employee Credit' }");
    expect(checkoutWorkflowContent).toContain("payment_handoff_mode: ['cash', 'employee_credit'].includes(paymentType) ? 'internal' : 'external'");
    expect(checkoutWorkflowContent).toContain('account_code: employeeCreditAccountCode.trim().toUpperCase()');
    expect(checkoutRenderContent).toContain('onSelectEmployee={handleSelectEmployeeCredit}');
    expect(employeeCreditWorkflowContent).toContain('fetchEmployeeCreditAccount(accountCode)');
    expect(employeeCreditWorkflowContent).toContain('const sameSelectedAccount = Boolean(');
    expect(checkoutContent).not.toContain("new CustomEvent('pos:employee-credit-ledger-updated')");
    expect(financialWorkflowContent).toContain('const employeeCreditReady = Boolean(');
    expect(financialWorkflowContent).toContain('selectedEmployeeCreditOption?.account_configured');
    expect(financialWorkflowContent).toContain('selectedEmployeeCreditOption?.is_eligible');
    expect(checkoutRenderContent).toContain('employee_name: employeeCreditDiscountName');
    expect(checkoutRenderContent).toContain('employee_id: employeeCreditDiscountId');
    expect(checkoutContent).not.toContain('employeeCreditBalance >= cartTotal');
    expect(checkoutRenderContent).toContain('disabled={posActionsBlocked || checkoutLoading || discountModalOpen || safeCart.length === 0 || !isCheckoutWorkflowValid || (!splitPaymentReady && !paymentIsSufficient)}');
    expect(checkoutContent).not.toContain('employeeCreditPin');
    expect(employeeCreditPaymentContent).not.toMatch(/\bPIN\b/i);
    expect(employeeCreditPaymentContent).toContain('Select Employee');
    expect(employeeCreditPaymentContent).toContain('role="combobox"');
    expect(employeeCreditPaymentContent).toContain('aria-autocomplete="list"');
    expect(employeeCreditPaymentContent).toContain('setSearch(event.target.value)');
    expect(employeeCreditPaymentContent).toContain('data-testid="employee-credit-options-list"');
    expect(employeeCreditPaymentContent).toContain('data-visible-record-limit="5"');
    expect(employeeCreditPaymentContent).toContain('max-h-[24rem] overflow-y-auto');
    expect(employeeCreditPaymentContent).toContain('Search and select employee');
    expect(employeeCreditPaymentContent).toContain('Outstanding after sale');
    expect(employeeCreditPaymentContent).toContain('>Branch</span>');
    expect(employeeCreditPaymentContent).toContain('>Current outstanding</span>');
    expect(employeeCreditPaymentContent).not.toContain('Select an employee. Eligibility is validated automatically');
    expect(employeeCreditPaymentContent).not.toContain('Eligible. This sale will be added to the employee outstanding balance.');
    expect(employeeCreditPaymentContent).not.toContain('Full Employee Credit payment only.');
    expect(employeeCreditPaymentContent).not.toContain('available credit');
    expect(employeeCreditPaymentContent).not.toContain('placeholder="Employee account code"');
    expect(employeeCreditPaymentContent).not.toContain("'Verify'");
    expect(checkoutRenderContent).toContain('{!isEmployeeCreditPayment && !splitPaymentReady && (');
    expect(checkoutWorkflowContent).toContain('cash_received: isCashPayment ? effectiveCustomerPaymentAmount : undefined');
    // Checkout still auto-opens the drawer for a cash sale...
    expect(checkoutWorkflowContent).toContain('openDrawerAfterPrint: isCashPayment');
    expect(checkoutWorkflowContent).toContain("reason: 'checkout_auto_print'");
    // ...but a reprint must never pulse it. Cashier-initiated opens go through the
    // PIN/reason modal instead, so the old payment_type-derived reprint behavior is gone.
    expect(receiptHardwareWorkflowContent).toContain('const shouldOpenDrawer = false;');
    expect(receiptHardwareWorkflowContent).not.toContain("const shouldOpenDrawer = String(transaction?.payment_type || '').trim().toLowerCase() === 'cash'");
  });

  it('uses permissioned account, lookup, and report endpoints', () => {
    expect(serviceContent).toContain("'/pos/employee-credit/lookup'");
    expect(serviceContent).toContain("'/pos/employee-credit/checkout-options'");
    expect(serviceContent).toContain("'/pos/employee-credit/accounts'");
    expect(serviceContent).toContain("'/pos/employee-credit/report'");
    expect(serviceContent).toContain("Employee Credit report returned an invalid response.");
    expect(serviceContent).toContain('`/pos/employee-credit/accounts/${userId}`');
    expect(serviceContent).toContain('`/pos/employee-credit/employee-accounts/${employeeId}`');
    expect(serviceContent).toContain("'/pos/employee-credit/employee-accounts/enable-active'");
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
    expect(employeeCreditPanelContent).toContain('Enable active employees');
    expect(employeeCreditPanelContent).toContain('Inactive employees are not affected.');
    expect(employeeCreditPanelContent).toContain('ConfirmActionDialog');
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
