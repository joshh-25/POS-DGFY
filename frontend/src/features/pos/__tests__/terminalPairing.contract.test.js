import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const posServiceSource = fs.readFileSync(path.resolve(__dirname, '../services/posService.js'), 'utf8');
const setupModalSource = fs.readFileSync(path.resolve(__dirname, '../components/PosTenantSetupModal.jsx'), 'utf8');
const operationsWorkspaceSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'), 'utf8');


describe('POS terminal pairing contract', () => {
  it('keeps device-pairing endpoints out of the normal standalone POS flow', () => {
    expect(posServiceSource).not.toContain("api.get('/pos/terminal/paired'");
    expect(posServiceSource).not.toContain("api.post('/pos/terminal/verify'");
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

  it('requires a registered terminal before cashier shift opening', () => {
    expect(terminalPageSource).toContain('Select an active terminal before opening a shift.');
    expect(terminalPageSource).toContain('Select an active registered terminal before opening shift.');
    expect(terminalPageSource).toContain('Authorized DGFY users can open shifts from any logged-in device');
  });

  it('removes pairing controls from POS setup screens', () => {
    expect(setupModalSource).not.toContain('Pair This Device');
    expect(setupModalSource).not.toContain('verifyPosTerminal');
    expect(operationsWorkspaceSource).not.toContain('verifyPosTerminal');
    expect(operationsWorkspaceSource).not.toContain('save and pair');
  });

  it('keeps the terminal locked to its configured branch location', () => {
    expect(operationsWorkspaceSource).toContain('Locked Branch / Location');
    expect(operationsWorkspaceSource).toContain('Strict Shift Location Binding');
    expect(terminalPageSource).toContain('selectedTenantRegistryEntry?.location_id');
  });

  it('keeps cashier credentials and shift ownership checks', () => {
    expect(terminalPageSource).toContain('Cashier password is required.');
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
