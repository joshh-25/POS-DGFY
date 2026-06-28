import { afterEach, describe, expect, it } from '@jest/globals';
import * as pairingService from '../src/modules/pos/services/posTerminalPairingService.js';

const originalEnvironment = process.env.NODE_ENV;
const originalSecret = process.env.POS_TERMINAL_PAIRING_SECRET;

afterEach(() => {
  process.env.NODE_ENV = originalEnvironment;
  if (originalSecret == null) delete process.env.POS_TERMINAL_PAIRING_SECRET;
  else process.env.POS_TERMINAL_PAIRING_SECRET = originalSecret;
});
describe('POS terminal pairing service', () => {
  it('issues a tenant, terminal, location, and identity-bound token', () => {
    process.env.NODE_ENV = 'test';
    const token = pairingService.issue({
      tenantId: 'tenant-1',
      terminalId: 'counter-01',
      terminalPasswordHash: '$2a$12$terminal-password-hash',
      locationId: 3,
      identityMode: 'dgfy_membership',
      membershipId: 44
    });
    const claims = pairingService.verify(token);
    expect(claims).toMatchObject({
      token_type: 'pos_terminal_pairing',
      tenant_id: 'tenant-1',
      terminal_id: 'COUNTER-01',
      location_id: 3,
      identity_mode: 'dgfy_membership',
      membership_id: 44
    });
    expect(pairingService.assertBinding({
      claims,
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      terminalPasswordHash: '$2a$12$terminal-password-hash',
      locationId: 3
    })).toBe(true);
  });

  it('rejects tampering, password changes, and location reassignment', () => {
    process.env.NODE_ENV = 'test';
    const token = pairingService.issue({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      terminalPasswordHash: 'hash-one',
      locationId: 3,
      identityMode: 'legacy_grace'
    });
    const claims = pairingService.verify(token);
    expect(() => pairingService.verify(`${token}tampered`)).toThrow(/pairing is missing, expired, or no longer valid/i);
    expect(() => pairingService.assertBinding({
      claims,
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      terminalPasswordHash: 'hash-two',
      locationId: 3
    })).toThrow(/pairing is missing, expired, or no longer valid/i);
    expect(() => pairingService.assertBinding({
      claims,
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      terminalPasswordHash: 'hash-one',
      locationId: 4
    })).toThrow(/pairing is missing, expired, or no longer valid/i);
  });

  it('requires a dedicated production secret', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.POS_TERMINAL_PAIRING_SECRET;
    expect(() => pairingService.issue({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      terminalPasswordHash: 'hash-one',
      locationId: 3,
      identityMode: 'dgfy_membership',
      membershipId: 44
    })).toThrow(/POS_TERMINAL_PAIRING_SECRET/);
  });
});
