import { describe, expect, it } from 'vitest';
import {
  createSuggestedTerminalId,
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

  it('prefers a password-ready active terminal when the default terminal is not unlock-ready', () => {
    expect(resolvePreferredTerminalId([
      { terminal_id: 'COUNTER-01', is_active: true, is_default: true, has_password: false },
      { terminal_id: 'COUNTER-02', is_active: true, is_default: false, has_password: true }
    ], '', { registryMode: 'warn' })).toBe('COUNTER-02');
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

  it('falls back to the best active registered terminal in enforce mode when the saved terminal is stale', () => {
    expect(resolveLoginTerminalId({
      selectedTerminalId: 'counter 99',
      registryEnforced: true,
      registryEntries: [
        { terminal_id: 'COUNTER-01', is_active: true, is_default: false, has_password: false },
        { terminal_id: 'COUNTER-02', is_active: true, is_default: true, has_password: true }
      ],
      registryMode: 'enforce'
    })).toBe('COUNTER-02');
  });

  it('sanitizes terminal IDs to the backend-supported format', () => {
    expect(sanitizeTerminalId(' counter 01 ')).toBe('COUNTER-01');
  });

  it('suggests the next available terminal ID from existing registry entries', () => {
    expect(createSuggestedTerminalId([
      { terminal_id: 'counter 01' },
      { terminal_id: 'COUNTER-02' }
    ])).toBe('COUNTER-03');
  });
});
