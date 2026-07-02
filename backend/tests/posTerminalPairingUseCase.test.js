import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
  buildGetPairedPosTerminalUseCase,
  buildVerifyPosTerminalUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

const masterAdmin = { user_id: 15, permissions: ['pos:view', 'pos:transact'], is_master_admin: true };
const cashier = { user_id: 16, permissions: ['pos:view', 'pos:transact'], is_master_admin: false };

describe('POS passwordless device pairing use cases', () => {
  it('lets a DGFY-linked master admin pair an active location-bound terminal', async () => {
    const issue = jest.fn().mockReturnValue('paired-token');
    const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 3 });
    const resolveIdentityStatus = jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership', membership_id: 44 });
    const useCase = buildVerifyPosTerminalUseCase({
      posRepository: {
        getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({
          active_registry: [{ terminal_id: 'COUNTER-01', location_id: 3, is_active: true, pairing_version: 'version-1' }]
        })
      },
      terminalPairingService: { issue },
      resolveLocationScope,
      resolveIdentityStatus
    });
    const result = await dbStore.run({ tenantId: 'tenant-1' }, () => useCase({
      payload: { terminal_id: 'COUNTER-01' },
      user: masterAdmin
    }));
    expect(result.success).toBe(true);
    expect(issue).toHaveBeenCalledWith({
      tenantId: 'tenant-1', terminalId: 'COUNTER-01', locationId: 3, pairingVersion: 'version-1'
    });
  });

  it('rejects pairing enrollment by a cashier and rejects unauthorized locations', async () => {
    const base = {
      posRepository: {
        getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({
          active_registry: [{ terminal_id: 'COUNTER-01', location_id: 3, is_active: true, pairing_version: 'version-1' }]
        })
      },
      terminalPairingService: { issue: jest.fn() },
      resolveIdentityStatus: jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership', membership_id: 44 })
    };
    const cashierResult = await dbStore.run({ tenantId: 'tenant-1' }, () => buildVerifyPosTerminalUseCase({
      ...base, resolveLocationScope: jest.fn()
    })({ payload: { terminal_id: 'COUNTER-01' }, user: cashier }));
    expect(cashierResult.success).toBe(false);
    expect(cashierResult.error.statusCode).toBe(403);

    const deniedResult = await dbStore.run({ tenantId: 'tenant-1' }, () => buildVerifyPosTerminalUseCase({
      ...base,
      resolveLocationScope: jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { statusCode: 403 }))
    })({ payload: { terminal_id: 'COUNTER-01' }, user: masterAdmin }));
    expect(deniedResult.success).toBe(false);
    expect(deniedResult.error.statusCode).toBe(403);
  });

  it('revalidates terminal version, location, and current DGFY identity on every paired use', async () => {
    const assertBinding = jest.fn().mockReturnValue(true);
    const useCase = buildGetPairedPosTerminalUseCase({
      posRepository: {
        getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({
          active_registry: [{ terminal_id: 'COUNTER-01', location_id: 3, is_active: true, pairing_version: 'version-1' }]
        })
      },
      terminalPairingService: {
        verify: jest.fn().mockReturnValue({ tenant_id: 'tenant-1', terminal_id: 'COUNTER-01', location_id: 3 }),
        assertBinding
      },
      resolveIdentityStatus: jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership', membership_id: 44 }),
      resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 3 })
    });
    const result = await dbStore.run({ tenantId: 'tenant-1' }, () => useCase({ pairingToken: 'cookie-token', user: cashier }));
    expect(result.success).toBe(true);
    expect(assertBinding).toHaveBeenCalledWith(expect.objectContaining({ pairingVersion: 'version-1' }));
  });

  it('rejects a deactivated terminal', async () => {
    const useCase = buildGetPairedPosTerminalUseCase({
      posRepository: { getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({ active_registry: [] }) },
      terminalPairingService: { verify: jest.fn().mockReturnValue({ terminal_id: 'COUNTER-01' }), assertBinding: jest.fn() },
      resolveIdentityStatus: jest.fn(),
      resolveLocationScope: jest.fn()
    });
    const result = await dbStore.run({ tenantId: 'tenant-1' }, () => useCase({ pairingToken: 'token', user: cashier }));
    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(401);
  });
});
