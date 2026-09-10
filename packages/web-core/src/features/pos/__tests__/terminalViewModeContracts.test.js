import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const terminalPagePath = path.resolve(__dirname, '../pages/TerminalPage.jsx');
const terminalPageDialogLayerPath = path.resolve(__dirname, '../components/TerminalPageDialogLayer.jsx');
const terminalWorkspaceSidebarPath = path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx');
const terminalSidebarPanelPath = path.resolve(__dirname, '../components/TerminalSidebarPanel.jsx');
const terminalOperationsWorkspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const terminalOperationsPanelsPath = path.resolve(__dirname, '../components/TerminalOperationsPanels.jsx');
// Phase 231 (#1289), §2.7: the split view's order-card grid (payment status, print actions, the
// empty-queue lifecycle copy) lives in this pure extraction, used only by the split view now that
// Phase 230 (#1288, below) reverted the tab view's own card rendering back to inline. A handful of
// this file's assertions target that content directly and read this file for it.
const incomingQueueOrderListPath = path.resolve(__dirname, '../components/IncomingQueueOrderList.jsx');
// Phase 230 (#1288) extracted the incoming-queue per-order action-button construction out of
// TerminalOperationsPanels.jsx into this shared, behavior-preserving pure function (reused by the
// new table view mode too) -- concatenated into terminalOperationsPanelsContent below, same
// pattern terminalPageContent already uses for its own multi-file join, so the source-content
// assertions below still hold without caring which file actually owns the string.
const incomingQueueOrderActionsPath = path.resolve(__dirname, '../utils/incomingQueueOrderActions.js');
const posTenantSetupModalPath = path.resolve(__dirname, '../components/PosTenantSetupModal.jsx');
const posReportsAnalyticsWorkspacePath = path.resolve(__dirname, '../components/PosReportsAnalyticsWorkspace.jsx');
const posCheckoutTerminalPath = path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx');
const posCheckoutTerminalViewPath = path.resolve(__dirname, '../components/POSCheckoutTerminalView.jsx');
const posDiscountWorkspacePath = path.resolve(__dirname, '../components/POSDiscountWorkspace.jsx');
const posCheckoutTerminalReceiptDialogsPath = path.resolve(__dirname, '../components/POSCheckoutTerminalReceiptDialogs.jsx');
const posCheckoutWorkflowPath = path.resolve(__dirname, '../hooks/usePosCheckoutWorkflow.js');
const posHistoryVoidWorkflowPath = path.resolve(__dirname, '../hooks/usePosHistoryVoidWorkflow.js');
const posCheckoutTerminalQueuePath = path.resolve(__dirname, '../utils/posCheckoutTerminalQueue.js');
const posCheckoutTerminalUtilsPath = path.resolve(__dirname, '../utils/posCheckoutTerminalUtils.js');
const skupervisorCheckoutTerminalPath = path.resolve(__dirname, '../components/SkupervisorPOSCheckoutTerminal.jsx');
const receiptPrintViewPath = path.resolve(__dirname, '../components/ReceiptPrintView.jsx');
const posBarcodeScannerPath = path.resolve(__dirname, '../components/POSBarcodeScanner.jsx');
const posHistoryPanelPath = path.resolve(__dirname, '../components/POSTransactionHistoryPanel.jsx');
const terminalPageLayoutPath = path.resolve(__dirname, '../components/TerminalPageLayout.jsx');
const terminalLockDrawerPath = path.resolve(__dirname, '../components/TerminalLockDrawer.jsx');
const onlineOrderDetailsModalPath = path.resolve(__dirname, '../components/OnlineOrderDetailsModal.jsx');
const onlineOrderReceiptModalPath = path.resolve(__dirname, '../components/OnlineOrderReceiptModal.jsx');
const posServicePath = path.resolve(__dirname, '../services/posService.js');
const posCheckoutErrorMessagesPath = path.resolve(__dirname, '../utils/posCheckoutErrorMessages.js');
const posShiftCloseResolutionPath = path.resolve(__dirname, '../utils/posShiftCloseResolution.js');

