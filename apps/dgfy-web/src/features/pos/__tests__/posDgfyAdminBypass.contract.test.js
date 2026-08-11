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
    expect(terminalPageSource).toContain("parseUserPermissions(user).includes('settings:view')");
    expect(terminalPageSource).toContain('setDgfyAdminBypassActive(userCanAccessSettings && !storedLockActive);');
    expect(terminalPageSource).toContain('&& !userCanAccessSettings');
    expect(terminalPageSource).toContain('const adminLock = terminalUser?.is_master_admin === true || dgfyAdminBypassActive;');
    expect(terminalPageSource).toContain('if (hasOpenShift && !adminLock) {');
    expect(terminalPageSource).toContain('setDgfyAdminBypassActive(false);');
  });

  it('uses settings permission rather than role name for shift bypass visibility', () => {
    expect(terminalPageSource).toContain("const canAdminBypassShiftPrompt = hasPermission('settings:view') || dgfyAdminBypassActive;");
    expect(terminalPageSource).toContain('const isMasterAdminOperator = terminalUser?.is_master_admin === true;');
    expect(terminalPageSource).toContain('const canOpenShift = canTransactPos && (!canAdminBypassShiftPrompt || isMasterAdminOperator);');
    expect(terminalPageSource).not.toContain("|| normalizedTerminalRole === 'admin'");
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
  });

  it('keeps manual admin lock ahead of onboarding setup modal', () => {
    expect(terminalPageSource).toContain('if (locked || readStoredTerminalLock()) {');
    expect(terminalPageSource).toContain('setTenantSetupModalOpen(false);');
    expect(terminalPageSource).not.toContain('if (readStoredTerminalLock()) {\n      setStoredTerminalLock(false);');
    expect(terminalPageSource).toContain('setTenantSetupDismissedThisSession(true);');
  });
});
