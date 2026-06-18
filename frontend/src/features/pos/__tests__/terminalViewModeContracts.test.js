import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const terminalPagePath = path.resolve(__dirname, '../pages/TerminalPage.jsx');
const terminalWorkspaceSidebarPath = path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx');
const terminalSidebarPanelPath = path.resolve(__dirname, '../components/TerminalSidebarPanel.jsx');
const terminalOperationsWorkspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const posCheckoutTerminalPath = path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx');
const skupervisorCheckoutTerminalPath = path.resolve(__dirname, '../components/SkupervisorPOSCheckoutTerminal.jsx');
const receiptPrintViewPath = path.resolve(__dirname, '../components/ReceiptPrintView.jsx');
const posBarcodeScannerPath = path.resolve(__dirname, '../components/POSBarcodeScanner.jsx');
const posHistoryPanelPath = path.resolve(__dirname, '../components/POSTransactionHistoryPanel.jsx');
const terminalPageLayoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');
const terminalLockDrawerPath = path.resolve(__dirname, '../components/TerminalLockDrawer.jsx');

describe('POS terminal view-mode contracts', () => {
  let terminalPageContent = '';
  let terminalWorkspaceSidebarContent = '';
  let terminalSidebarPanelContent = '';
  let terminalOperationsWorkspaceContent = '';
  let posCheckoutTerminalContent = '';
  let skupervisorCheckoutTerminalContent = '';
  let receiptPrintViewContent = '';
  let posBarcodeScannerContent = '';
  let posHistoryPanelContent = '';
  let terminalPageLayoutContent = '';
  let terminalLockDrawerContent = '';

  beforeAll(() => {
    terminalPageContent = fs.readFileSync(terminalPagePath, 'utf8');
    terminalWorkspaceSidebarContent = fs.readFileSync(terminalWorkspaceSidebarPath, 'utf8');
    terminalSidebarPanelContent = fs.readFileSync(terminalSidebarPanelPath, 'utf8');
    terminalOperationsWorkspaceContent = fs.readFileSync(terminalOperationsWorkspacePath, 'utf8');
    posCheckoutTerminalContent = fs.readFileSync(posCheckoutTerminalPath, 'utf8');
    skupervisorCheckoutTerminalContent = fs.readFileSync(skupervisorCheckoutTerminalPath, 'utf8');
    receiptPrintViewContent = fs.readFileSync(receiptPrintViewPath, 'utf8');
    posBarcodeScannerContent = fs.readFileSync(posBarcodeScannerPath, 'utf8');
    posHistoryPanelContent = fs.readFileSync(posHistoryPanelPath, 'utf8');
    terminalPageLayoutContent = fs.readFileSync(terminalPageLayoutPath, 'utf8');
    terminalLockDrawerContent = fs.readFileSync(terminalLockDrawerPath, 'utf8');
  });

  it('keeps explicit checkout and operations mode lists in TerminalPage', () => {
    expect(terminalPageContent).toContain("const CHECKOUT_VIEW_MODES = ['checkout', 'history', 'receipt']");
    expect(terminalPageContent).toContain("'incoming_queue'");
    expect(terminalPageContent).toContain("'location_scope'");
    expect(terminalPageContent).toContain("'shift_controls'");
    expect(terminalPageContent).toContain("'reports'");
  });

  it('blocks sidebar view switching while terminal is locked', () => {
    expect(terminalPageContent).toContain('if (locked) {');
    expect(terminalPageContent).toContain('setMobileNavOpen(false);');
    expect(terminalPageContent).toContain('return;');
  });

  it('blurs all non-login POS shell surfaces while locked', () => {
    expect(terminalPageLayoutContent).toContain("const lockedSurfaceClassName = locked ? 'pointer-events-none select-none opacity-80 blur-[2px]' : '';");
    expect(terminalPageLayoutContent).toContain('`${persistentSidebarClassName} ${lockedSurfaceClassName}`');
    expect(terminalPageLayoutContent).toContain('lg:px-7 ${lockedSurfaceClassName}');
    expect(terminalPageLayoutContent).toContain('xl:touch-pan-y ${lockedSurfaceClassName}');
  });

  it('persists manual POS terminal lock across refresh until login succeeds', () => {
    expect(terminalPageContent).toContain("const TERMINAL_LOCK_STORAGE_KEY = 'pos_terminal_locked_v1';");
    expect(terminalPageContent).toContain('readStoredTerminalLock() || !getAccessToken()');
    expect(terminalPageContent).toContain('if (readStoredTerminalLock()) {');
    expect(terminalPageContent).toContain('setStoredTerminalLock(true);');
    expect(terminalPageContent).toContain('setStoredTerminalLock(false);');
  });

  it('checks current shift before requiring a loaded operating location', () => {
    expect(terminalPageContent).toContain('const currentShiftParams = scopedOperatingLocationId');
    expect(terminalPageContent).toContain(': { terminal_id: terminalId };');
    expect(terminalPageContent).toContain('const currentShiftResult = await fetchCurrentTerminalShift(');
    expect(terminalPageContent).toContain('const effectiveLocationId = Number.isInteger(shiftLocationId) && shiftLocationId > 0');
    expect(terminalPageContent).not.toContain('if (!scopedOperatingLocationId) {');
  });

  it('enforces incoming queue access-state handling in TerminalPage', () => {
    expect(terminalPageContent).toContain("accessState: 'forbidden'");
    expect(terminalPageContent).toContain("accessState: 'allowed'");
    expect(terminalPageContent).toContain("accessState: isForbidden ? 'forbidden' : 'error'");
    expect(terminalPageContent).toContain("['incoming_queue', 'location_scope'].includes(posViewMode)");
  });

  it('fails closed when compliance gate context cannot be loaded', () => {
    expect(terminalPageContent).toContain('loadError: true');
    expect(terminalPageContent).toContain("code: 'COMPLIANCE_GATE_UNAVAILABLE'");
    expect(terminalPageContent).toContain("if (complianceGate.loadError) return 'Compliance status is unavailable. Please refresh and retry.';");
    expect(terminalPageContent).toContain("title: 'Compliance gate unavailable'");
  });

  it('keeps incoming queue and location scope sidebar items permission-aware', () => {
    expect(terminalWorkspaceSidebarContent).toContain("disabled={locked || !canViewPos || !hasActiveShift}");
    expect(terminalWorkspaceSidebarContent).toContain('POS view permission required');
  });

  it('does not render the cashier scroll-zone badge', () => {
    expect(terminalWorkspaceSidebarContent).not.toContain('Scroll for more terminal tools.');
    expect(terminalWorkspaceSidebarContent).not.toContain('showScrollZoneBadge');
    expect(terminalPageLayoutContent).not.toContain('showScrollZoneBadge');
  });

  it('renders forbidden/error states and transact guard in incoming queue workspace', () => {
    expect(terminalSidebarPanelContent).toContain('incomingOrdersAccessState === \'forbidden\'');
    expect(terminalSidebarPanelContent).toContain('incomingOrdersAccessState === \'error\'');
    expect(terminalSidebarPanelContent).toContain("disabled={Boolean(actionLoading) || !canTransactPos || locked || !shiftState.shift}");
    expect(terminalSidebarPanelContent).toContain('You need POS transact permission to update order statuses.');
  });

  it('requires an open shift before POS sale actions are available', () => {
    expect(terminalPageContent).toContain('requiresOpenShift');
    expect(terminalPageContent).toContain('shiftOpeningModalOpen');
    expect(terminalPageContent).toContain('handleShiftOpeningModalOpenChange');
    expect(terminalPageContent).toContain('handleShiftOpeningModalSubmit');
    expect(terminalPageContent).toContain('handleShiftOpeningModalLock');
    expect(terminalPageContent).toContain('<Dialog open={shiftOpeningModalOpen}');
    expect(terminalPageContent).toContain('canSubmitOpenShift');
    expect(terminalPageContent).toContain('required');
    expect(terminalPageContent).toContain('Lock Terminal');
    expect(terminalPageContent).toContain('Terminal locked. Unlock again when you are ready to open a shift.');
    expect(terminalPageContent).not.toContain('openingFloatAmount: configuredPettyCash.toFixed(2)');
    expect(terminalPageContent).toContain('Please open your shift before using the POS.');
    expect(terminalPageContent).toContain('You cannot use the POS because the shift is closed.');
    expect(terminalPageContent).toContain('Shift opened successfully.');
    expect(terminalPageContent).toContain('closeShiftConfirmOpen');
    expect(terminalPageContent).toContain('handleConfirmCloseShift');
    expect(terminalPageContent).toContain('Are you sure you want to close this shift?');
    expect(terminalPageContent).not.toContain('window.confirm');
    expect(terminalPageContent).toContain('Shift closed successfully. Please open a new shift to continue.');
    expect(terminalSidebarPanelContent).toContain('Shift Open');
    expect(terminalSidebarPanelContent).toContain('Shift Closed');
    expect(terminalOperationsWorkspaceContent).toContain('Shift Closed. Please open your shift before using the POS.');
    expect(terminalOperationsWorkspaceContent).toContain('isValidOpeningCashAmount');
    expect(terminalOperationsWorkspaceContent).toContain('shiftState = { shift: null }');
    expect(terminalOperationsWorkspaceContent).toContain('shiftState={shiftState}');
    expect(terminalOperationsWorkspaceContent).toContain('disabled={shiftActionLoading.open || locked || !canTransactPos || !canSubmitOpenShift}');
    expect(terminalSidebarPanelContent).toContain('isValidOpeningCashAmount');
    expect(terminalSidebarPanelContent).toContain('disabled={shiftActionLoading.open || locked || !canTransactPos || !canSubmitOpenShift}');
    expect(posCheckoutTerminalContent).toContain('const posActionsBlocked = Boolean(checkoutBlockedReason);');
    expect(posCheckoutTerminalContent).toContain('notifyPosActionBlocked');
    expect(posCheckoutTerminalContent).toContain('disabled={posActionsBlocked || cart.length === 0}');
    expect(skupervisorCheckoutTerminalContent).toContain('const posActionsBlocked = Boolean(checkoutBlockedReason);');
    expect(skupervisorCheckoutTerminalContent).toContain('notifyPosActionBlocked');
    expect(skupervisorCheckoutTerminalContent).toContain('disabled={posActionsBlocked || cart.length === 0}');
  });

  it('keeps dedicated operations workspace content mapping for every sidebar mode', () => {
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Incoming Online Queue'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Location Scope'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Shift Controls'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Cash Drawer Event'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Close Shift'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Report'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Sales Today'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Terminal Setup Context'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'reports'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'incoming_queue'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'terminal_setup'");
  });

  it('adds report navigation with horizontal report tabs', () => {
    expect(terminalWorkspaceSidebarContent).toContain('testId="pos-nav-reports"');
    expect(terminalWorkspaceSidebarContent).toContain("onClick={() => onSelectViewMode('reports')}");
    expect(terminalOperationsWorkspaceContent).toContain('Daily Total Reports');
    expect(terminalOperationsWorkspaceContent).toContain('Amount Charged');
    expect(terminalOperationsWorkspaceContent).toContain('Discount Amount');
    expect(terminalOperationsWorkspaceContent).toContain('Net Profit');
    expect(terminalOperationsWorkspaceContent).toContain('Popular Item');
    expect(terminalOperationsWorkspaceContent).toContain('Transaction');
    expect(terminalOperationsWorkspaceContent).toContain("setSlideDirection(nextTabIndex > activeTabIndex ? 'forward' : 'backward')");
    expect(terminalOperationsWorkspaceContent).toContain('data-slide-direction={slideDirection}');
    expect(terminalOperationsWorkspaceContent).toContain('transition-transform duration-300 ease-out');
  });

  it('keeps receipt preview empty-state branch with history fallback action', () => {
    expect(posCheckoutTerminalContent).toContain('No receipt selected yet.');
    expect(posCheckoutTerminalContent).toContain('onClick={() => setCurrentViewMode(\'history\')}');
    expect(posCheckoutTerminalContent).toContain('Go to History');
  });

  it('supports manual POS discounts by percentage or fixed amount', () => {
    expect(posCheckoutTerminalContent).toContain("const [manualDiscountMode, setManualDiscountMode] = useState('none');");
    expect(posCheckoutTerminalContent).toContain("const [manualDiscountAmountInput, setManualDiscountAmountInput] = useState('');");
    expect(posCheckoutTerminalContent).toContain('Discount Type');
    expect(posCheckoutTerminalContent).toContain('<option value="none">No Manual Discount</option>');
    expect(posCheckoutTerminalContent).toContain('<option value="percentage">Percentage</option>');
    expect(posCheckoutTerminalContent).toContain('<option value="amount">Manual Amount</option>');
    expect(posCheckoutTerminalContent).toContain("manualDiscountMode !== 'none'");
    expect(posCheckoutTerminalContent).toContain("discount_mode: selectedDiscount ? 'preset' : (manualDiscountAmount > 0 ? manualDiscountMode : 'none')");
    expect(posCheckoutTerminalContent).toContain("manualDiscountMode === 'amount' ? 'Manual Discount Amount' : 'Manual Discount Percentage'");
    expect(posCheckoutTerminalContent).toContain('Manual amount is capped at the item subtotal.');
  });

  it('keeps history receipt modal close action in the header and print action in the footer', () => {
    expect(posCheckoutTerminalContent).toContain('aria-label="Close receipt preview"');
    expect(posCheckoutTerminalContent).toContain("onClick={() => handlePrintReceipt(lastReceipt, 'history_modal')}");
    expect(posCheckoutTerminalContent).toContain("{receiptPrinting ? 'Printing...' : 'Print'}");
    expect(posCheckoutTerminalContent).toContain('pos-receipt-print-footer flex shrink-0');
    expect(posCheckoutTerminalContent).not.toContain('<X className="h-5 w-5" />\n                                </button>\n                            </div>\n                        </div>\n                        <div className="pos-receipt-print-content');
  });

  it('renders receipt item lines with unit price, quantity, and total columns', () => {
    expect(receiptPrintViewContent).toContain('Unit Price');
    expect(receiptPrintViewContent).toContain('Qty');
    expect(receiptPrintViewContent).toContain('Total');
    expect(receiptPrintViewContent).not.toContain('PHP ');
    expect(receiptPrintViewContent).not.toContain('Unit:');
    expect(receiptPrintViewContent).not.toContain('Course:');
    expect(receiptPrintViewContent).toContain('resolveReceiptLineUnitPrice');
    expect(receiptPrintViewContent).toContain('resolveReceiptLineTotal');
    expect(receiptPrintViewContent).toContain('splitReceiptItemName');
    expect(receiptPrintViewContent).toContain("RECEIPT_LINE_GRID_COLUMNS = 'minmax(0, 1fr) 3.75rem 1.5rem 3.75rem'");
    expect(receiptPrintViewContent).toContain('itemNameParts.firstLine');
    expect(receiptPrintViewContent).toContain('itemNameParts.secondLine');
    expect(receiptPrintViewContent).toContain('pr-24 text-[13px] font-medium leading-snug text-slate-900');
    expect(receiptPrintViewContent).toContain('last:border-b-0 last:pb-0');
  });

  it('adds keyboard and semantic accessibility affordances in POS history table', () => {
    expect(posCheckoutTerminalContent).toContain('POSTransactionHistoryPanel');
    expect(posHistoryPanelContent).toContain('aria-label="POS transaction history table"');
    expect(posHistoryPanelContent).toContain('All Sources');
    expect(posHistoryPanelContent).toContain('Online Store');
    expect(posHistoryPanelContent).not.toContain('Online (Legacy)');
    expect(posHistoryPanelContent).toContain('aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}');
    expect(posHistoryPanelContent).toContain('<caption className="sr-only">POS transaction history with receipt and sales report actions</caption>');
    expect(posHistoryPanelContent).toContain('event.stopPropagation();');
  });

  it('keeps queue-to-receipt ownership in POSCheckoutTerminal and avoids prefetch in TerminalPage', () => {
    expect(terminalPageContent).not.toContain('fetchPosTransactionById');
    expect(
      terminalPageContent.includes('externalReceiptTransactionId={receiptRequestId}')
      || terminalPageContent.includes('receiptRequestId={receiptRequestId}')
    ).toBe(true);
    expect(posCheckoutTerminalContent).toContain('const detail = await fetchPosTransactionById(id);');
  });

  it('guards incoming queue receipt action with opening lock and lifecycle guidance copy', () => {
    expect(terminalPageContent).toContain('const [incomingReceiptOpeningId, setIncomingReceiptOpeningId] = useState(null);');
    expect(terminalPageContent).toContain('if (incomingReceiptOpeningId !== null) return;');
    expect(terminalOperationsWorkspaceContent).toContain('Opening...');
    expect(terminalSidebarPanelContent).toContain('Completed or cancelled online orders move to History/Receipt Preview.');
  });

  it('supports deep-link handoff from queue cards to filtered history view', () => {
    expect(terminalPageContent).toContain('const [historyRequestQuery, setHistoryRequestQuery] = useState(\'\');');
    expect(
      terminalPageContent.includes('externalHistoryQuery={historyRequestQuery}')
      || terminalPageContent.includes('historyRequestQuery={historyRequestQuery}')
    ).toBe(true);
    expect(terminalOperationsWorkspaceContent).toContain('Open in History');
    expect(terminalSidebarPanelContent).toContain('History');
    expect(posCheckoutTerminalContent).toContain('setHistorySearch(query);');
  });

  it('persists offline checkout intents and exposes replay affordance', () => {
    expect(posCheckoutTerminalContent).toContain('CHECKOUT_QUEUE_OPERATION = \'checkout\'');
    expect(posCheckoutTerminalContent).toContain('enqueueTerminalOperationIntent');
    expect(posCheckoutTerminalContent).toContain('TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED');
    expect(terminalPageContent).toContain("operation === 'checkout'");
    expect(terminalPageLayoutContent).toContain('queueReplayManagedExternally');
    expect(terminalOperationsWorkspaceContent).toContain("checkout: 'Checkout'");
    expect(posCheckoutTerminalContent).toContain('Replay queued checkouts');
    expect(posCheckoutTerminalContent).toContain('idempotency_key');
  });

  it('keeps scanner wedge capture and routed ticket feedback out of cart mutation', () => {
    expect(posCheckoutTerminalContent).toContain('POSBarcodeScanner');
    expect(posBarcodeScannerContent).toContain('scannerBufferRef');
    expect(posBarcodeScannerContent).toContain('submitScan(bufferedCode);');
    expect(posBarcodeScannerContent).toContain("result?.status === 'routed'");
    expect(posBarcodeScannerContent).toContain("tone: 'info'");
    expect(posBarcodeScannerContent).toContain('toast.info(message);');
  });

  it('surfaces compliance reason codes with per-blocker remediation links in terminal banner', () => {
    expect(terminalPageLayoutContent).toContain('Reason code: {complianceBlockerDetails.reasonCode}');
    expect(terminalPageLayoutContent).toContain('{blocker.label || blocker.code}');
    expect(terminalPageLayoutContent).toContain('Fix now');
    expect(terminalPageLayoutContent).toContain('onClick={() => navigate(blocker.action_target)}');
  });

  it('maps compliance policy checkout denials to explicit remediation guidance copy', () => {
    expect(posCheckoutTerminalContent).toContain('buildCompliancePolicyBlockerMessage');
    expect(posCheckoutTerminalContent).toContain('Compliance policy blocked checkout (');
    expect(posCheckoutTerminalContent).toContain('Resolve blocker in');
    expect(posCheckoutTerminalContent).toContain('BSP_OPS_REGISTRATION_REQUIRED');
  });

  it('maps F&B recipe checkout blockers to ingredient-specific cashier copy', () => {
    expect(posCheckoutTerminalContent).toContain('buildFnbRecipeBlockerMessage');
    expect(posCheckoutTerminalContent).toContain('FNB_RECIPE_INGREDIENT_SHORTFALL');
    expect(posCheckoutTerminalContent).toContain('FNB_RECIPE_UOM_INCOMPATIBLE');
    expect(posCheckoutTerminalContent).toContain('FNB_KITCHEN_ORDER_UNAVAILABLE');
  });

  it('requires terminal identity selection and propagates terminal id to checkout payload', () => {
    expect(terminalPageContent).toContain("const TERMINAL_ID_STORAGE_KEY = 'pos_terminal_identity_v1';");
    expect(terminalPageContent).toContain('pos_terminal_registry');
    expect(terminalPageContent).toContain('pos_terminal_registry_mode');
    expect(terminalPageContent).toContain('terminalRegistryMode');
    expect(terminalPageContent).toContain('registryEnforced');
    expect(terminalPageContent).toContain('terminalId: readInitialTerminalId()');
    expect(terminalPageContent).toContain('resolveLoginTerminalId');
    expect(terminalPageContent).toContain('resolvePreferredTerminalId');
    expect(terminalPageContent).toContain('No active terminals configured. Add one in Settings > POS Setup > Terminal Registry.');
    expect(terminalLockDrawerContent).toContain('Terminal ID');
    expect(terminalLockDrawerContent).not.toContain('Company Token (Optional)');
    expect(terminalLockDrawerContent).not.toContain('Terminal ID (Optional)');
    expect(terminalLockDrawerContent).toContain("registryEnforced ? 'Terminal ID (Required)' : 'Terminal ID'");
    expect(terminalLockDrawerContent).toContain('Use COUNTER-01 if no terminals are configured yet.');
    expect(terminalLockDrawerContent).toContain('registryEnforced ?');
    expect(terminalLockDrawerContent).toContain('Select configured terminal');
    expect(terminalLockDrawerContent).toContain('No active terminals configured');
    expect(terminalLockDrawerContent).toContain('list="terminal-id-options"');
    expect(terminalPageLayoutContent).toContain('normalizedActiveTerminalId');
    expect(terminalPageLayoutContent).toContain("normalizedActiveTerminalId || 'Not selected'");
    expect(terminalPageLayoutContent).not.toContain('Terminal identity: <span className="font-semibold text-slate-900">DGFY</span>');
    expect(posCheckoutTerminalContent).toContain('terminalId = \'\'');
    expect(posCheckoutTerminalContent).toContain('const terminalIdentityLabel = normalizedTerminalId');
    expect(posCheckoutTerminalContent).toContain('`Terminal ${normalizedTerminalId}`');
    expect(posCheckoutTerminalContent).toContain('terminal_id: normalizedTerminalId || undefined');
  });

  it('keeps receipt modal sales-report handoff while history rows stay receipt-focused', () => {
    expect(posCheckoutTerminalContent).toContain('openInSalesReport');
    expect(posHistoryPanelContent).not.toContain('data-testid="pos-history-open-sales-report"');
    expect(posHistoryPanelContent).not.toContain('data-testid={`pos-history-row-open-sales-report-${row.pos_transaction_id}`}');
    expect(posHistoryPanelContent).toContain('<span>View</span>');
    expect(posHistoryPanelContent).toContain('<span>Receipt</span>');
    expect(posCheckoutTerminalContent).toContain('data-testid="pos-receipt-open-sales-report"');
    expect(posCheckoutTerminalContent).toContain("params.set('source', 'POS');");
    expect(posCheckoutTerminalContent).toContain("params.set('pos_order_source', historyOrderSource);");
    expect(posCheckoutTerminalContent).toContain("openSkupervisorPath('/sales', query)");
  });

  it('exposes deterministic sidebar test hook for history mode switching', () => {
    expect(terminalWorkspaceSidebarContent).toContain('testId="pos-nav-history"');
    expect(terminalWorkspaceSidebarContent).toContain('data-testid={testId || undefined}');
  });

  it('uses adaptive responsive layout primitives and avoids hard-coded viewport math', () => {
    expect(terminalPageLayoutContent).toContain('min-h-[100dvh]');
    expect(posCheckoutTerminalContent).toContain('checkoutGridClassName');
    expect(posCheckoutTerminalContent).toContain('checkoutPaneClassName');
    expect(posCheckoutTerminalContent).not.toContain('calc(100vh-13.5rem)');
  });
});
