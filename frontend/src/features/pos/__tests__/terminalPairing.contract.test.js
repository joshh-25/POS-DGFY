import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const posServiceSource = fs.readFileSync(path.resolve(__dirname, '../services/posService.js'), 'utf8');

describe('POS terminal pairing contract', () => {
  it('checks the backend pairing after cashier login', () => {
    expect(posServiceSource).toContain("api.get('/pos/terminal/paired'");
    expect(terminalPageSource).toContain('pairedTerminal = await fetchPairedPosTerminal()');
    expect(terminalPageSource).toContain("pairedTerminal?.terminal_identity_policy?.registry_entry?.terminal_id");
  });

  it('shows opening cash without terminal password for a valid pairing', () => {
    expect(terminalPageSource).toContain('const pairedCashierOpening = Boolean(cashierUnlockSession?.email && pairedTerminalUnlock);');
    expect(terminalPageSource).toContain('if (!pairedTerminalUnlock && !terminalPassword.trim()) {');
    expect(terminalPageSource).toContain("pairedTerminalUnlock ? 'Open Cashier Shift' : 'Unlock POS'");
  });

  it('resumes a locked open shift with cashier credentials instead of terminal password', () => {
    expect(terminalPageSource).toContain("setTerminalUnlockMode('cashier_resume')");
    expect(terminalPageSource).toContain('cashierResumeUnlock ? handleCashierResumeSubmit : handleTerminalUnlockSubmit');
    expect(terminalPageSource).toContain('Terminal password is not required.');
    expect(terminalPageSource).toContain('Only the cashier who owns this open shift can continue it.');
    expect(terminalPageSource).toContain('authenticatedCashierId !== expectedCashierId');
    expect(terminalPageSource).toContain("!cashierResumeUnlock && terminalUnlockMode !== 'relock'");
  });

  it('returns to cashier login after close shift instead of terminal unlock', () => {
    expect(terminalPageSource).toContain("reason: 'shift_closed'");
    expect(terminalPageSource).toContain("setStoredTerminalLockReason('full_auth')");
    expect(terminalPageSource).toContain('setTerminalUnlockModalOpen(false)');
    expect(terminalPageSource).toContain('setDrawerOpen(true)');
    expect(terminalPageSource).toContain('Cashier login is required for the next shift.');
  });

  it('restores an open shift on refresh while close shift still returns to login', () => {
    expect(terminalPageSource).toContain('allowWhileLocked = false');
    expect(terminalPageSource).toContain('const storedLockActive = readStoredTerminalLock();');
    expect(terminalPageSource).toContain("storedReason !== 'terminal_reunlock'");
    expect(terminalPageSource).toContain('const pairedTerminal = await fetchPairedPosTerminal().catch(() => null);');
    expect(terminalPageSource).toContain('if (!pairedTerminal?.paired || (pairedTerminalId && pairedTerminalId !== storedTerminalId)) {');
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
