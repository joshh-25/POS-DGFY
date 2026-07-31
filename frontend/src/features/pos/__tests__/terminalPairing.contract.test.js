import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
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

  it('resumes a locked open shift with cashier credentials instead of terminal password', () => {
    expect(terminalPageSource).toContain("setTerminalUnlockMode('cashier_resume')");
    expect(terminalPageSource).toContain('cashierResumeUnlock ? handleCashierResumeSubmit : handleTerminalUnlockSubmit');
    expect(terminalPageSource).toContain('Terminal password is not required.');
    expect(terminalPageSource).toContain('Only the cashier who owns this open shift can continue it.');
    expect(terminalPageSource).toContain('authenticatedCashierId !== expectedCashierId');
    expect(terminalPageSource).toContain("!cashierResumeUnlock && terminalUnlockMode === 'shift_start'");
    expect(terminalPageSource).toContain("const signedInShiftResume = terminalUnlockMode === 'resume_shift'");
    expect(terminalPageSource).toContain("? 'Resume Shift'");
  });

  it('keeps the terminal session open after a successful close shift', () => {
    expect(terminalPageSource).toContain("toast.success('Shift closed successfully. Open a new shift manually when you are ready.')");
    expect(terminalPageSource).toContain('setStoredTerminalLock(false);');
    expect(terminalPageSource).toContain("setStoredTerminalLockReason('');");
    expect(terminalPageSource).toContain('setLocked(false);');
    expect(terminalPageSource).toContain('setTerminalUnlockModalOpen(false)');
    expect(terminalPageSource).toContain('setDrawerOpen(false)');
    expect(terminalPageSource).toContain('await refreshOperationalContext();');
  });

  it('restores an open shift on refresh while queued close still returns to login', () => {
    expect(terminalPageSource).toContain('allowWhileLocked = false');
    expect(terminalPageSource).toContain('const storedLockActive = readStoredTerminalLock();');
    expect(terminalPageSource).toContain("storedReason !== 'terminal_reunlock'");
    expect(terminalPageSource).toContain('const storedRegistryEntry = terminalRegistryLookup.get(storedTerminalId);');
    expect(terminalPageSource).toContain('if (!storedRegistryEntry || !Number.isInteger(storedLocationId) || storedLocationId <= 0) {');
    expect(terminalPageSource).toContain('allowWhileLocked: true');
    expect(terminalPageSource).toContain('if (operationalContext?.shift) {');
    expect(terminalPageSource).toContain('setStoredTerminalLock(false);');
    expect(terminalPageSource).toContain("setStoredTerminalLockReason('shift_closed')");
    expect(terminalPageSource).toContain("reason: 'shift_close_queued'");
    expect(terminalPageSource).toContain('Cashier login is required for the next shift');
    expect(terminalPageSource).toContain('setTerminalUnlockModalOpen(false);');
    expect(terminalPageSource).toContain('setDrawerOpen(true);');
  });
});
