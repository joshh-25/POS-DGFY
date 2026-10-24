import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = [
  '../pages/TerminalPage.jsx',
  '../components/TerminalPageDialogLayer.jsx'
].map((relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')).join('\n');
const sidebarSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx'), 'utf8');

describe('DGFY POS administrator bypass contract', () => {
  it('limits bypass activation to the selected company settings permission', () => {
    expect(terminalPageSource).toContain("selectedPermissionList.includes('settings:view')");
    expect(terminalPageSource).toContain('setDgfyAdminBypassActive(selectedCanAccessSettings)');
    expect(terminalPageSource).toContain('if (selectedCanAccessSettings) {');
    expect(terminalPageSource).toContain(': fetchPosSettingsBootstrap(SUPPRESS_GLOBAL_ERROR_TOAST)');
    expect(terminalPageSource).not.toContain("String(effectiveSelectedTenantUser?.role || '').trim().toLowerCase() === 'admin'");
  });

  it('uses the POS-safe settings bootstrap for terminal metadata', () => {
    expect(terminalPageSource).toContain('const allSettings = await fetchPosSettingsBootstrap(');
    expect(terminalPageSource).not.toContain('const allSettings = await getAllSettings(');
  });

  it('keeps terminal credential bypass separate from mandatory admin shift opening', () => {
    expect(terminalPageSource).toContain('const requiresOpenShift = !locked && !shiftState.loading && !activeShiftId;');
    expect(terminalPageSource).not.toContain('const requiresOpenShift = !dgfyAdminBypassActive');
    expect(terminalPageSource).toContain('setTerminalUnlockModalOpen(false);');
    expect(sidebarSource).toContain('const navigationShiftReady = hasActiveShift || allowAdminNavigationWithoutShift;');
    expect(terminalPageSource).toContain('const [adminShiftPromptSkipped, setAdminShiftPromptSkipped] = useState(false);');
    expect(terminalPageSource).toContain('Skip for Admin');
    expect(terminalPageSource).toContain('<Dialog open={shiftOpeningModalOpen} onOpenChange={handleShiftOpeningModalOpenChange}>');
  });

  it('restores permission-backed bypass on refresh but not across manual lock', () => {
    expect(terminalPageSource).toContain('const [dgfyAdminBypassActive, setDgfyAdminBypassActive] = useState(false);');
    expect(terminalPageSource).toContain('const userPermissions = parseUserPermissions(user);');
    expect(terminalPageSource).toContain("userPermissions.includes('settings:view')");
    expect(terminalPageSource).toContain('setDgfyAdminBypassActive(userCanAccessSettings && !storedLockActive);');
    expect(terminalPageSource).toContain('&& !userCanAccessSettings');
    expect(terminalPageSource).toContain('const adminLock = terminalUser?.is_master_admin === true || dgfyAdminBypassActive;');
    expect(terminalPageSource).toContain('if (hasOpenShift && !adminLock) {');
    expect(terminalPageSource).toContain('setDgfyAdminBypassActive(false);');
  });

  it('uses settings permission rather than role name for shift bypass visibility', () => {
    expect(terminalPageSource).toContain("const canAdminBypassShiftPrompt = hasPermission('settings:view') || dgfyAdminBypassActive;");
    expect(terminalPageSource).toContain('const isMasterAdminOperator = terminalUser?.is_master_admin === true;');
    // Reformatted multi-line since the branch-location allowance landed; the
    // settings-permission gate and its branch-location extension are preserved.
    expect(terminalPageSource).toContain('const canOpenShift = canTransactPos && (');
    expect(terminalPageSource).toContain('!canAdminBypassShiftPrompt');
    expect(terminalPageSource).toContain('|| isMasterAdminOperator');
    expect(terminalPageSource).toContain('|| canViewBranchLocations');
    expect(terminalPageSource).not.toContain("const canAdminBypassShiftPrompt = hasPermission('settings:view') || normalizedTerminalRole === 'admin'");
  });

  it('routes administrators to branch review before cashier shift resume', () => {
    const adminEntryIndex = terminalPageSource.indexOf('if (selectedCanAccessSettings) {');
    const branchSelectorIndex = terminalPageSource.indexOf("openBranchSelector({ mode: 'directory' })");
    const onboardingRedirectIndex = terminalPageSource.indexOf('selectedTenantSetupStep !== POS_TERMINAL_SETUP_STEPS.COMPLETE');
    const activeShiftResumeIndex = terminalPageSource.indexOf('if (selectedActiveShift) {');

    expect(adminEntryIndex).toBeGreaterThan(-1);
    expect(branchSelectorIndex).toBeGreaterThan(-1);
    expect(onboardingRedirectIndex).toBeGreaterThan(-1);
    expect(activeShiftResumeIndex).toBeGreaterThan(-1);
    expect(adminEntryIndex).toBeLessThan(activeShiftResumeIndex);
    expect(branchSelectorIndex).toBeLessThan(onboardingRedirectIndex);
    expect(terminalPageSource).toContain("selectedPermissionList.includes('pos:branch_view')");
    expect(terminalPageSource).toContain('effectiveSelectedTenantUser?.is_master_admin === true');
    expect(terminalPageSource).toContain('selectedCanAccessBranchDirectory');
    expect(terminalPageSource).toContain("openBranchSelector({ mode: 'directory' })");
    expect(terminalPageSource).toContain('Review branches and shifts before operating a terminal.');
    expect(terminalPageSource).toContain('if (shouldOpenBranchDirectoryOnHydrate({');
  });

  it('keeps branch selection and read-only branch view above the shift-opening prompt', () => {
    expect(terminalPageSource).toContain('const shiftOpeningModalOpen = (');
    expect(terminalPageSource).toContain('&& !branchSelectorOpen');
    expect(terminalPageSource).toContain('&& !branchViewLocationId');
    expect(terminalPageSource).toContain('&& !branchViewTransitionLocationId');
  });

  it('returns read-only branch view to the independent branch directory', () => {
    const exitHandlerStart = terminalPageSource.indexOf('const handleExitBranchView = useCallback');
    const exitHandlerEnd = terminalPageSource.indexOf('const refreshAdminLocationMonitor', exitHandlerStart);
    const exitHandlerSource = terminalPageSource.slice(exitHandlerStart, exitHandlerEnd);

    expect(exitHandlerStart).toBeGreaterThan(-1);
    expect(exitHandlerSource).toContain("openBranchSelector({ mode: 'directory' });");
    expect(exitHandlerSource).toContain('void refreshBranchDirectory({ silent: true });');
  });

  it('returns admin lock to the full POS login session instead of the unlock modal', () => {
    expect(terminalPageSource).toContain("setStoredTerminalLockReason('full_auth');");
    expect(terminalPageSource).toContain("setTerminalUnlockMode('full_auth');");
    expect(terminalPageSource).toContain('clearDgfySession();');
    expect(terminalPageSource).toContain("api.post('/auth/logout')");
    expect(terminalPageSource).toContain('logoutDgfyAccount(activeDgfyToken)');
    expect(terminalPageSource).toContain("reason: 'terminal_lock'");
    expect(terminalPageSource).toContain('authenticated: false');
    expect(terminalPageSource).toContain('setTerminalUser(null);');
    expect(terminalPageSource).toContain('setDrawerOpen(true);');
    expect(terminalPageSource).toContain('setTerminalUnlockModalOpen(false);');
    expect(terminalPageSource).toContain('setDgfyAdminBypassActive(true);');
    expect(terminalPageSource).toContain('branchSelectorContinuationRef.current = null;');
    expect(terminalPageSource).toContain('setBranchSelectorOpen(false);');
  });

  it('reopens branch selection before resuming a locked cashier shift', () => {
    expect(terminalPageSource).toContain('if ((!locked && !drawerOpen) || !branchSelectorOpen) return;');
    expect(terminalPageSource).toContain("const cashierBranchSelectorCanShowWhileLocked = branchSelectorMode === 'cashier'");
    expect(terminalPageSource).toContain('if (cashierBranchSelectorCanShowWhileLocked && !drawerOpen) return;');
    expect(terminalPageSource).toContain('open={branchSelectorOpen && !drawerOpen && (!locked || cashierBranchSelectorCanShowWhileLocked)}');
    expect(terminalPageSource).toContain('branchSelectorContinuationRef.current = null;');

    const lockStart = terminalPageSource.lastIndexOf("if (hasOpenShift && !adminLock) {");
    const lockEnd = terminalPageSource.indexOf("setStoredTerminalLockReason('full_auth');", lockStart);
    const lockSource = terminalPageSource.slice(lockStart, lockEnd);

    expect(lockStart).toBeGreaterThan(-1);
    expect(lockEnd).toBeGreaterThan(lockStart);
    expect(lockSource).toContain("setTerminalUnlockMode('cashier_resume');");
    expect(lockSource).toContain('setTerminalUnlockModalOpen(false);');
    expect(lockSource).toContain("mode: 'cashier'");
    expect(lockSource).toContain("continuation: 'terminal_unlock'");
    expect(lockSource).toContain('resumeShift: shiftState?.shift');
    expect(terminalPageSource).toContain("const lockedShiftBranchSelection = branchSelectorContinuationRef.current === 'terminal_unlock'");
    expect(terminalPageSource).toContain('setCashierResumeContext((previous) => (previous');
    expect(terminalPageSource).toContain('resumeShiftOverride');
  });

  it('requires restored cashiers to select a branch before opening a shift', () => {
    const shiftOpeningModalStart = terminalPageSource.indexOf('const shiftOpeningModalOpen = (');
    const shiftOpeningModalEnd = terminalPageSource.indexOf('const openingCashAmountText', shiftOpeningModalStart);
    const shiftOpeningModalSource = terminalPageSource.slice(shiftOpeningModalStart, shiftOpeningModalEnd);

    expect(shiftOpeningModalStart).toBeGreaterThan(-1);
    expect(shiftOpeningModalSource).toContain('&& !isCashierRole');
    expect(terminalPageSource).toContain('const [cashierBranchSelectionReady, setCashierBranchSelectionReady] = useState(false);');
    expect(terminalPageSource).toContain("toast.message('Select a branch before opening a shift.')");
    expect(terminalPageSource).toContain('cashierBranchOperationSelectedRef.current = true;');
    expect(terminalPageSource).toContain('userIsCashier && !userCanAccessSettings && !userCanViewBranchLocations');
    expect(terminalPageSource).toContain("mode: 'cashier',\n      continuation: 'terminal_unlock'");
  });

  it('does not stack the restored unlock dialog over the cashier branch cards', () => {
    const lockRestoreStart = terminalPageSource.indexOf("if (!locked || !readStoredTerminalLock()) return;");
    const lockRestoreEnd = terminalPageSource.indexOf('useEffect(() => {', lockRestoreStart + 1);
    const lockRestoreSource = terminalPageSource.slice(lockRestoreStart, lockRestoreEnd);

    expect(lockRestoreStart).toBeGreaterThan(-1);
    expect(lockRestoreSource).toContain('branchSelectorOpen');
    expect(lockRestoreSource).toContain("branchSelectorMode === 'cashier'");
    expect(lockRestoreSource).toContain("branchSelectorContinuationRef.current === 'terminal_unlock'");
    expect(lockRestoreSource).toContain('setTerminalUnlockModalOpen(false);');
    expect(lockRestoreSource).toContain('return;');
  });

  it('keeps manual admin lock ahead of onboarding setup modal', () => {
    expect(terminalPageSource).toContain('if (locked || readStoredTerminalLock()) {');
    expect(terminalPageSource).toContain('setTenantSetupModalOpen(false);');
    expect(terminalPageSource).not.toContain('if (readStoredTerminalLock()) {\n      setStoredTerminalLock(false);');
    expect(terminalPageSource).toContain('setTenantSetupDismissedThisSession(true);');
  });
});
