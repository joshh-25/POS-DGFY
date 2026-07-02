import { describe, expect, it } from '@jest/globals';
import {
  hashTerminalRegistrySecrets,
  sanitizeTerminalRegistryForRead
} from '../src/modules/settings/usecases/posTerminalRegistrySecrets.js';

describe('POS terminal registry pairing versions', () => {
  it('creates stable pairing versions, rotates changed bindings, and removes reusable password hashes', async () => {
    const initial = await hashTerminalRegistrySecrets({
      currentEntries: [],
      incomingEntries: [
        { terminal_id: 'COUNTER-01', location_id: 1, is_active: true, terminal_password: 'legacy-secret' },
        { terminal_id: 'COUNTER-02', location_id: 1, is_active: true }
      ]
    });
    expect(initial[0].pairing_version).toBeTruthy();
    expect(initial[1].pairing_version).toBeTruthy();
    expect(initial[0].terminal_password_hash).toBe('');

    const unchanged = await hashTerminalRegistrySecrets({ currentEntries: initial, incomingEntries: initial });
    expect(unchanged[0].pairing_version).toBe(initial[0].pairing_version);

    const moved = await hashTerminalRegistrySecrets({
      currentEntries: initial,
      incomingEntries: [{ ...initial[0], location_id: 2 }]
    });
    expect(moved[0].pairing_version).not.toBe(initial[0].pairing_version);

    const readable = sanitizeTerminalRegistryForRead(initial);
    expect(readable[0]).toEqual(expect.objectContaining({ terminal_id: 'COUNTER-01', paired_device_ready: true }));
    expect(JSON.stringify(readable)).not.toContain('terminal_password');
  });
});