describe('POS terminal view-mode contracts', () => {
  let terminalPageContent = '';
  let terminalWorkspaceSidebarContent = '';
  let terminalSidebarPanelContent = '';
  let terminalOperationsWorkspaceContent = '';
  let terminalOperationsPanelsContent = '';
  let incomingQueueOrderListContent = '';
  let posTenantSetupModalContent = '';
  let posReportsAnalyticsWorkspaceContent = '';
  let posCheckoutTerminalContent = '';
  let posCheckoutTerminalReceiptDialogsContent = '';
  let posCheckoutWorkflowContent = '';
  let posHistoryVoidWorkflowContent = '';
  let posCheckoutTerminalQueueContent = '';
  let posCheckoutTerminalUtilsContent = '';
  let posCheckoutErrorMessagesContent = '';
  let skupervisorCheckoutTerminalContent = '';
  let receiptPrintViewContent = '';
  let posBarcodeScannerContent = '';
  let posHistoryPanelContent = '';
  let terminalPageLayoutContent = '';
  let terminalLockDrawerContent = '';
  let onlineOrderDetailsModalContent = '';
  let onlineOrderReceiptModalContent = '';
  let posServiceContent = '';
  let posShiftCloseResolutionContent = '';

  beforeAll(() => {
    terminalPageContent = [terminalPagePath, terminalPageDialogLayerPath]
      .map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'))
      .join('\n');
    terminalWorkspaceSidebarContent = fs.readFileSync(terminalWorkspaceSidebarPath, 'utf8');
    terminalSidebarPanelContent = fs.readFileSync(terminalSidebarPanelPath, 'utf8');
    terminalOperationsWorkspaceContent = fs.readFileSync(terminalOperationsWorkspacePath, 'utf8');
    terminalOperationsPanelsContent = [terminalOperationsPanelsPath, incomingQueueOrderActionsPath]
      .map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'))
      .join('\n');
    incomingQueueOrderListContent = fs.readFileSync(incomingQueueOrderListPath, 'utf8');
    posTenantSetupModalContent = fs.readFileSync(posTenantSetupModalPath, 'utf8');
    posReportsAnalyticsWorkspaceContent = fs.readFileSync(posReportsAnalyticsWorkspacePath, 'utf8');
    posCheckoutTerminalContent = [posCheckoutTerminalPath, posCheckoutTerminalViewPath, posDiscountWorkspacePath]
      .map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'))
      .join('\n');
    posCheckoutTerminalReceiptDialogsContent = fs.readFileSync(posCheckoutTerminalReceiptDialogsPath, 'utf8');
    posCheckoutWorkflowContent = fs.readFileSync(posCheckoutWorkflowPath, 'utf8');
    posHistoryVoidWorkflowContent = fs.readFileSync(posHistoryVoidWorkflowPath, 'utf8');
    posCheckoutTerminalQueueContent = fs.readFileSync(posCheckoutTerminalQueuePath, 'utf8');
    posCheckoutTerminalUtilsContent = fs.readFileSync(posCheckoutTerminalUtilsPath, 'utf8');
    posCheckoutErrorMessagesContent = fs.readFileSync(posCheckoutErrorMessagesPath, 'utf8');
    skupervisorCheckoutTerminalContent = fs.readFileSync(skupervisorCheckoutTerminalPath, 'utf8');
    receiptPrintViewContent = fs.readFileSync(receiptPrintViewPath, 'utf8');
    posBarcodeScannerContent = fs.readFileSync(posBarcodeScannerPath, 'utf8');
    posHistoryPanelContent = fs.readFileSync(posHistoryPanelPath, 'utf8');
    terminalPageLayoutContent = fs.readFileSync(terminalPageLayoutPath, 'utf8');
    terminalLockDrawerContent = fs.readFileSync(terminalLockDrawerPath, 'utf8');
    onlineOrderDetailsModalContent = fs.readFileSync(onlineOrderDetailsModalPath, 'utf8');
    onlineOrderReceiptModalContent = fs.readFileSync(onlineOrderReceiptModalPath, 'utf8');
    posServiceContent = fs.readFileSync(posServicePath, 'utf8');
    posShiftCloseResolutionContent = fs.readFileSync(posShiftCloseResolutionPath, 'utf8');
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

  it('limits the attendance banner and break action to the Shift workspace', () => {
    expect(terminalPageLayoutContent).toContain("const SHIFT_WORKSPACE_MODES = new Set(['shift_controls', 'close_shift', 'cash_drawer']);");
    expect(terminalPageLayoutContent).toContain('{!locked && SHIFT_WORKSPACE_MODES.has(posViewMode) ? (');
    expect(terminalPageLayoutContent).not.toContain('{!locked ? (\n        <PosAttendancePanel');
  });

  it('keeps the online queue out of Services while retaining it for MSME/counter POS', () => {
    expect(terminalPageContent).toContain('isPosOnlineOrderQueueEnabled');
    expect(terminalPageContent).toContain('workflowMode,\n    posDefaults: modePosDefaults');
    expect(terminalPageContent).toContain("workflowScopedModes.filter((mode) => mode !== 'incoming_queue')");
    expect(terminalPageContent).toContain('if (!onlineOrderQueueEnabled) return undefined;');
    expect(terminalPageContent).toContain("accessState: 'not_applicable'");
    expect(terminalPageContent).toContain('showIncomingQueue={onlineOrderQueueEnabled}');
    expect(terminalPageLayoutContent).toContain('showIncomingQueue={showIncomingQueue}');
    expect(terminalPageLayoutContent).toContain('showIncomingQueue && Array.isArray(incomingOrdersState?.orders)');
    expect(terminalPageContent).toContain("const MSME_OPERATIONS_VIEW_MODES = ['incoming_queue'");
    expect(terminalWorkspaceSidebarContent).toContain('const shouldShowIncomingQueue = showIncomingQueue;');
    expect(terminalWorkspaceSidebarContent).not.toContain('const shouldShowIncomingQueue = showIncomingQueue && !isMsmeMode;');
    expect(terminalWorkspaceSidebarContent).toContain('{shouldShowIncomingQueue && (');
    expect(terminalSidebarPanelContent).not.toContain("new Set(['incoming_queue'");
    expect(terminalOperationsWorkspaceContent).not.toContain("new Set(['incoming_queue'");
  });

  it('keeps MSME configuration views accessible instead of redirecting them to Shift', () => {
    const restrictedModes = terminalOperationsWorkspaceContent.match(
      /const restrictedMsmeModes = new Set\(\[([^\]]*)\]\);/
    )?.[1] || '';

    expect(restrictedModes).not.toContain('settings_profile');
    expect(restrictedModes).not.toContain('settings_pos');
    expect(restrictedModes).not.toContain('settings_storefront');
    expect(terminalPageContent).toContain("'settings_affiliates'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'settings_profile':");
    expect(terminalOperationsWorkspaceContent).toContain("case 'settings_pos':");
    expect(terminalOperationsWorkspaceContent).toContain("case 'settings_storefront':");
    expect(terminalOperationsWorkspaceContent).toContain("case 'settings_affiliates':");
  });

  // #732: Vouchers/Pricelists promoted out of the Settings tab strip to their own top-level nav
  // modes, mirroring settings_affiliates's own earlier promotion exactly.
  it('promotes Vouchers and Pricelists to top-level nav modes, out of the Settings tab strip', () => {
    expect(terminalPageContent).toContain("'settings_vouchers'");
    expect(terminalPageContent).toContain("'settings_pricelists'");
    expect(terminalOperationsWorkspaceContent).toContain("case 'settings_vouchers':");
    expect(terminalOperationsWorkspaceContent).toContain("case 'settings_pricelists':");
    expect(terminalPageContent).toContain('const canViewVouchers');
    expect(terminalWorkspaceSidebarContent).toContain('canViewVouchers');
    expect(terminalWorkspaceSidebarContent).toContain("onSelectViewMode('settings_vouchers')");
    expect(terminalWorkspaceSidebarContent).toContain("onSelectViewMode('settings_pricelists')");
    // The tab strip's own entries are gone -- these were previously reached via
    // `{ id: 'vouchers', ... }` / `{ id: 'pricelists', ... }` inside SETTINGS_TABS. Narrowed
    // (RF-7, PR #762 review) to the exact tab-entry construct rather than a whole-file negative
    // substring match, which would fail for a reason unrelated to #732 the moment any other
    // unrelated `id: 'vouchers'` (a form field, a section anchor, a test hook) is ever added.
    expect(terminalOperationsWorkspaceContent).not.toMatch(/\{\s*id:\s*'vouchers',\s*label:/);
    expect(terminalOperationsWorkspaceContent).not.toMatch(/\{\s*id:\s*'pricelists',\s*label:/);
  });

  it('keeps always-available items sellable across both POS checkout surfaces', () => {
    expect(terminalOperationsWorkspaceContent).toContain('pos_always_available');
    expect(terminalOperationsWorkspaceContent).toContain('Always Available');
    expect(terminalOperationsWorkspaceContent).toContain('max_capacity: Math.max(resolvedStock, 1)');
    expect(posCheckoutTerminalContent).toContain("item?.pos_always_available === true");
    expect(skupervisorCheckoutTerminalContent).toContain("item?.pos_always_available === true");
  });

  it('uses the iMin drawer bridge before the USB bridge for cash-in events', () => {
    expect(terminalPageContent).toContain("import { openDrawerWithIminBridge } from '../utils/iminHardwareBridge.js';");
    expect(terminalPageContent).toContain(
      "const iminDrawerResult = await openDrawerWithIminBridge();\n          if (!iminDrawerResult.handled) {\n            await openPosDeviceDrawer({"
    );
  });

  it('returns a signed-in cashier to terminal login before opening a shift', () => {
    expect(terminalPageContent).toContain('Cashier signed in:');
    expect(terminalPageContent).toContain("cashierUnlockSession?.email && terminalUnlockMode === 'shift_start'");
    expect(terminalPageContent).toContain('cashierResumeUnlock');
    expect(terminalPageContent).toContain('const handleLock');
    expect(terminalPageContent).toContain('forceLogin: true');
    expect(terminalPageContent).toContain('Back to Login');
  });


  it('keeps starter-item creation out of the POS onboarding modal', () => {
    expect(posTenantSetupModalContent).not.toContain('bulkCreateOnboardingItems');
    expect(posTenantSetupModalContent).not.toContain('Starter item');
    expect(posTenantSetupModalContent).not.toContain('starterItemForm');
    expect(posTenantSetupModalContent).not.toContain('current_stock: parsedStock');
    expect(posTenantSetupModalContent).toContain('POS Setup');
  });

  it('keeps tenant onboarding restriction tied to live readiness state, not only the URL query', () => {
    expect(terminalPageContent).toContain('const tenantSetupIncomplete = !setupFlowState.loading');
    expect(terminalPageContent).toContain('&& !setupFlowState.onboardingCompleted');
    expect(terminalPageContent).toContain('const tenantSetupRequestedOrRequired = !setupFlowState.onboardingCompleted');
    expect(terminalPageContent).toContain("settingsPayload?.tenant_onboarding_state?.value || 'not_started'");
    expect(terminalPageContent).toContain("onboardingCompleted: onboardingState === 'completed'");
    expect(terminalPageContent).toContain('const setupFlowActive = tenantSetupRequestedOrRequired');
    expect(terminalPageContent).toContain("const PosTenantSetupModal = lazyWithChunkRetry(() => import('./PosTenantSetupModal.jsx'));");
    expect(terminalPageContent).toContain('if (tenantSetupStep === POS_TERMINAL_SETUP_STEPS.COMPLETE) {');
    expect(terminalPageContent).toContain('clearTenantSetupQueryState();');
    expect(terminalPageContent).not.toContain('shouldForceSelectedTenantOnboarding');
    expect(terminalPageContent).toContain('if (setupFlowActive) {');
    expect(terminalPageContent).toContain('resumeTenantSetupFlow();');
  });

  it('keeps intermediate setup saves silent and waits for Finish Setup before releasing the shift prompt', () => {
    expect(terminalPageContent).toContain('suppressGlobalErrors = false,\n    silent = false');
    expect(terminalPageContent).toContain('if (!silent) {\n      setSetupFlowState((prev) => ({ ...prev, loading: true }));');
    expect(terminalPageContent).toContain('hydrateTenantSetupState({ suppressGlobalErrors: true, silent: true })');
    expect(terminalPageContent).toContain('const completion = await completeOnboarding();');
    expect(terminalPageContent).toContain('tenantSetupCompletionInFlightRef.current');
    expect(terminalPageContent).toContain('await handleCompleteTenantSetup();');
    expect(posTenantSetupModalContent).toContain("finishing ? 'Finishing...' : continueLabel");
    expect(terminalPageContent).toContain("if (source === 'terminal') {");
    expect(terminalPageContent).toContain("if (source === 'location') {");
    expect(terminalPageContent).toContain(
      "refreshTenantLocations({\n        suppressGlobalErrors: true,\n        silent: true"
    );
  });

  it('waits for session and onboarding hydration before rendering the POS workspace', () => {
    const initialHydrationBlock = terminalPageContent.match(
      /const hydrateUser = useCallback\(async \(\) => \{[\s\S]*?setLocked\(false\);/
    )?.[0] || '';

    expect(terminalPageContent).toContain('const [loadingUser, setLoadingUser] = useState(true);');
    expect(terminalPageContent).toContain('const [terminalStartupReady, setTerminalStartupReady] = useState(false);');
    expect(terminalPageContent).toContain('const initialUserHydrationStartedRef = useRef(false);');
    expect(terminalPageContent).toContain('const terminalStartupLoading = !terminalStartupReady');
    expect(terminalPageContent).toContain('if (initialUserHydrationStartedRef.current) return;');
    expect(terminalPageContent).toContain('initialUserHydrationStartedRef.current = true;');
    expect(terminalPageContent).toContain('if (loadingUser) return;');
    expect(initialHydrationBlock).not.toContain('setTerminalStartupReady(false);');
    expect(terminalPageContent).not.toContain("if (locked || terminalUser?.is_master_admin !== true) {\n      setSetupFlowState({");
    expect(terminalPageContent).toContain('useLayoutEffect(() => {');
    expect(terminalPageContent).toContain('Restoring POS workspace...');
    expect(terminalPageContent).toContain('<Suspense fallback={<PosRestorationLoadingScreen />}>');
    expect(terminalPageContent).not.toContain('transition-opacity duration-300 animate-pos-overlay-fade-in');
    expect(terminalPageContent).not.toContain('border border-slate-100 animate-pos-card-scale-up');
  });

  it('restores the last POS page once on page load, without overriding navigation clicks', () => {
    expect(terminalPageContent).toContain("const POS_LAST_VIEW_STORAGE_PREFIX = 'pos_terminal_last_view_v1';");
    expect(terminalPageContent).toContain("const POS_VIEW_MODE_QUERY_KEY = 'view';");
    expect(terminalPageContent).toContain('buildPosLastViewStorageKey');
    expect(terminalPageContent).toContain('readRequestedPosView() || \'checkout\'');
    expect(terminalPageContent).toContain('readStoredPosView(posLastViewStorageKey)');
    expect(terminalPageContent).toContain('updatePosViewQuery(persistableView);');
    expect(terminalPageContent).toContain("window.history.replaceState(window.history.state, '', url);");
    expect(terminalPageContent).toContain('const hasInitializedPosViewRef = useRef(false);');
    expect(terminalPageContent).toContain('if (hasInitializedPosViewRef.current) return;');
    expect(terminalPageContent).toContain('hasInitializedPosViewRef.current = true;');
    expect(terminalPageContent).not.toContain("PIN_PROTECTED_VIEW_MODES.has(normalizedView) && (terminalMeta.loading");
    expect(terminalPageContent).toContain("const nextView = restoredView || 'checkout';");
    expect(terminalPageContent).toContain('writeStoredPosView(posLastViewStorageKey, persistableView);');
    expect(terminalPageContent).toContain("if (setupFlowActive) {");
    expect(terminalPageContent).toContain("normalizedView === 'receipt'");
  });

  it('gives a saved full-auth terminal lock precedence over onboarding state', () => {
    expect(terminalPageContent).toContain("if (!dgfyTenantId && storedLockActiveAtStart && ['full_auth', 'shift_closed'].includes(storedReasonAtStart)) {");
    expect(terminalPageContent).toContain("if (storedLockReason === 'full_auth' || storedLockReason === 'shift_closed') {");
    expect(terminalPageContent).toContain('setTerminalUnlockRequired(false);');
    expect(terminalPageContent).toContain('setTerminalUnlockModalOpen(false);');
    expect(terminalPageContent).toContain('setDrawerOpen(true);');
  });

  it('keeps admin setup readiness out of the non-admin DGFY cashier unlock path', () => {
    expect(terminalPageContent).toContain('const loginResult = await loginDgfyAccount({');
    expect(terminalPageContent).toContain('remember_device: formData.rememberDevice === true');
    expect(terminalPageContent).toContain("toast.error('Unable to start DGFY session. Sign in again.');");
    expect(terminalPageContent).toContain('const continuingAfterCompanyPicker = dgfyPosState.authenticated === true;');
    expect(terminalPageContent).toContain("toast.message('Confirm the company, then continue to POS.');");
    expect(terminalPageContent).toContain('if (!continuingAfterCompanyPicker) {');
    expect(terminalPageContent).toContain('const selectedTenantSession = await startDgfyTenantSession({');
    expect(terminalPageContent).toContain('}, token, { activate: false });');
    expect(terminalPageContent).toContain("if (!String(selectedTenantSession?.token || '').trim()) {");
    expect(terminalPageContent).toContain('const selectedTenantUser = await fetchCurrentUser(');
    expect(terminalPageContent).toContain('token: selectedTenantSession.token');
    expect(terminalPageContent).toContain('companyToken: selectedTenantSession?.company?.token');
    expect(terminalPageContent).toContain('installSession: false');
    expect(terminalPageContent).toContain('activateDgfyTenantSession(selectedTenantSession);');
    expect(terminalPageContent).toContain('The selected company session could not be verified. Sign in again.');
    expect(terminalPageContent).toContain('const effectiveSelectedTenantUser = selectedTenantUser;');
    expect(terminalPageContent).toContain('const selectedPermissionList = parseUserPermissions(effectiveSelectedTenantUser);');
    expect(terminalPageContent).toContain("selectedPermissionList.includes('settings:view')");
    expect(terminalPageContent).toContain("selectedPermissionList.includes('users:view')");
    expect(terminalPageContent).toContain(': fetchPosSettingsBootstrap(SUPPRESS_GLOBAL_ERROR_TOAST),');
    expect(terminalPageContent).toContain(': Promise.resolve(effectiveSelectedTenantUser ? [effectiveSelectedTenantUser] : [])');
    expect(terminalPageContent).toContain('const selectedTenantSetupState = buildTenantSetupStateSnapshot({');
    expect(terminalPageContent).toContain('&& selectedTenantSetupStep !== POS_TERMINAL_SETUP_STEPS.COMPLETE');
    expect(terminalPageContent).toContain('usersPayload: selectedTenantUsers');
    expect(terminalPageContent).toContain('const selectedTenantRegistry = normalizeTerminalRegistry(selectedTenantSettings?.pos_terminal_registry?.value || []);');
    expect(terminalPageContent).toContain("source: 'dgfy_pos'");
    expect(terminalPageContent).toContain("safeLocalStorageRemove(TERMINAL_ID_STORAGE_KEY);");
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
    expect(terminalPageLayoutContent).toContain("const lockedSurfaceClassName = locked ? 'pointer-events-none select-none opacity-80 blur-[2px]' : operatorMutationLocked ? 'pointer-events-none select-none opacity-80 blur-[2px]' : '';");
    expect(terminalPageLayoutContent).toContain('`${persistentSidebarClassName} ${lockedSurfaceClassName}`');
    expect(terminalPageLayoutContent).toContain("const lockedHeaderSurfaceClassName = locked ? 'pointer-events-none select-none opacity-80' : '';");
    expect(terminalPageLayoutContent).toContain('dgfy-pos-panel dgfy-pos-panel-strong sticky top-0');
    expect(terminalPageLayoutContent).not.toContain('sticky top-0 z-40 shrink-0 border-b border-pos px-4 py-2 backdrop-blur');
    expect(terminalPageLayoutContent).toContain('className={`${workspacePaneClassName} ${lockedSurfaceClassName}`}');
    expect(terminalPageLayoutContent).toContain('data-testid="pos-terminal-lock-backdrop"');
    expect(terminalPageLayoutContent).toContain('bg-slate-950/70 backdrop-blur-none');
  });

  it('remounts the POS layout after terminal unlock for Safari and PWA rendering', () => {
    expect(terminalPageContent).toContain('const [terminalLayoutEpoch, setTerminalLayoutEpoch] = useState(0);');
    expect(terminalPageContent).toContain('const terminalLayoutLockedRef = useRef(locked);');
    expect(terminalPageContent).toContain('window.requestAnimationFrame(() => {');
    expect(terminalPageContent).toContain('restoreTerminalViewportAfterUnlock({');
    expect(terminalPageContent).toContain('workspaceElement: workspacePaneRef.current');
    expect(terminalPageContent).toContain('stopViewportRecovery();');
    expect(terminalPageContent).toContain('setTerminalLayoutEpoch((current) => current + 1);');
    expect(terminalPageContent).toContain("key={locked ? 'terminal-layout-locked' : `terminal-layout-unlocked-${terminalLayoutEpoch}`}");
  });

  it('persists manual POS terminal lock across refresh until login succeeds', () => {
    expect(terminalPageContent).toContain("const TERMINAL_LOCK_STORAGE_KEY = 'pos_terminal_locked_v1';");
    expect(terminalPageContent).toContain('const [locked, setLocked] = useState(true);');
    expect(terminalPageContent).toContain('session must be validated by hydrateUser before bootstrap requests run.');
    expect(terminalPageContent).toContain('const [drawerOpen, setDrawerOpen] = useState(() => readStoredTerminalLock());');
    expect(terminalPageContent).toContain('setStoredTerminalLock(true);');
    expect(terminalPageContent).toContain('setStoredTerminalLock(false);');
    expect(terminalPageContent).toContain("if (!dgfyTenantId && storedLockActiveAtStart && ['full_auth', 'shift_closed'].includes(storedReasonAtStart)) {");
    expect(terminalPageContent).toContain("api.post('/auth/logout')");
    expect(terminalPageContent).toContain('logoutDgfyAccount(activeDgfyToken)');
    expect(terminalPageContent).toContain("reason: 'terminal_lock'");
  });

  it('finishes restoration and clears stale company identity on full cashier logout', () => {
    expect(terminalPageContent).toMatch(/const onSessionExpired = \(\) => \{[\s\S]*?setLoadingUser\(false\);[\s\S]*?setTerminalStartupReady\(true\);[\s\S]*?setLocked\(true\);/);
    expect(terminalPageContent).toMatch(/setStoredTerminalLockReason\('full_auth'\);[\s\S]*?setDgfyPosState\(\{[\s\S]*?authenticated: false,[\s\S]*?companies: \[\],[\s\S]*?setFormData\(\{[\s\S]*?email: '',[\s\S]*?dgfyTenantId: '',[\s\S]*?setTerminalStartupReady\(true\);[\s\S]*?clearDgfySession\(\);[\s\S]*?reason: 'logout'/);
  });

  it('checks current shift before requiring a loaded operating location', () => {
    expect(terminalPageContent).toContain('const currentShiftParams = scopedOperatingLocationId');
    expect(terminalPageContent).toContain(': { terminal_id: terminalId };');
    expect(terminalPageContent).toContain('const currentShiftResult = await fetchCurrentTerminalShift(');
    expect(terminalPageContent).toContain('const effectiveLocationId = Number.isInteger(shiftLocationId) && shiftLocationId > 0');
    expect(terminalPageContent).not.toContain('if (!scopedOperatingLocationId) {');
  });

  it('keeps stale shift recovery master-only, audited, and isolated from generic shift actions', () => {
    expect(terminalPageContent).toContain('canRecoverStaleShifts={terminalUser?.is_master_admin === true}');
    expect(terminalPageContent).toContain('includeServerParkedSales = true');
    expect(posShiftCloseResolutionContent).toContain('if (!isOnline || !includeServerParkedSales)');
    expect(terminalPageContent).toMatch(/getShiftCloseResolutionState\(\{[\s\S]*?shiftId: normalizedShiftId,[\s\S]*?includeServerParkedSales: false[\s\S]*?\}\);/);
    expect(terminalOperationsWorkspaceContent).toContain('Branch Shift Monitor');
    expect(terminalOperationsWorkspaceContent).toContain('Recover Stale Shift');
    expect(terminalOperationsWorkspaceContent).toContain('Force Close Stale Shift');
    expect(terminalOperationsWorkspaceContent).toContain('Opened by');
    expect(terminalOperationsWorkspaceContent).toContain('staleRecoveryForm.reason.trim().length < 8');
    expect(posServiceContent).toContain('`/pos/terminal/shifts/${shiftId}/force-close`');
  });

  it('enforces incoming queue access-state handling in TerminalPage', () => {
    expect(terminalPageContent).toContain("accessState: 'forbidden'");
    expect(terminalPageContent).toContain("accessState: 'allowed'");
    expect(terminalPageContent).toContain("accessState: isShiftUnavailable ? 'shift_required' : (isForbidden ? 'forbidden' : 'error')");
    expect(terminalPageContent).toContain("if (!canViewPos && ['incoming_queue'].includes(posViewMode)) {");
  });

  it('stops incoming-order polling after a closed-shift response and resumes for a new shift', () => {
    expect(terminalPageContent).toContain('incomingOrdersShiftBlockedRef');
    expect(terminalPageContent).toContain('hasUsableIncomingOrderShift({');
    expect(terminalPageContent).toContain('isIncomingOrderShiftUnavailableError(error)');
    expect(terminalPageContent).toContain("errorMessage: 'Open a shift to view orders for this branch.'");
    expect(terminalPageContent).toContain('incomingOrdersShiftBlockedRef.current = true;');
    expect(terminalPageContent).toContain('setShiftState((previous) => {');
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
    expect(terminalWorkspaceSidebarContent).toContain("disabled={locked || !isOnline || onboardingRestricted || !canViewPos || !hasActiveShift}");
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
    expect(terminalSidebarPanelContent).toContain("disabled={Boolean(actionLoading) || !canTransactPos || locked || (status === 'completed' && isCompletionPaymentPending(order))}");
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
    expect(terminalPageContent).toContain("if (!shiftState.shift) return 'Open a shift before checkout.';");
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
    expect(terminalOperationsWorkspaceContent).toContain('const canRenderAdminShiftOpen = canOpenShift;');
    expect(terminalOperationsWorkspaceContent).toContain('disabled={shiftActionLoading.open || locked || !canRenderAdminShiftOpen || !isOnline || !activeTerminalMatchesOperatingLocation}');
    expect(terminalSidebarPanelContent).toContain('isValidOpeningCashAmount');
    expect(terminalSidebarPanelContent).toContain('disabled={shiftActionLoading.open || locked || !canOpenShift}');
    expect(terminalPageContent).toContain("const canCloseShift = hasPermission('pos:shift_close') || hasPermission('pos:close_day');");
    expect(terminalPageContent).toContain('canCloseShift={canCloseShift}');
    expect(terminalPageContent).toContain('canCloseDay={canCloseDay}');
    expect(terminalPageContent).toContain('const handleCloseDay = useCallback(async () => {');
    expect(terminalPageContent).toContain('setZReadingCloseConfirmOpen(true);');
    expect(terminalPageContent).toContain('closePosDay(null, { dayClosePin: zReadingClosePin })');
    expect(terminalPageContent).toContain('<ZReadingPrintView');
    expect(terminalOperationsWorkspaceContent).toContain('Close Day & Print Z-reading');
    expect(terminalOperationsWorkspaceContent).toContain('handleCloseDay');
    expect(posCheckoutTerminalContent).toContain('const posActionsBlocked = Boolean(checkoutBlockedReason) || parkedSaleReleaseLoading;');
    expect(posCheckoutTerminalContent).toContain('notifyPosActionBlocked');
    expect(posCheckoutTerminalContent).toContain('checkoutDisabled={posActionsBlocked || checkoutLoading || safeCart.length === 0}');
    expect(skupervisorCheckoutTerminalContent).toContain('const posActionsBlocked = Boolean(checkoutBlockedReason);');
    expect(skupervisorCheckoutTerminalContent).toContain('notifyPosActionBlocked');
    expect(skupervisorCheckoutTerminalContent).toContain('disabled={posActionsBlocked || cart.length === 0 || !isOrderPrinterAvailable}');
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
    expect(terminalOperationsWorkspaceContent).toContain("case 'services'");
    expect(terminalOperationsWorkspaceContent).toContain("title: 'Services'");
    expect(terminalWorkspaceSidebarContent).toContain('testId="pos-nav-services"');
    expect(terminalWorkspaceSidebarContent).toContain("onClick={() => onSelectViewMode('services')}");
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
    expect(posCheckoutTerminalContent).toContain("discountDraft.type === 'manual'");
    expect(posCheckoutTerminalContent).toContain('resetDiscountState();');
    expect(posCheckoutWorkflowContent).toContain('const resetDiscountState = useCallback');
    expect(posCheckoutWorkflowContent).toContain("discount_mode: appliedDiscount ? 'amount' : (selectedDiscount ? 'preset' : (manualDiscountAmount > 0 ? manualDiscountMode : 'none'))");
    expect(posCheckoutTerminalContent).toContain("discountDraft.method === 'fixed' ? 'Amount' : 'Rate (%)'");
    expect(posCheckoutTerminalContent).toContain('Select discount type and verify employee.');
  });

  it('keeps history receipt modal close action in the header and print action in the footer', () => {
    expect(posCheckoutTerminalReceiptDialogsContent).toContain('aria-label="Close receipt preview"');
    expect(posCheckoutTerminalReceiptDialogsContent).toContain("onClick={() => handlePrintReceipt(lastReceipt, 'history_modal')}");
    expect(posCheckoutTerminalReceiptDialogsContent).toContain("{receiptPrinting ? 'Printing...' : 'Print'}");
    expect(posCheckoutTerminalContent).toContain('<POSCheckoutTerminalReceiptDialogs');
  });

  it('opens checkout confirmation and then receipt preview after a successful sale', () => {
    expect(posCheckoutWorkflowContent).toContain('setCheckoutConfirmModalOpen(true);');
    expect(posCheckoutWorkflowContent).toContain('resetCheckoutModalState();');
    expect(posCheckoutWorkflowContent).toMatch(
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
    expect(receiptPrintViewContent).not.toContain('Unit:');
    expect(receiptPrintViewContent).not.toContain('Course:');
    expect(receiptPrintViewContent).toContain('resolveReceiptLineUnitPrice');
    expect(receiptPrintViewContent).toContain('resolveReceiptLineTotal');
    expect(receiptPrintViewContent).toContain('{money(unitPrice)}');
    expect(receiptPrintViewContent).toContain('{money(lineTotal)}');
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
    expect(posHistoryPanelContent).toContain('<caption className="sr-only">POS transaction history with payment and transaction status plus separate receipt actions</caption>');
    expect(posHistoryPanelContent).toContain('event.stopPropagation();');
  });

  it('keeps receipt print state out of the primary POS sales list', () => {
    expect(posHistoryPanelContent).not.toContain('receipt_print_status');
    expect(posHistoryPanelContent).toContain('aria-label={`View receipt for ${row.invoice_number || row.pos_transaction_id}`}');
  });

  it('keeps receipt print state out of online-order detail panels', () => {
    for (const source of [terminalOperationsPanelsContent, incomingQueueOrderListContent, terminalSidebarPanelContent]) {
      expect(source).not.toContain('Not printed');
      expect(source).not.toContain('Print failed');
      expect(source).not.toContain('Receipt: <span');
    }
    // Phase 229 (#1289), §2.7: this content moved into IncomingQueueOrderList.jsx's pure extraction.
    expect(incomingQueueOrderListContent).toContain('Payment Status');
    expect(incomingQueueOrderListContent).toContain('Print Receipt');
    expect(terminalSidebarPanelContent).toContain('Payment:');
    expect(terminalSidebarPanelContent).toContain('Print Receipt');
  });

  it('opens active queue orders in TerminalPage without routing them through receipt history', () => {
    expect(terminalPageContent).toContain('const detail = await fetchPosTransactionById(normalizedId);');
    expect(terminalPageContent).toContain('<OnlineOrderDetailsModal');
    expect(terminalPageContent).toContain('<OnlineOrderReceiptModal');
    expect(terminalPageContent).not.toContain('handleOpenIncomingOrderHistory');
  });

  it('keeps unpaid and rejected online orders in POS Order History', () => {
    expect(terminalOperationsPanelsContent).toContain('Active Queue');
    expect(terminalOperationsPanelsContent).toContain('Order History');
    expect(terminalOperationsPanelsContent).toContain('Rejected, cancelled, and unpaid online orders');
    // Phase 229 (#1289), §2.7: the empty-queue lifecycle copy moved into
    // IncomingQueueOrderList.jsx's pure extraction.
    expect(incomingQueueOrderListContent).toContain('Completed paid sales move to Sales History.');
    expect(terminalOperationsPanelsContent).toContain('Previous order history page');
    expect(terminalOperationsPanelsContent).toContain('Next order history page');
    expect(terminalOperationsPanelsContent).toContain("if (activeView !== 'history') return;");
    expect(terminalOperationsPanelsContent).not.toContain("if (activeView !== 'history' || orderHistoryState?.accessState !== 'idle') return;");
    expect(posServiceContent).toContain("api.get('/pos/order-history'");
    expect(terminalPageContent).toContain("import('../utils/posOrderHistoryLoader.js')");
  });

  it('separates active order details from the printable non-fiscal order receipt', () => {
    expect(onlineOrderDetailsModalContent).toContain('Review the customer order details.');
    expect(onlineOrderDetailsModalContent).not.toContain('Print Order');
    expect(onlineOrderReceiptModalContent).toContain('Non-Fiscal Order Receipt');
    expect(onlineOrderReceiptModalContent).toContain('Print Receipt');
    expect(onlineOrderReceiptModalContent).toContain('pos-online-order-receipt-print-mode');
  });

  it('routes online-order receipt and kitchen printing to separate hardware actions', () => {
    expect(terminalPageContent).toContain('const printOnlineOrderKitchenTicket = useCallback(async (order) => {');
    expect(terminalPageContent).toContain('posHardware.printOrderTicket({');
    expect(terminalPageContent).toContain('printOrder = false');
    expect(terminalPageContent).toContain('await printOnlineOrderKitchenTicket(detail);');
    // Phase 229 (#1289), §2.7: moved into IncomingQueueOrderList.jsx's pure extraction.
    expect(incomingQueueOrderListContent).toContain("utilityActions.includes('print_receipt')");
    expect(incomingQueueOrderListContent).toContain("{ printOrder: true }");
    expect(incomingQueueOrderListContent).toContain("'Print Order'");
    expect(terminalSidebarPanelContent).toContain("utilityActions.includes('print_receipt')");
    expect(terminalSidebarPanelContent).toContain("{ printOrder: true }");
    expect(terminalSidebarPanelContent).toContain("'Print Order'");
  });

  it('guards incoming queue receipt action with opening lock and lifecycle guidance copy', () => {
    expect(terminalPageContent).toContain('const [incomingReceiptOpeningId, setIncomingReceiptOpeningId] = useState(null);');
    expect(terminalPageContent).toContain('if (incomingReceiptOpeningId !== null) return;');
    // Phase 229 (#1289), §2.7: moved into IncomingQueueOrderList.jsx's pure extraction.
    expect(incomingQueueOrderListContent).toContain('Opening...');
    expect(incomingQueueOrderListContent).toContain('Retry Print');
    expect(incomingQueueOrderListContent).toContain('Print Receipt');
    expect(incomingQueueOrderListContent).toContain('Reprint Receipt');
    expect(terminalPageContent).toContain('retryPrint = false');
    expect(terminalSidebarPanelContent).toContain('Completed or cancelled online orders move to History/Receipt Preview.');
  });

  it('exposes a current shift summary action without auto-printing it', () => {
    expect(terminalPageContent).toContain('const handleViewShiftSummary = useCallback(async () => {');
    expect(terminalPageContent).toContain('const currentShiftResult = await fetchCurrentTerminalShift({');
    expect(terminalPageContent).toContain("summary: false");
    expect(terminalOperationsWorkspaceContent).toContain("'Refreshing Summary...'");
    expect(terminalPageContent).toContain('setClosedShiftReportAutoPrint(false);');
    expect(terminalPageContent).toContain("title={closedShiftReportAutoPrint ? 'Cashier Shift Sales Summary' : 'Current Shift Sales Summary'}");
    expect(terminalOperationsWorkspaceContent).toContain('View Shift Summary');
    expect(terminalOperationsWorkspaceContent).toContain('shiftState.salesSummary?.total_amount');
    expect(terminalSidebarPanelContent).toContain('View Shift Summary');
  });

  it('refreshes financial summaries after void mutations without a manual browser refresh', () => {
    expect(posCheckoutTerminalContent).toContain('onFinancialMutationCompleted: onCheckoutCompleted');
    expect(posHistoryVoidWorkflowContent).toContain("await onFinancialMutationCompleted({ ...historyRow, ...(voidResult?.transaction || {}) });");
    expect(terminalPageContent).toContain('takeoverShiftContextRef.current = null;');
    expect(terminalPageContent).toContain('await refreshOperationalContext();');
  });

  it('separates sales revenue from opening cash and expected drawer cash', () => {
    expect(terminalOperationsWorkspaceContent).toContain('Total Sales (excluding opening cash):');
    expect(terminalOperationsWorkspaceContent).toContain('Opening/Petty Cash:');
    expect(terminalOperationsWorkspaceContent).toContain('Expected Cash in Drawer:');
    expect(terminalOperationsWorkspaceContent).toContain('shiftState.cashSummary?.cash_sales_amount');
    expect(terminalSidebarPanelContent).toContain('Total Sales (excluding opening cash)');
    expect(terminalSidebarPanelContent).toContain('Opening/Petty Cash');
    expect(terminalSidebarPanelContent).toContain('Expected Cash in Drawer');
  });

  it('keeps browser printing explicit after automatic shift close', () => {
    const closeShiftStart = terminalPageContent.indexOf('const handleConfirmCloseShift = async () => {');
    const closeShiftEnd = terminalPageContent.indexOf('const dismissStockAlertSummary', closeShiftStart);
    const closeShiftHandler = terminalPageContent.slice(closeShiftStart, closeShiftEnd);
    const replayStart = terminalPageContent.indexOf('const replayQueuedTerminalOperations = useCallback');
    const replayEnd = terminalPageContent.indexOf('const handleConfirmCloseShift = async () => {', replayStart);
    const replayFlow = terminalPageContent.slice(replayStart, replayEnd);

    expect(closeShiftHandler).toContain('openBrowserFallback: false');
    expect(closeShiftHandler).not.toContain('openBrowserFallback: preserveAdminNavigation');
    expect(replayFlow).toContain('openBrowserFallback: false');
    expect(terminalPageContent).toContain("reason: 'post_shift_summary_reprint'");
    expect(terminalPageContent).toContain('Print Shift Summary');
  });

  it('sorts active incoming orders locally and shows lifecycle guidance only for an empty queue', () => {
    expect(terminalOperationsPanelsContent).toContain("const [orderSort, setOrderSort] = React.useState('newest');");
    expect(terminalOperationsPanelsContent).toContain('aria-label="Sort incoming orders"');
    expect(terminalOperationsPanelsContent).toContain('<option value="oldest">Oldest first</option>');
    // Phase 231 (#1290): the tab view's grid maps over visibleIncomingOrders (the run-filtered
    // view of sortedIncomingOrders), not sortedIncomingOrders directly -- sortedIncomingOrders
    // itself is still the sort's own output, feeding the filter rather than the render.
    expect(terminalOperationsPanelsContent).toContain('{visibleIncomingOrders.map((order) => {');
    expect(terminalOperationsPanelsContent).toContain('incomingOrders.length === 0 ? (');
    // Phase 232 (#1289), §2.7: the split view's own render of the (also now run-filtered) list --
    // including its own empty-state branch -- lives in IncomingQueueOrderList.jsx's pure
    // extraction; see terminalOperationsPanelsContent above for the tab view's own render.
    expect(terminalOperationsPanelsContent).toContain('orders={visibleIncomingOrders}');
    expect(incomingQueueOrderListContent).toContain('orders.length === 0');
  });

  it('keeps completed receipt history out of the active queue', () => {
    expect(terminalPageContent).not.toContain('handleOpenIncomingOrderHistory');
    expect(terminalOperationsPanelsContent).not.toContain('history_receipt');
    expect(terminalSidebarPanelContent).not.toContain('history_receipt');
    expect(posHistoryVoidWorkflowContent).toContain('setHistorySearch(query);');
    expect(posCheckoutWorkflowContent).toContain('location_id: selectedLocationId || undefined');
  });

  it('persists offline checkout intents and exposes the manual universal sync policy', () => {
    expect(posCheckoutTerminalQueueContent).toContain('CHECKOUT_QUEUE_OPERATION = \'checkout\'');
    expect(posCheckoutWorkflowContent).toContain('enqueueTerminalOperationIntent');
    expect(posCheckoutWorkflowContent).toContain('TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED');
    expect(terminalPageContent).toContain(".filter((candidate) => String(candidate?.operation || '').trim() !== 'checkout')");
    expect(posHistoryPanelContent).toContain('Sync All Pending Records');
    expect(posHistoryPanelContent).toContain('universalPendingSyncCount');
    expect(terminalPageContent).toContain('consumeManualPosSyncAttempt');
    expect(terminalPageContent).not.toContain('requestBackgroundQueueReplay');
    expect(posCheckoutWorkflowContent).toContain('pending transaction');
    expect(posCheckoutWorkflowContent).toContain('idempotency_key');
  });

  it('keeps checkout orchestration in the R6 workflow hook and the terminal as its compatibility shell', () => {
    expect(posCheckoutTerminalContent).toContain("import { usePosCheckoutWorkflow } from '../hooks/usePosCheckoutWorkflow.js';");
    expect(posCheckoutTerminalContent).toContain('} = usePosCheckoutWorkflow({');
    expect(posCheckoutTerminalContent).not.toContain('const handleCheckout = ');
    expect(posCheckoutTerminalContent).not.toContain('const handleParkAndNewSale = ');
    expect(posCheckoutTerminalContent).not.toContain('const replayQueuedCheckouts = ');
    expect(posCheckoutWorkflowContent).toContain('const handleCheckout = useCallback(async (paymentSnapshot = null) => {');
    expect(posCheckoutWorkflowContent).toContain('const handleParkAndNewSale = useCallback(async (nameOverride = null) => {');
    expect(posCheckoutWorkflowContent).toContain('const replayQueuedCheckouts = useCallback(async');
    expect(posCheckoutWorkflowContent).toContain('const handleReverseSplitPaymentAndStartNew = useCallback(async');
    expect(posCheckoutWorkflowContent).toContain('createPosCheckout(payload)');
    expect(posCheckoutWorkflowContent).toContain('markTerminalOperationReplayed');
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
    expect(posCheckoutWorkflowContent).toContain('buildCompliancePolicyBlockerMessage');
    expect(posCheckoutTerminalUtilsContent).toContain('Compliance policy blocked checkout (');
    expect(posCheckoutWorkflowContent).toContain('Resolve blocker in');
    expect(posCheckoutTerminalUtilsContent).toContain('BSP_OPS_REGISTRATION_REQUIRED');
  });

  it('maps F&B recipe checkout blockers to ingredient-specific cashier copy', () => {
    expect(posCheckoutWorkflowContent).toContain('buildFnbRecipeBlockerMessage');
    expect(posCheckoutErrorMessagesContent).toContain('FNB_RECIPE_INGREDIENT_SHORTFALL');
    expect(posCheckoutErrorMessagesContent).toContain('FNB_RECIPE_UOM_INCOMPATIBLE');
    expect(posCheckoutErrorMessagesContent).toContain('FNB_KITCHEN_ORDER_UNAVAILABLE');
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
    expect(posCheckoutTerminalContent).toContain("const normalizedTerminalId = String(terminalId || '').trim();");
    expect(posCheckoutWorkflowContent).toContain('if (!normalizedTerminalId) {');
    expect(posCheckoutWorkflowContent).toContain("toast.error('Select a terminal ID before checkout.');");
    expect(posCheckoutWorkflowContent).toContain('terminal_id: normalizedTerminalId || undefined');
  });

  it('keeps order overview actions focused on receipt and order printing', () => {
    expect(posHistoryVoidWorkflowContent).toContain("setCurrentViewMode(isCashierRole ? 'history' : 'reports')");
    expect(posCheckoutTerminalContent).not.toContain('openSkupervisorPath');
    expect(posCheckoutTerminalContent).not.toContain("../utils/skupervisorHandoff.js");
    expect(posHistoryPanelContent).not.toContain('data-testid="pos-history-open-sales-report"');
    expect(posHistoryPanelContent).not.toContain('data-testid={`pos-history-row-open-sales-report-${row.pos_transaction_id}`}');
    expect(posHistoryPanelContent).toContain('<span>View</span>');
    expect(posHistoryPanelContent).toContain('<span>Receipt</span>');
    expect(posCheckoutTerminalContent).toContain('data-testid="pos-receipt-view-receipt"');
    expect(posCheckoutTerminalContent).toContain('data-testid="pos-receipt-print"');
    expect(posCheckoutTerminalContent).toContain('data-testid="pos-receipt-print-order"');
    expect(posCheckoutTerminalReceiptDialogsContent).toContain('data-testid="pos-receipt-modal-print-order"');
    expect(posCheckoutTerminalContent).toContain('handlePrintOrder(lastReceipt)');
  });

  it('exposes deterministic sidebar test hook for history mode switching', () => {
    expect(terminalWorkspaceSidebarContent).toContain('testId="pos-nav-history"');
    expect(terminalWorkspaceSidebarContent).toContain('testId="pos-nav-settings"');
    expect(terminalWorkspaceSidebarContent).toContain('data-testid={testId || undefined}');
  });

  it('uses adaptive responsive layout primitives and avoids hard-coded viewport math', () => {
    expect(terminalPageLayoutContent).toContain('dgfy-pos-shell overflow-hidden');
    expect(terminalPageLayoutContent).not.toContain('min-h-screen');
    expect(posCheckoutTerminalContent).toContain('checkoutGridClassName');
    expect(posCheckoutTerminalContent).toContain('checkoutPaneClassName');
    expect(posCheckoutTerminalContent).not.toContain('calc(100vh-13.5rem)');
  });
});
