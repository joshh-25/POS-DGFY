import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const sidebarSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx'), 'utf8');

describe('DGFY POS administrator bypass contract', () => {
  it('limits bypass activation to DGFY tenant admins', () => {
    expect(terminalPageSource).toContain("String(effectiveSelectedTenantUser?.role || '').trim().toLowerCase() === 'admin'");
    expect(terminalPageSource).toContain('setDgfyAdminBypassActive(selectedUserIsAdmin)');
    expect(terminalPageSource).toContain('if (selectedUserIsAdmin) {');
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

  it('shows an acknowledgment-only notice when an admin finds a cashier-owned shift', () => {
    expect(terminalPageSource).toContain('const adminActiveShiftNoticeOpen = Boolean(');
    expect(terminalPageSource).toContain('Cashier Shift Already Open');
    expect(terminalPageSource).toContain('activeShiftCashierName');
    expect(terminalPageSource).toContain('activeShiftStartedAt');
    expect(terminalPageSource).toContain('onClick={handleAcknowledgeCashierShift}');
    expect(terminalPageSource).toContain('Okay');
    expect(terminalPageSource).toContain("setPosViewMode('checkout')");
  });

  it('restores admin bypass on refresh but not across manual lock', () => {
    expect(terminalPageSource).toContain('const [dgfyAdminBypassActive, setDgfyAdminBypassActive] = useState(false);');
    expect(terminalPageSource).toContain('const userIsAdmin = user?.is_master_admin === true;');
    expect(terminalPageSource).toContain('setDgfyAdminBypassActive(userIsAdmin && !storedLockActive);');
    expect(terminalPageSource).toContain('&& !userIsAdmin');
    expect(terminalPageSource).toContain('const adminLock = terminalUser?.is_master_admin === true || dgfyAdminBypassActive;');
    expect(terminalPageSource).toContain('if (hasOpenShift && !adminLock) {');
    expect(terminalPageSource).toContain('setDgfyAdminBypassActive(false);');
  });

  it('treats role admin users as admin-like for shift bypass visibility', () => {
    expect(terminalPageSource).toContain("const userIsAdminLike = terminalUser?.is_master_admin === true");
    expect(terminalPageSource).toContain("const normalizedTerminalRole = String(terminalUser?.role || '').trim().toLowerCase();");
    expect(terminalPageSource).toContain("|| normalizedTerminalRole === 'admin'");
    expect(terminalPageSource).toContain('const canAdminBypassShiftPrompt = userIsAdminLike || dgfyAdminBypassActive;');
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
