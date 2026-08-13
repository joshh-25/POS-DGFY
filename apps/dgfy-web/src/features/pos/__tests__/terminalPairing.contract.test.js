import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = [
  '../pages/TerminalPage.jsx',
  '../components/TerminalPageDialogLayer.jsx'
].map((relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')).join('\n');
const posServiceSource = fs.readFileSync(path.resolve(__dirname, '../services/posService.js'), 'utf8');

describe('POS terminal pairing contract', () => {
  it('uses registered terminal identity headers without restoring legacy pairing dependency', () => {
    expect(posServiceSource).toContain("const TERMINAL_ID_STORAGE_KEY = 'pos_terminal_identity_v1';");
    expect(posServiceSource).toContain('const getRegisteredTerminalHeaders = (terminalId = \'\') => {');
    expect(posServiceSource).toContain('headers: getRegisteredTerminalHeaders(payload?.terminal_id)');
    expect(terminalPageSource).not.toContain('fetchPairedPosTerminal');
    expect(terminalPageSource).not.toContain('pairedTerminalContext');
  });

  it('opens normal shifts from an active logical terminal without a reusable terminal password', () => {
    expect(terminalPageSource).toContain('const selectedRegistryEntry = terminalRegistryLookup.get(selectedTerminalId);');
    expect(terminalPageSource).toContain('Authorized DGFY users can open shifts from any logged-in device');
    expect(terminalPageSource).not.toContain('This physical POS device must be paired by the company master admin');
    expect(terminalPageSource).not.toContain('terminal_password: terminalPassword');
    expect(terminalPageSource).toContain("'Unlock POS'");
  });

  it('resumes a locked open shift through the DGFY POS session instead of a tenant-local cashier password', () => {
    expect(terminalPageSource).toContain("setTerminalUnlockMode('cashier_resume')");
    expect(terminalPageSource).toContain('cashierResumeUnlock ? handleCashierResumeSubmit : handleTerminalUnlockSubmit');
    expect(terminalPageSource).toContain('Terminal password is not required.');
    expect(terminalPageSource).toContain('loginDgfyAccount({');
    expect(terminalPageSource).toContain('startDgfyPosSession({');
    expect(terminalPageSource).toContain('const tenantId = String(cashierResumeContext.tenantId ||');
    expect(terminalPageSource).not.toContain('loginCashierWithCredentials');
    expect(terminalPageSource).not.toContain('authenticateCashierCredentials');
    expect(terminalPageSource).toContain('Only the cashier who owns this open shift can continue it.');
    expect(terminalPageSource).toContain('authenticatedCashierId !== expectedCashierId');
    expect(terminalPageSource).toContain("!cashierResumeUnlock && terminalUnlockMode === 'shift_start'");
    expect(terminalPageSource).toContain("const signedInShiftResume = terminalUnlockMode === 'resume_shift'");
    expect(terminalPageSource).toContain("? 'Resume Shift'");
  });

  it('keeps a successful cashier close in a secure post-shift Day Close handoff while preserving admin navigation', () => {
    const closeShiftStart = terminalPageSource.indexOf('const handleConfirmCloseShift = async () => {');
    const closeShiftEnd = terminalPageSource.indexOf('const dismissStockAlertSummary', closeShiftStart);
    const closeShiftHandler = terminalPageSource.slice(closeShiftStart, closeShiftEnd);
    const cashierCloseStart = closeShiftHandler.indexOf("toast.success('Shift closed successfully. Review the branch Day Close status before leaving the terminal.')");
    const cashierCloseEnd = closeShiftHandler.indexOf('} catch (error) {', cashierCloseStart);
    const cashierCloseFlow = closeShiftHandler.slice(cashierCloseStart, cashierCloseEnd);

    expect(closeShiftHandler).toContain("if (preserveAdminNavigation) {");
    expect(closeShiftHandler).toContain('openBrowserFallback: false');
    expect(closeShiftHandler).not.toContain('openBrowserFallback: preserveAdminNavigation');
    expect(closeShiftHandler).toContain("toast.success('Shift closed successfully.');");
    expect(closeShiftHandler).toContain('await refreshOperationalContext();');
    expect(cashierCloseFlow).toContain('setStoredTerminalLock(false);');
    expect(cashierCloseFlow).toContain("setStoredTerminalLockReason('');");
    expect(cashierCloseFlow).toContain('setLocked(false);');
    expect(cashierCloseFlow).toContain('setTerminalUnlockModalOpen(false);');
    expect(cashierCloseFlow).toContain('setDrawerOpen(false);');
    expect(cashierCloseFlow).toContain("setPosViewMode('shift_controls');");
    expect(cashierCloseFlow).toContain('await openPostShiftHandoff({');
    expect(cashierCloseFlow).toContain('initialReadiness: closeResult?.day_close_readiness || null');
    expect(cashierCloseFlow).not.toContain('clearClientSession({');
    expect(closeShiftHandler).not.toContain('setTerminalStartupReady(false);');
  });

  it('restores an open shift on refresh while queued close still returns to login', () => {
    const replayStart = terminalPageSource.indexOf('const replayQueuedTerminalOperations = useCallback');
    const replayEnd = terminalPageSource.indexOf('const handleConfirmCloseShift = async () => {', replayStart);
    const replayFlow = terminalPageSource.slice(replayStart, replayEnd);

    expect(terminalPageSource).toContain('allowWhileLocked = false');
    expect(terminalPageSource).toContain('const storedLockActive = readStoredTerminalLock();');
    expect(terminalPageSource).toContain("storedReason !== 'terminal_reunlock'");
    expect(terminalPageSource).toContain('const storedRegistryEntry = restoreTerminalRegistry.find(');
    expect(terminalPageSource).toContain('if (!storedRegistryEntry || !Number.isInteger(storedLocationId) || storedLocationId <= 0) {');
    expect(terminalPageSource).toContain('allowWhileLocked: true');
    expect(terminalPageSource).toContain('if (operationalContext?.shift) {');
    expect(terminalPageSource).toContain('setStoredTerminalLock(false);');
    expect(terminalPageSource).toContain("setStoredTerminalLockReason('shift_closed')");
    expect(terminalPageSource).toContain("reason: 'shift_close_queued'");
    expect(terminalPageSource).toContain('Cashier login is required for the next shift');
    expect(replayFlow).toContain('openBrowserFallback: false');
    expect(terminalPageSource).toContain('setTerminalUnlockModalOpen(false);');
    expect(terminalPageSource).toContain('setDrawerOpen(true);');
  });
});
