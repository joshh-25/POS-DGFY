import { describe, expect, it } from '@jest/globals';
import * as pairingService from '../src/modules/pos/services/posTerminalPairingService.js';

describe('POS terminal pairing service', () => {
  it('issues and verifies a tenant and terminal-bound token', () => {
    const token = pairingService.issue({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      terminalPasswordHash: '$2a$10$terminal-password-hash',
      locationId: 3
    });

    const claims = pairingService.verify(token);
    expect(claims).toMatchObject({
      token_type: 'pos_terminal_pairing',
      tenant_id: 'tenant-1',
      terminal_id: 'COUNTER-01',
      location_id: 3
    });
    expect(pairingService.assertBinding({
      claims,
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      terminalPasswordHash: '$2a$10$terminal-password-hash',
      locationId: 3
    })).toBe(true);
  });

  it('rejects tampering and changed terminal bindings', () => {
    const token = pairingService.issue({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      terminalPasswordHash: '$2a$10$terminal-password-hash',
      locationId: 3
    });
    const claims = pairingService.verify(token);

    expect(() => pairingService.verify(`${token}tampered`)).toThrow(/pairing is missing, expired, or no longer valid/i);
    expect(() => pairingService.assertBinding({
      claims,
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      terminalPasswordHash: '$2a$10$changed-password-hash',
      locationId: 3
    })).toThrow(/pairing is missing, expired, or no longer valid/i);
  });
});
