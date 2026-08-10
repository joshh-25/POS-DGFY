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
  it('issues a tenant, terminal, version, and location-bound device token', () => {
    process.env.NODE_ENV = 'test';
    const token = pairingService.issue({
      tenantId: 'tenant-1',
      terminalId: 'counter-01',
      pairingVersion: '3d047440-b947-4f21-b2fa-2edc5ae0957f',
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
      pairingVersion: '3d047440-b947-4f21-b2fa-2edc5ae0957f',
      locationId: 3
    })).toBe(true);
  });

  it('rejects tampering, pairing-version rotation, and location reassignment', () => {
    process.env.NODE_ENV = 'test';
    const token = pairingService.issue({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      pairingVersion: '3d047440-b947-4f21-b2fa-2edc5ae0957f',
      locationId: 3
    });
    const claims = pairingService.verify(token);
    expect(() => pairingService.verify(`${token}tampered`)).toThrow(/pairing is missing, expired, or no longer valid/i);
    expect(() => pairingService.assertBinding({
      claims,
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      pairingVersion: '5f1c652d-5404-4d15-bd21-670b55699c40',
      locationId: 3
    })).toThrow(/pairing is missing, expired, or no longer valid/i);
    expect(() => pairingService.assertBinding({
      claims,
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      pairingVersion: '3d047440-b947-4f21-b2fa-2edc5ae0957f',
      locationId: 4
    })).toThrow(/pairing is missing, expired, or no longer valid/i);
  });

  it('requires a dedicated production secret', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.POS_TERMINAL_PAIRING_SECRET;
    expect(() => pairingService.issue({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      pairingVersion: '3d047440-b947-4f21-b2fa-2edc5ae0957f',
      locationId: 3
    })).toThrow(/POS_TERMINAL_PAIRING_SECRET/);
  });
});
