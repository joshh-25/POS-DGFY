import bcrypt from 'bcryptjs';
import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
  buildGetPairedPosTerminalUseCase,
  buildVerifyPosTerminalUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

const user = { user_id: 15, permissions: ['pos:view', 'pos:transact'], is_master_admin: false };

describe('POS terminal pairing use cases', () => {
  it('issues pairing only after password, identity, and location authorization pass', async () => {
    const passwordHash = await bcrypt.hash('terminal-secret', 4);
    const issue = jest.fn().mockReturnValue('paired-token');
    const resolveLocationScope = jest.fn().mockResolvedValue({ location_id: 3 });
    const resolveIdentityStatus = jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership', membership_id: 44 });
    const useCase = buildVerifyPosTerminalUseCase({
      posRepository: {
        getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({
          active_registry: [{ terminal_id: 'COUNTER-01', location_id: 3, is_active: true, terminal_password_hash: passwordHash }]
        })
      },
      terminalPairingService: { issue },
      resolveLocationScope,
      resolveIdentityStatus
    });
    const result = await dbStore.run({ tenantId: 'tenant-1' }, () => useCase({
      payload: { terminal_id: 'COUNTER-01', terminal_password: 'terminal-secret' },
      user
    }));
    expect(result.success).toBe(true);
    expect(resolveLocationScope).toHaveBeenCalledWith(expect.objectContaining({ requestedLocationId: 3, userId: 15 }));
    expect(issue).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', terminalId: 'COUNTER-01', locationId: 3, identityMode: 'dgfy_membership', membershipId: 44
    }));
  });

  it('fails closed for incorrect password and unauthorized location', async () => {
    const passwordHash = await bcrypt.hash('terminal-secret', 4);
    const repository = {
      getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({
        active_registry: [{ terminal_id: 'COUNTER-01', location_id: 3, is_active: true, terminal_password_hash: passwordHash }]
      })
    };
    const base = {
      posRepository: repository,
      terminalPairingService: { issue: jest.fn() },
      resolveIdentityStatus: jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership', membership_id: 44 })
    };
    const wrongPassword = buildVerifyPosTerminalUseCase({ ...base, resolveLocationScope: jest.fn() });
    const wrongResult = await dbStore.run({ tenantId: 'tenant-1' }, () => wrongPassword({
      payload: { terminal_id: 'COUNTER-01', terminal_password: 'wrong-secret' }, user
    }));
    expect(wrongResult.success).toBe(false);
    expect(wrongResult.error.statusCode).toBe(401);

    const deniedLocation = buildVerifyPosTerminalUseCase({
      ...base,
      resolveLocationScope: jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { statusCode: 403 }))
    });
    const deniedResult = await dbStore.run({ tenantId: 'tenant-1' }, () => deniedLocation({
      payload: { terminal_id: 'COUNTER-01', terminal_password: 'terminal-secret' }, user
    }));
    expect(deniedResult.success).toBe(false);
    expect(deniedResult.error.statusCode).toBe(403);
  });

  it('revalidates registry binding and DGFY identity on every paired use', async () => {
    const verify = jest.fn().mockReturnValue({
      tenant_id: 'tenant-1', terminal_id: 'COUNTER-01', location_id: 3,
      identity_mode: 'dgfy_membership', membership_id: 44
    });
    const assertBinding = jest.fn().mockReturnValue(true);
    const useCase = buildGetPairedPosTerminalUseCase({
      posRepository: {
        getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({
          active_registry: [{ terminal_id: 'COUNTER-01', location_id: 3, is_active: true, terminal_password_hash: 'hash-one' }]
        })
      },
      terminalPairingService: { verify, assertBinding },
      resolveIdentityStatus: jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership', membership_id: 44 }),
      resolveLocationScope: jest.fn().mockResolvedValue({ location_id: 3 })
    });
    const result = await dbStore.run({ tenantId: 'tenant-1' }, () => useCase({ pairingToken: 'cookie-token', user }));
    expect(result.success).toBe(true);
    expect(assertBinding).toHaveBeenCalled();
    expect(result.data).toMatchObject({ paired: true, terminal_id: 'COUNTER-01', location_id: 3 });
  });

  it('rejects changed membership and deactivated terminals', async () => {
    const claims = { tenant_id: 'tenant-1', terminal_id: 'COUNTER-01', location_id: 3, identity_mode: 'dgfy_membership', membership_id: 44 };
    const base = {
      terminalPairingService: { verify: jest.fn().mockReturnValue(claims), assertBinding: jest.fn() },
      resolveLocationScope: jest.fn(),
      resolveIdentityStatus: jest.fn().mockResolvedValue({ identity_mode: 'dgfy_membership', membership_id: 99 })
    };
    const changedIdentity = buildGetPairedPosTerminalUseCase({
      ...base,
      posRepository: { getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({ active_registry: [{ terminal_id: 'COUNTER-01', location_id: 3, terminal_password_hash: 'hash' }] }) }
    });
    const changedResult = await dbStore.run({ tenantId: 'tenant-1' }, () => changedIdentity({ pairingToken: 'token', user }));
    expect(changedResult.success).toBe(false);
    expect(changedResult.error.statusCode).toBe(403);

    const deactivated = buildGetPairedPosTerminalUseCase({
      ...base,
      posRepository: { getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({ active_registry: [] }) }
    });
    const deactivatedResult = await dbStore.run({ tenantId: 'tenant-1' }, () => deactivated({ pairingToken: 'token', user }));
    expect(deactivatedResult.success).toBe(false);
    expect(deactivatedResult.error.statusCode).toBe(401);
  });
});
