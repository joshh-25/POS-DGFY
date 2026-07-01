import { describe, expect, it } from '@jest/globals';
import bcrypt from 'bcryptjs';
import {
  hashTerminalRegistrySecrets,
  sanitizeTerminalRegistryForRead
} from '../src/modules/settings/usecases/posTerminalRegistrySecrets.js';

describe('POS terminal registry secrets', () => {
  it('hashes new passwords, preserves existing hashes, and never returns hashes to clients', async () => {
    const existingHash = await bcrypt.hash('old-terminal-password', 4);
    const merged = await hashTerminalRegistrySecrets({
      currentEntries: [{ terminal_id: 'COUNTER-01', terminal_password_hash: existingHash }],
      incomingEntries: [
        { terminal_id: 'COUNTER-01', location_id: 1, is_active: true },
        { terminal_id: 'COUNTER-02', location_id: 1, is_active: true, terminal_password: 'new-terminal-password' }
      ]
    });
    expect(merged[0].terminal_password_hash).toBe(existingHash);
    expect(await bcrypt.compare('new-terminal-password', merged[1].terminal_password_hash)).toBe(true);
    const readable = sanitizeTerminalRegistryForRead(merged);
    expect(readable).toEqual([
      expect.objectContaining({ terminal_id: 'COUNTER-01', has_terminal_password: true }),
      expect.objectContaining({ terminal_id: 'COUNTER-02', has_terminal_password: true })
    ]);
    expect(JSON.stringify(readable)).not.toContain('terminal_password_hash');
  });
});
