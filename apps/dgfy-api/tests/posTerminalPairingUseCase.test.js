import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { buildGetPairedPosTerminalUseCase } from '../src/modules/pos/usecases/posUseCases.js';

const cashier = { user_id: 16, permissions: ['pos:view', 'pos:transact'], is_master_admin: false };

describe('POS registered terminal authorization', () => {
  it('authorizes an active terminal from the authenticated business registry', async () => {
    const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 3 });
    const resolveIdentityStatus = jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership', membership_id: 44 });
    const useCase = buildGetPairedPosTerminalUseCase({
      posRepository: {
        getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({
          active_registry: [{ terminal_id: 'COUNTER-01', location_id: 3, is_active: true }]
        })
      },
      resolveIdentityStatus,
      resolveLocationScope
    });

    const result = await dbStore.run({ tenantId: 'tenant-1' }, () => useCase({
      terminalId: 'counter-01',
      user: cashier
    }));

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      registered: true,
      terminal_id: 'COUNTER-01',
      location_id: 3
    }));
    expect(resolveIdentityStatus).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }));
    expect(resolveLocationScope).toHaveBeenCalledWith(expect.objectContaining({ requestedLocationId: 3, userId: 16 }));
  });

  it('rejects a terminal that is not active in the selected business', async () => {
    const useCase = buildGetPairedPosTerminalUseCase({
      posRepository: { getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({ active_registry: [] }) },
      resolveIdentityStatus: jest.fn(),
      resolveLocationScope: jest.fn()
    });

    const result = await dbStore.run({ tenantId: 'tenant-1' }, () => useCase({
      terminalId: 'COUNTER-01',
      user: cashier
    }));

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(403);
    expect(result.error.details.reason_code).toBe('POS_TERMINAL_INACTIVE_OR_UNKNOWN');
  });

  it('requires an explicit terminal ID instead of a device cookie', async () => {
    const useCase = buildGetPairedPosTerminalUseCase({
      posRepository: { getTerminalPairingPolicySettings: jest.fn() },
      resolveIdentityStatus: jest.fn(),
      resolveLocationScope: jest.fn()
    });

    const result = await dbStore.run({ tenantId: 'tenant-1' }, () => useCase({ user: cashier }));

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(422);
    expect(result.error.details.reason_code).toBe('POS_TERMINAL_ID_REQUIRED');
  });
});
