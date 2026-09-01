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
// The unlock/resume modal markup was extracted out of TerminalPage.jsx into
// its own lazily-loaded component (bundle-size split); its rendered text
// and mode-switch logic live here now.
const terminalPageDialogLayerSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalPageDialogLayer.jsx'), 'utf8');

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
    expect(terminalPageDialogLayerSource).toContain('Authorized DGFY users can open shifts from any logged-in device');
    expect(terminalPageSource).not.toContain('This physical POS device must be paired by the company master admin');
    expect(terminalPageSource).not.toContain('terminal_password: terminalPassword');
    expect(terminalPageDialogLayerSource).toContain("'Unlock POS'");
  });

  it('resumes a locked open shift through the DGFY POS session instead of a tenant-local cashier password', () => {
    expect(terminalPageSource).toContain("setTerminalUnlockMode('cashier_resume')");
    expect(terminalPageDialogLayerSource).toContain('cashierTakeoverUnlock ? handleCashierTakeoverSubmit : (cashierResumeUnlock ? handleCashierResumeSubmit : handleTerminalUnlockSubmit)');
    expect(terminalPageDialogLayerSource).toContain('Terminal password is not required.');
    expect(terminalPageSource).toContain('loginDgfyAccount({');
    expect(terminalPageSource).toContain('startDgfyPosSession({');
    expect(terminalPageSource).toContain('const tenantId = String(cashierResumeContext.tenantId ||');
    expect(terminalPageSource).not.toContain('loginCashierWithCredentials');
    expect(terminalPageSource).not.toContain('authenticateCashierCredentials');
    expect(terminalPageDialogLayerSource).toContain('Only the cashier who owns this open shift can continue it.');
    expect(terminalPageSource).toContain('authenticatedCashierId !== expectedCashierId');
    expect(terminalPageDialogLayerSource).toContain("!cashierResumeUnlock && terminalUnlockMode === 'shift_start'");
    expect(terminalPageSource).toContain("const signedInShiftResume = terminalUnlockMode === 'resume_shift'");
    expect(terminalPageDialogLayerSource).toContain("? 'Resume Shift'");
  });

  it('uses one cashier sign-in modal to resume the owner or take over as another cashier', () => {
    expect(terminalPageSource).toContain("setTerminalUnlockMode('cashier_takeover')");
    expect(terminalPageSource).toContain('resolveCashierRegisterEntryMode({');
    expect(terminalPageSource).toContain("if (entryMode === 'resume')");
    expect(terminalPageSource).toContain('resumePosCashier({');
    expect(terminalPageSource).toContain("createIdempotencyKey('pos-cashier-takeover')");
    expect(terminalPageSource).toContain('takeOverPosRegister({');
    expect(terminalPageSource).toContain('user_id: cashierUser.user_id');
    expect(terminalPageDialogLayerSource).toContain('Another cashier taking over?');
    expect(terminalPageDialogLayerSource).toContain('POS Cashier PIN <span');
    expect(terminalPageDialogLayerSource).toContain('(different cashier only)');
    expect(terminalPageDialogLayerSource).toContain('The shift owner resumes automatically.');
    expect(terminalPageDialogLayerSource).toContain('Continue to POS');
    expect(terminalPageDialogLayerSource).toContain('Back to Resume Shift');
    expect(terminalPageSource).toContain('const activeOperator = operatorAuthorityState.operatorUser;');
    expect(terminalPageSource).toContain('cashierId: Number(activeOperator?.user_id || shiftState?.shift?.cashier_id || 0) || null');
    expect(terminalPageSource).toContain("cashierEmail: String(activeOperator?.email || shiftState?.shift?.cashier?.email || '').trim()");
  });

  it('keeps raw shift-open diagnostics out of the cashier dialog and identifies the signed-in cashier', () => {
    const failurePanelStart = terminalPageSource.indexOf('const renderUnlockFailurePanel = () => {');
    const failurePanelEnd = terminalPageSource.indexOf('  const validateSelectedTerminalForUnlock', failurePanelStart);
    const failurePanel = terminalPageSource.slice(failurePanelStart, failurePanelEnd);

    expect(failurePanel).toContain('Could not open shift');
    expect(failurePanel).toContain('{unlockFailure.message}');
    expect(failurePanel).not.toContain('metaParts');
    expect(failurePanel).not.toContain('requestPath');
    expect(failurePanel).not.toContain('status');
    expect(failurePanel).not.toContain('ref');
    expect(terminalPageDialogLayerSource).toContain('const currentCashierLabel = String(');
    expect(terminalPageDialogLayerSource).toContain('Cashier signed in: {currentCashierLabel}');
    expect(terminalPageDialogLayerSource).not.toContain('No open shift is active. Enter opening cash to start a new shift before using POS.');
    expect(terminalPageDialogLayerSource).not.toContain('Shift Closed. Sales, payments, receipt printing, and transaction changes are blocked.');
  });

  it('keeps legacy selling available when a mixed-version API has no operator-authority route', () => {
    expect(terminalPageSource).toContain('isPosOperatorAuthorityUnavailableError(initialError)');
    expect(terminalPageSource).toContain('const shouldRecover = !operatorAuthorityUnavailable');
    expect(terminalPageSource).toContain('if (operatorAuthorityUnavailable) {');
    expect(terminalPageSource).toContain('required: false');
  });

  it('preserves the open register shift while the incoming operator session takes control', () => {
    expect(terminalPageSource).toContain('shiftSnapshot: {');
    expect(terminalPageSource).toContain('const preservedShiftContext = cashierResumeContext?.shiftSnapshot || {');
    expect(terminalPageSource).toContain('preserveShiftContext: preservedShiftContext');
    expect(terminalPageSource).toContain('takeoverShiftContextRef.current = normalizedPreservedShiftContext;');
    expect(terminalPageSource).toContain('const preservedTakeoverContext = takeoverShiftContextRef.current;');
    expect(terminalPageSource).toContain('terminal_id: sanitizeTerminalId(activeTerminalId) || undefined');
  });

  it('installs the verified cashier session before completing resume without re-locking', () => {
    const resumeStart = terminalPageSource.indexOf('const handleCashierResumeSubmit = async (event) => {');
    const resumeEnd = terminalPageSource.indexOf('const handleCashierTakeoverSubmit = async (event) => {', resumeStart);
    const resumeFlow = terminalPageSource.slice(resumeStart, resumeEnd);

    expect(resumeFlow).toContain('activateDgfyTenantSession(posSession, { emitAuthEvent: false });');
    expect(resumeFlow).toContain('setTerminalUser(cashierUser);');
    expect(resumeFlow).toContain('preserveShiftContext: preservedShiftContext');
    expect(resumeFlow.indexOf('activateDgfyTenantSession(posSession')).toBeLessThan(resumeFlow.indexOf('await completeTerminalUnlock(terminalId'));
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
