import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const posServiceSource = fs.readFileSync(path.resolve(__dirname, '../services/posService.js'), 'utf8');
const setupModalSource = fs.readFileSync(path.resolve(__dirname, '../components/PosTenantSetupModal.jsx'), 'utf8');
const operationsWorkspaceSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'), 'utf8');

describe('POS registered terminal contract', () => {
  it('does not call device-pairing endpoints', () => {
    expect(posServiceSource).not.toContain('/pos/terminal/pair');
    expect(posServiceSource).not.toContain('/pos/terminal/paired');
    expect(terminalPageSource).not.toContain('fetchPairedPosTerminal');
    expect(terminalPageSource).not.toContain('verifyPosTerminal');
  });

  it('derives terminal context from the authenticated business registry', () => {
    expect(terminalPageSource).toContain('buildRegisteredTerminalContext');
    expect(terminalPageSource).toContain('terminalRegistryLookup.get');
    expect(terminalPageSource).toContain('registered: true');
    expect(terminalPageSource).toContain('registeredTerminal.location_id');
  });

  it('requires a registered terminal before cashier shift opening', () => {
    expect(terminalPageSource).toContain('Select an active terminal registered to this business before cashier use.');
    expect(terminalPageSource).toContain('Select a registered terminal before opening the shift.');
    expect(terminalPageSource).toContain('No device cookie or terminal password is required.');
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
    expect(terminalPageSource).toContain('registeredTerminal.location_id');
  });

  it('keeps cashier credentials and shift ownership checks', () => {
    expect(terminalPageSource).toContain('Cashier password is required.');
    expect(terminalPageSource).toContain('Only the cashier who owns this open shift can continue it.');
    expect(terminalPageSource).toContain('authenticatedCashierId !== expectedCashierId');
  });
});
