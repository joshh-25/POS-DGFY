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
const terminalOperationsPanelsPath = path.resolve(__dirname, '../components/TerminalOperationsPanels.jsx');
const posTenantSetupModalPath = path.resolve(__dirname, '../components/PosTenantSetupModal.jsx');
const posReportsAnalyticsWorkspacePath = path.resolve(__dirname, '../components/PosReportsAnalyticsWorkspace.jsx');
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
  let terminalOperationsPanelsContent = '';
  let posTenantSetupModalContent = '';
  let posReportsAnalyticsWorkspaceContent = '';
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
    terminalOperationsPanelsContent = fs.readFileSync(terminalOperationsPanelsPath, 'utf8');
    posTenantSetupModalContent = fs.readFileSync(posTenantSetupModalPath, 'utf8');
    posReportsAnalyticsWorkspaceContent = fs.readFileSync(posReportsAnalyticsWorkspacePath, 'utf8');
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
    expect(terminalPageContent).toContain("'settings_profile'");
    expect(terminalPageContent).toContain("'settings_pos'");
    expect(terminalPageContent).toContain("'settings_storefront'");
    expect(terminalPageContent).toContain("'shift_controls'");
    expect(terminalPageContent).toContain("'reports'");
  });

  it('keeps always-available items sellable across both POS checkout surfaces', () => {
    expect(terminalOperationsWorkspaceContent).toContain('pos_always_available');
    expect(terminalOperationsWorkspaceContent).toContain('Always Available');
    expect(terminalOperationsWorkspaceContent).toContain('max_capacity: Math.max(resolvedStock, 1)');
    expect(posCheckoutTerminalContent).toContain("item?.pos_always_available === true");
    expect(skupervisorCheckoutTerminalContent).toContain("item?.pos_always_available === true");
  });


  it('validates POS onboarding starter item cost and stock before calling the onboarding API', () => {
    expect(posTenantSetupModalContent).toContain('const parsedCost = cost === \'\' ? null : Number(cost);');
    expect(posTenantSetupModalContent).toContain('const parsedStock = stock === \'\' ? 0 : Number(stock);');
    expect(posTenantSetupModalContent).toContain("toast.error('Starter item cost cannot be negative.');");
    expect(posTenantSetupModalContent).toContain("toast.error('Starter item stock cannot be negative.');");
    expect(posTenantSetupModalContent).toContain('current_stock: parsedStock');
    expect(posTenantSetupModalContent).toContain('if (parsedCost !== null) row.cost_per_unit = parsedCost;');
  });

  it('keeps tenant onboarding restriction tied to live readiness state, not only the URL query', () => {
    expect(terminalPageContent).toContain('const tenantSetupIncomplete = !setupFlowState.loading');
    expect(terminalPageContent).toContain('const tenantSetupRequestedOrRequired = tenantSetupFlowRequested || tenantSetupIncomplete;');
    expect(terminalPageContent).toContain("const PosTenantSetupModal = lazy(() => import('../components/PosTenantSetupModal.jsx'));");
    expect(terminalPageContent).toContain('if (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.COMPLETE) {');
    expect(terminalPageContent).toContain('clearTenantSetupQueryState();');
    expect(terminalPageContent).not.toContain('shouldForceSelectedTenantOnboarding');
    expect(terminalPageContent).toContain('if (setupFlowActive) {');
    expect(terminalPageContent).toContain('resumeTenantSetupFlow();');
  });

  it('gives a saved full-auth terminal lock precedence over onboarding state', () => {
    expect(terminalPageContent).toContain("if (storedLockActiveAtStart && ['full_auth', 'shift_closed'].includes(storedReasonAtStart)) {");
    expect(terminalPageContent).toContain("if (storedLockReason === 'full_auth' || storedLockReason === 'shift_closed') {");
    expect(terminalPageContent).toContain('setTerminalUnlockRequired(false);');
    expect(terminalPageContent).toContain('setTerminalUnlockModalOpen(false);');
    expect(terminalPageContent).toContain('setDrawerOpen(true);');
  });

  it('keeps admin setup readiness out of the non-admin DGFY cashier unlock path', () => {
    expect(terminalPageContent).toContain('const loginResult = await loginDgfyAccount({ email, password });');
    expect(terminalPageContent).toContain("toast.error('Unable to start DGFY session. Sign in again.');");
    expect(terminalPageContent).toContain('const continuingAfterCompanyPicker = dgfyPosState.authenticated === true;');
    expect(terminalPageContent).toContain("toast.message('Confirm the company, then continue to POS.');");
    expect(terminalPageContent).toContain('if (!continuingAfterCompanyPicker) {');
    expect(terminalPageContent).toContain('const selectedTenantSession = await startDgfyTenantSession({');
    expect(terminalPageContent).toContain('const effectiveSelectedTenantUser = selectedTenantUser || fallbackSelectedTenantUser;');
    expect(terminalPageContent).toContain('const selectedTenantAdminPayloads = selectedUserIsAdmin');
    expect(terminalPageContent).toContain(': [null, effectiveSelectedTenantUser ? [effectiveSelectedTenantUser] : []];');
    expect(terminalPageContent).toContain('const selectedTenantSetupState = buildTenantSetupStateSnapshot({');
    expect(terminalPageContent).toContain('&& selectedTenantSetupStep !== POS_TERMINAL_SETUP_STEPS.COMPLETE');
    expect(terminalPageContent).toContain('usersPayload: selectedTenantUsers');
    expect(terminalPageContent).toContain('const selectedTenantRegistry = normalizeTerminalRegistry(selectedTenantSettings?.pos_terminal_registry?.value || []);');
    expect(terminalPageContent).toContain("source: 'dgfy_pos'");
    expect(terminalPageContent).toContain("window.localStorage.removeItem(TERMINAL_ID_STORAGE_KEY);");
    expect(terminalPageContent).toContain("{ registryMode: setupFlowActive ? 'enforce' : 'warn' }");
    expect(terminalPageContent).not.toContain("toast.error('POS setup is incomplete. An active terminal and cashier account are required before terminal unlock.');");
    expect(terminalPageContent).toContain('const posSession = await startDgfyPosSession({');
    expect(terminalPageContent).toContain('const posOnboardingUrl = resolvePosTerminalUrl(POS_ONBOARDING_ENTRY_SEARCH);');
    expect(terminalPageContent).toContain('window.location.assign(targetUrl.toString());');
    expect(terminalPageContent).toContain("pathname: '/terminal',");
    expect(terminalPageContent).toContain('search: POS_ONBOARDING_ENTRY_SEARCH');
    expect(terminalPageContent).toContain('setTerminalUnlockModalOpen(true);');
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
    expect(terminalPageLayoutContent).toContain('touch-pan-y ${workspaceDesktopOverflowClassName} ${lockedSurfaceClassName}');
  });

  it('persists manual POS terminal lock across refresh until login succeeds', () => {
    expect(terminalPageContent).toContain("const TERMINAL_LOCK_STORAGE_KEY = 'pos_terminal_locked_v1';");
    expect(terminalPageContent).toContain('readStoredTerminalLock() || !getAccessToken()');
    expect(terminalPageContent).toContain('setStoredTerminalLock(true);');
    expect(terminalPageContent).toContain('setStoredTerminalLock(false);');
    expect(terminalPageContent).toContain("if (storedLockActiveAtStart && ['full_auth', 'shift_closed'].includes(storedReasonAtStart)) {");
    expect(terminalPageContent).toContain("api.post('/auth/logout')");
    expect(terminalPageContent).toContain('logoutDgfyAccount(activeDgfyToken)');
    expect(terminalPageContent).toContain("reason: 'terminal_lock'");
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
    expect(terminalPageContent).toContain("if (!canViewPos && ['incoming_queue'].includes(posViewMode)) {");
  });

  it('does not load compliance gate context or block POS checkout from terminal readiness', () => {
    expect(terminalPageContent).not.toContain('getComplianceProfile');
    expect(terminalPageContent).not.toContain('loadError: true');
    expect(terminalPageContent).not.toContain("code: 'COMPLIANCE_GATE_UNAVAILABLE'");
    expect(terminalPageContent).not.toContain("if (complianceGate.loadError) return 'Compliance status is unavailable. Please refresh and retry.';");
    expect(terminalPageContent).not.toContain("title: 'Compliance gate unavailable'");
    expect(terminalPageContent).not.toContain('complianceBlockerDetails');
  });

  it('keeps incoming queue and protected sidebar items permission-aware', () => {
    expect(terminalWorkspaceSidebarContent).toContain("disabled={locked || !isOnline || onboardingRestricted || !canViewPos || !navigationShiftReady}");
    expect(terminalWorkspaceSidebarContent).toContain('POS view permission required');
    expect(terminalWorkspaceSidebarContent).toContain('Available online only');
  });

  it('does not render the cashier scroll-zone badge', () => {
    expect(terminalWorkspaceSidebarContent).not.toContain('Scroll for more terminal tools.');
    expect(terminalWorkspaceSidebarContent).not.toContain('showScrollZoneBadge');
    expect(terminalPageLayoutContent).not.toContain('showScrollZoneBadge');
  });

  it('renders forbidden/error states and transact guard in incoming queue workspace', () => {
    expect(terminalSidebarPanelContent).toContain('incomingOrdersAccessState === \'forbidden\'');
    expect(terminalSidebarPanelContent).toContain('incomingOrdersAccessState === \'error\'');
    expect(terminalSidebarPanelContent).toContain("disabled={Boolean(actionLoading) || !canTransactPos || locked}");
    expect(terminalSidebarPanelContent).toContain('You need POS transact permission to update order statuses.');
  });

  it('requires an open shift before POS sale actions are available', () => {
    expect(terminalPageContent).toContain('requiresOpenShift');
    expect(terminalPageContent).toContain('shiftOpeningModalOpen');
    expect(terminalPageContent).toContain('handleShiftOpeningModalOpenChange');
    expect(terminalPageContent).toContain('handleShiftOpeningModalSubmit');
    expect(terminalPageContent).toContain('<Dialog open={shiftOpeningModalOpen}');
    expect(terminalPageContent).toContain('canSubmitOpenShift');
    expect(terminalPageContent).toContain('required');
    expect(terminalPageContent).not.toContain('openingFloatAmount: configuredPettyCash.toFixed(2)');
    expect(terminalPageContent).toContain('No open shift is active. Enter opening cash to start a new shift before using POS.');
    expect(terminalPageContent).toContain('You cannot use the POS because the shift is closed.');
    expect(terminalPageContent).toContain('Shift opened successfully.');
    expect(terminalPageContent).toContain('terminalIdOverride: terminalId,');
    expect(terminalPageContent).toContain('operatingLocationIdOverride: scopedOperatingLocationId');
    expect(terminalPageContent).toContain('terminalIdOverride: selectedTerminalId,');
    expect(terminalPageContent).toContain('operatingLocationIdOverride,');
    expect(terminalPageContent).toContain('closeShiftConfirmOpen');
    expect(terminalPageContent).toContain('handleConfirmCloseShift');
    expect(terminalPageContent).toContain('Are you sure you want to close this shift?');
    expect(terminalPageContent).not.toContain('window.confirm');
    expect(terminalSidebarPanelContent).toContain('Shift Open');
    expect(terminalSidebarPanelContent).toContain('Shift Closed');
    expect(terminalOperationsWorkspaceContent).toContain('Shift Closed. Please open your shift before using the POS.');
    expect(terminalOperationsWorkspaceContent).toContain('isValidOpeningCashAmount');
    expect(terminalOperationsPanelsContent).toContain('shiftState = { shift: null }');
    expect(terminalOperationsWorkspaceContent).toContain('shiftState={shiftState}');
    expect(terminalOperationsWorkspaceContent).toContain('const canRenderAdminShiftOpen = canAdminBypassShiftPrompt || canTransactPos;');
    expect(terminalOperationsWorkspaceContent).toContain('disabled={shiftActionLoading.open || locked || !canRenderAdminShiftOpen}');
    expect(terminalSidebarPanelContent).toContain('isValidOpeningCashAmount');
    expect(terminalSidebarPanelContent).toContain('disabled={shiftActionLoading.open || locked || !canTransactPos}');
    expect(terminalPageContent).toContain("const canCloseShift = hasPermission('pos:shift_close') || hasPermission('pos:close_day');");
    expect(terminalPageContent).toContain('canCloseDay={canCloseShift}');
    expect(posCheckoutTerminalContent).toContain('const posActionsBlocked = Boolean(checkoutBlockedReason);');
    expect(posCheckoutTerminalContent).toContain('notifyPosActionBlocked');
    expect(posCheckoutTerminalContent).toContain('disabled={posActionsBlocked || safeCart.length === 0}');
    expect(skupervisorCheckoutTerminalContent).toContain('const posActionsBlocked = Boolean(checkoutBlockedReason);');
    expect(skupervisorCheckoutTerminalContent).toContain('notifyPosActionBlocked');
    expect(skupervisorCheckoutTerminalContent).toContain('disabled={posActionsBlocked || cart.length === 0}');
  });

  it('keeps dedicated operations workspace content mapping for every sidebar mode', () => {
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Incoming Online Queue'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Settings'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Shift Controls'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Cash Drawer Event'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Reports & Analytics'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'reports'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'incoming_queue'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'terminal_setup'");
  });

  it('adds report navigation with horizontal report tabs', () => {
    expect(terminalWorkspaceSidebarContent).toContain('testId="pos-nav-reports"');
    expect(terminalWorkspaceSidebarContent).toContain('testId="pos-nav-settings"');
    expect(terminalWorkspaceSidebarContent).toContain("onClick={() => onSelectViewMode('reports')}");
    expect(terminalWorkspaceSidebarContent).toContain("onClick={() => onSelectViewMode(settingsTargetViewMode)}");
    expect(terminalOperationsWorkspaceContent).toContain('Reports & Analytics');
    expect(posReportsAnalyticsWorkspaceContent).toContain('Daily Report');
    expect(posReportsAnalyticsWorkspaceContent).toContain('Monthly Report');
    expect(posReportsAnalyticsWorkspaceContent).toContain('Yearly Report');
    expect(posReportsAnalyticsWorkspaceContent).toContain('Sales Comparison');
    expect(posReportsAnalyticsWorkspaceContent).toContain('POS Profit/Loss');
  });

  it('keeps receipt preview empty-state branch with history fallback action', () => {
    expect(posCheckoutTerminalContent).toContain('No receipt selected yet.');
    expect(posCheckoutTerminalContent).toContain('onClick={() => setCurrentViewMode(\'history\')}');
    expect(posCheckoutTerminalContent).toContain('Go to History');
  });

  it('supports governed manual POS discounts with percentage or fixed amount entry', () => {
    expect(posCheckoutTerminalContent).toContain("const [manualDiscountMode, setManualDiscountMode] = useState('none');");
    expect(posCheckoutTerminalContent).toContain("const [manualDiscountAmountInput, setManualDiscountAmountInput] = useState('');");
    expect(posCheckoutTerminalContent).toContain('Discount Type');
    expect(posCheckoutTerminalContent).toContain('<option value="percentage">Percentage</option>');
    expect(posCheckoutTerminalContent).toContain('<option value="fixed">Fixed Amount</option>');
    expect(posCheckoutTerminalContent).toContain("['employee', 'manual'].includes(discountDraft.type)");
    expect(posCheckoutTerminalContent).toContain("discount_mode: appliedDiscount ? 'amount' : (selectedDiscount ? 'preset' : (manualDiscountAmount > 0 ? manualDiscountMode : 'none'))");
    expect(posCheckoutTerminalContent).toContain("discountDraft.method === 'fixed' ? 'Amount' : 'Rate (%)'");
    expect(posCheckoutTerminalContent).toContain('Select the discount and complete all required verification details.');
  });

  it('keeps history receipt modal close action in the header and print action in the footer', () => {
    expect(posCheckoutTerminalContent).toContain('aria-label="Close receipt preview"');
    expect(posCheckoutTerminalContent).toContain("onClick={() => handlePrintReceipt(lastReceipt, 'history_modal')}");
    expect(posCheckoutTerminalContent).toContain("{receiptPrinting ? 'Printing...' : 'Print'}");
    expect(posCheckoutTerminalContent).not.toContain('<X className="h-5 w-5" />\n                                </button>\n                            </div>\n                        </div>\n                        <div className="pos-receipt-print-content');
  });

  it('opens checkout confirmation and then receipt preview after a successful sale', () => {
    expect(posCheckoutTerminalContent).toContain('setCheckoutConfirmModalOpen(true);');
    expect(posCheckoutTerminalContent).toMatch(
      /setCheckoutConfirmModalOpen\(false\);[\s\S]*?setReceiptPreviewModalOpen\(true\);[\s\S]*?if \(typeof onCheckoutCompleted/
    );
  });

  it('opens receipt history details instead of printing from the View Receipt action', () => {
    expect(posHistoryPanelContent).toContain('openHistoryDetail(row);');
    expect(posHistoryPanelContent).not.toMatch(
      /if \(typeof printHistoryReceipt === 'function'\)[\s\S]*?openHistoryDetail\(row\.pos_transaction_id\)/
    );
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
    expect(receiptPrintViewContent).toContain("RECEIPT_LINE_GRID_COLUMNS = 'minmax(0, 1fr) 3.25rem 1.25rem 3.25rem'");
    expect(receiptPrintViewContent).toContain('itemNameParts.firstLine');
    expect(receiptPrintViewContent).toContain('itemNameParts.secondLine');
    expect(receiptPrintViewContent).toContain('min-w-0 truncate font-medium leading-snug text-slate-900');
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

  it('opens active queue orders in TerminalPage without routing them through receipt history', () => {
    expect(terminalPageContent).toContain('const detail = await fetchPosTransactionById(normalizedId);');
    expect(terminalPageContent).toContain('<OnlineOrderDetailsModal');
    expect(terminalPageContent).not.toContain('handleOpenIncomingOrderHistory');
  });

  it('guards incoming queue receipt action with opening lock and lifecycle guidance copy', () => {
    expect(terminalPageContent).toContain('const [incomingReceiptOpeningId, setIncomingReceiptOpeningId] = useState(null);');
    expect(terminalPageContent).toContain('if (incomingReceiptOpeningId !== null) return;');
    expect(terminalOperationsPanelsContent).toContain('Opening...');
    expect(terminalSidebarPanelContent).toContain('Completed or cancelled online orders move to History/Receipt Preview.');
  });

  it('keeps completed receipt history out of the active queue', () => {
    expect(terminalPageContent).not.toContain('handleOpenIncomingOrderHistory');
    expect(terminalOperationsPanelsContent).not.toContain('history_receipt');
    expect(terminalSidebarPanelContent).not.toContain('history_receipt');
    expect(posCheckoutTerminalContent).toContain('setHistorySearch(query);');
  });

  it('persists offline checkout intents and exposes the manual universal sync policy', () => {
    expect(posCheckoutTerminalContent).toContain('CHECKOUT_QUEUE_OPERATION = \'checkout\'');
    expect(posCheckoutTerminalContent).toContain('enqueueTerminalOperationIntent');
    expect(posCheckoutTerminalContent).toContain('TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED');
    expect(terminalPageContent).toContain(".filter((candidate) => String(candidate?.operation || '').trim() !== 'checkout')");
    expect(posHistoryPanelContent).toContain('Sync All Pending Records');
    expect(posHistoryPanelContent).toContain('universalPendingSyncCount');
    expect(terminalPageContent).toContain('consumeManualPosSyncAttempt');
    expect(terminalPageContent).not.toContain('requestBackgroundQueueReplay');
    expect(posCheckoutTerminalContent).toContain('pending transaction');
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

  it('does not render compliance gate reminders in the terminal banner or notification tray', () => {
    expect(terminalPageLayoutContent).not.toContain('complianceBlockerDetails');
    expect(terminalPageLayoutContent).not.toContain("id: 'compliance-blocked'");
    expect(terminalPageLayoutContent).not.toContain('Fix now');
    expect(terminalPageLayoutContent).not.toContain('Open compliance settings');
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
    expect(terminalPageContent).toContain('Terminal ID');
    expect(terminalPageContent).toContain('Select registered terminal');
    expect(terminalPageContent).toContain('Enter the registered terminal ID from POS Setup. Example: `COUNTER-01`.');
    expect(terminalPageContent).toContain('Authorized DGFY users can open shifts from any logged-in device');
    expect(terminalPageContent).toContain('This terminal has no assigned store location. Set the location in POS Setup > Terminal Registry.');
    expect(terminalPageContent).toContain('Cashier Email');
    expect(terminalPageContent).toContain('Cashier Password');
    expect(terminalLockDrawerContent).not.toContain('Company Token (Optional)');
    expect(terminalLockDrawerContent).toContain('DGFY or Cashier Email');
    expect(terminalLockDrawerContent).toContain('Company');
    expect(terminalLockDrawerContent).toContain('Continue to POS');
    expect(terminalLockDrawerContent).toContain('Select accessible company');
    expect(terminalPageLayoutContent).toContain('normalizedActiveTerminalId');
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
    expect(terminalWorkspaceSidebarContent).toContain('testId="pos-nav-settings"');
    expect(terminalWorkspaceSidebarContent).toContain('data-testid={testId || undefined}');
  });

  it('uses adaptive responsive layout primitives and avoids hard-coded viewport math', () => {
    expect(terminalPageLayoutContent).toContain('min-h-[100dvh]');
    expect(posCheckoutTerminalContent).toContain('checkoutGridClassName');
    expect(posCheckoutTerminalContent).toContain('checkoutPaneClassName');
    expect(posCheckoutTerminalContent).not.toContain('calc(100vh-13.5rem)');
  });
});
