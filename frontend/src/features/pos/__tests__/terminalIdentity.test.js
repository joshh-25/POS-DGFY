import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERMINAL_ID,
  resolveLoginTerminalId,
  resolvePreferredTerminalId,
  sanitizeTerminalId
} from '../utils/terminalIdentity.js';

describe('POS terminal identity helpers', () => {
  it('defaults warn-mode tenants without registry or stored terminal to COUNTER-01', () => {
    expect(resolvePreferredTerminalId([], '', { registryMode: 'warn' })).toBe(DEFAULT_TERMINAL_ID);
  });

  it('keeps enforce-mode tenants without registry unresolved', () => {
    expect(resolvePreferredTerminalId([], '', { registryMode: 'enforce' })).toBe('');
  });

  it('uses the configured default terminal when registry entries exist', () => {
    expect(resolvePreferredTerminalId([
      { terminal_id: 'COUNTER-01', is_active: true, is_default: false },
      { terminal_id: 'KIOSK-01', is_active: true, is_default: true }
    ], '', { registryMode: 'warn' })).toBe('KIOSK-01');
  });

  it('preserves an unregistered operator entry in warn-mode login', () => {
    expect(resolveLoginTerminalId({
      selectedTerminalId: 'counter 09',
      registryEnforced: false,
      registryEntries: [{ terminal_id: 'COUNTER-01', is_active: true, is_default: true }],
      registryMode: 'warn'
    })).toBe('COUNTER-09');
  });

  it('resolves blank warn-mode login to the first-use default terminal', () => {
    expect(resolveLoginTerminalId({
      selectedTerminalId: '',
      registryEnforced: false,
      registryEntries: [],
      registryMode: 'warn'
    })).toBe(DEFAULT_TERMINAL_ID);
  });

  it('sanitizes terminal IDs to the backend-supported format', () => {
    expect(sanitizeTerminalId(' counter 01 ')).toBe('COUNTER-01');
  });
});
