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
  });

  it('blocks sidebar view switching while terminal is locked', () => {
    expect(terminalPageContent).toContain('if (locked) {');
    expect(terminalPageContent).toContain('setMobileNavOpen(false);');
    expect(terminalPageContent).toContain('return;');
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
    expect(terminalWorkspaceSidebarContent).toContain("disabled={locked || !canViewPos}");
    expect(terminalWorkspaceSidebarContent).toContain('POS view permission required');
  });

  it('keeps cashier scroll-zone badge contextual to desktop sidebar usage', () => {
    expect(terminalWorkspaceSidebarContent).toContain('showScrollZoneBadge = true');
    expect(terminalWorkspaceSidebarContent).not.toContain('Scroll zone');
    expect(terminalPageLayoutContent).toContain('showScrollZoneBadge={false}');
    expect(terminalPageLayoutContent).toContain('showScrollZoneBadge');
  });

  it('renders forbidden/error states and transact guard in incoming queue workspace', () => {
    expect(terminalSidebarPanelContent).toContain('incomingOrdersAccessState === \'forbidden\'');
    expect(terminalSidebarPanelContent).toContain('incomingOrdersAccessState === \'error\'');
    expect(terminalSidebarPanelContent).toContain("disabled={Boolean(actionLoading) || !canTransactPos || locked}");
    expect(terminalSidebarPanelContent).toContain('You need POS transact permission to update order statuses.');
  });

  it('keeps dedicated operations workspace content mapping for every sidebar mode', () => {
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Incoming Online Queue'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Location Scope'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Shift Controls'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Cash Drawer Event'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Close Shift'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Sales Today'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Terminal Setup Context'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'incoming_queue'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'terminal_setup'");
  });

  it('keeps receipt preview empty-state branch with history fallback action', () => {
    expect(posCheckoutTerminalContent).toContain('No receipt selected yet.');
    expect(posCheckoutTerminalContent).toContain('onClick={() => setCurrentViewMode(\'history\')}');
    expect(posCheckoutTerminalContent).toContain('Go to History');
  });

  it('adds keyboard and semantic accessibility affordances in POS history table', () => {
    expect(posCheckoutTerminalContent).toContain('POSTransactionHistoryPanel');
    expect(posHistoryPanelContent).toContain('aria-label="POS transaction history table"');
    expect(posHistoryPanelContent).toContain('All Sources');
    expect(posHistoryPanelContent).toContain('Online Store');
    expect(posHistoryPanelContent).not.toContain('Online (Legacy)');
    expect(posHistoryPanelContent).toContain('aria-label={`Open actions for ${row.invoice_number || row.pos_transaction_id}`}');
    expect(posHistoryPanelContent).toContain('data-testid={`pos-history-row-open-sales-report-${row.pos_transaction_id}`}');
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
    expect(posBarcodeScannerContent).toContain('setScannerCode(nextCode);');
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
    expect(terminalPageContent).toContain('terminalId: readStoredTerminalId()');
    expect(terminalLockDrawerContent).toContain('Terminal ID');
    expect(terminalLockDrawerContent).not.toContain('Company Token (Optional)');
    expect(terminalLockDrawerContent).toContain("registryEnforced ? 'Terminal ID (Required)' : 'Terminal ID (Optional)'");
    expect(terminalLockDrawerContent).toContain('registryEnforced ?');
    expect(terminalLockDrawerContent).toContain('Select configured terminal');
    expect(terminalLockDrawerContent).toContain('list="terminal-id-options"');
    expect(terminalPageLayoutContent).not.toContain('normalizedActiveTerminalId');
    expect(terminalPageLayoutContent).not.toContain('Terminal identity: <span className="font-semibold text-slate-900">DGFY</span>');
    expect(posCheckoutTerminalContent).toContain('terminalId = \'\'');
    expect(posCheckoutTerminalContent).toContain('const terminalIdentityLabel = normalizedTerminalId');
    expect(posCheckoutTerminalContent).toContain('`Terminal ${normalizedTerminalId}`');
    expect(posCheckoutTerminalContent).toContain('buildPosCheckoutPayload');
    expect(posCheckoutTerminalContent).toContain('terminalId: normalizedTerminalId');
  });

  it('supports history/receipt handoff into unified sales report with preserved query params', () => {
    expect(posCheckoutTerminalContent).toContain('openInSalesReport');
    expect(posHistoryPanelContent).toContain('data-testid="pos-history-open-sales-report"');
    expect(posHistoryPanelContent).toContain('data-testid={`pos-history-row-open-sales-report-${row.pos_transaction_id}`}');
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
    expect(terminalPageLayoutContent).toContain("xl:grid ${effectiveSidebarCollapsed ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[244px_minmax(0,1fr)]'}");
    expect(posCheckoutTerminalContent).toContain('checkoutGridClassName');
    expect(posCheckoutTerminalContent).not.toContain('splitPaneScrollClassName');
    expect(posCheckoutTerminalContent).not.toContain('calc(100vh-13.5rem)');
  });
});
