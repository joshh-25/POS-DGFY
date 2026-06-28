import bcrypt from 'bcryptjs';
import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
  buildGetPairedPosTerminalUseCase,
  buildVerifyPosTerminalUseCase
} from '../src/modules/pos/usecases/posUseCases.js';

const registryEntry = {
  terminal_id: 'COUNTER-01',
  label: 'Front Counter',
  location_id: 3,
  terminal_password_hash: '$2a$10$terminal-password-hash'
};

describe('POS terminal pairing use cases', () => {
  it('issues a pairing after terminal password verification', async () => {
    const passwordHash = await bcrypt.hash('terminal-secret', 4);
    const issue = jest.fn().mockReturnValue('paired-token');
    const useCase = buildVerifyPosTerminalUseCase({
      posRepository: {
        getTerminalIdentityPolicySecretSettings: jest.fn().mockResolvedValue({
          mode: 'enforce',
          binding_enforced: true,
          active_registry: [{ ...registryEntry, terminal_password_hash: passwordHash }]
        })
      },
      terminalPairingService: { issue }
    });

    const result = await dbStore.run({ tenantId: 'tenant-1' }, () => useCase({
      payload: { terminal_id: 'COUNTER-01', terminal_password: 'terminal-secret' },
      user: { user_id: 15 }
    }));

    expect(result.success).toBe(true);
    expect(result.data.pairing_token).toBe('paired-token');
    expect(issue).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      locationId: 3
    }));
  });

  it('resolves a paired terminal only when the cashier has its location grant', async () => {
    const verify = jest.fn().mockReturnValue({ terminal_id: 'COUNTER-01' });
    const assertBinding = jest.fn().mockReturnValue(true);
    const useCase = buildGetPairedPosTerminalUseCase({
      posRepository: {
        getTerminalIdentityPolicySecretSettings: jest.fn().mockResolvedValue({
          mode: 'enforce',
          binding_enforced: true,
          active_registry: [registryEntry]
        })
      },
      terminalPairingService: { verify, assertBinding }
    });

    const store = {
      tenantId: 'tenant-1',
      SystemSetting: { findOne: jest.fn().mockResolvedValue({ setting_value: true }) },
      TenantLocation: { findAll: jest.fn().mockResolvedValue([{ location_id: 3 }]) },
      User: { findByPk: jest.fn().mockResolvedValue({ user_id: 15, is_master_admin: false }) },
      UserLocationGrant: { findAll: jest.fn().mockResolvedValue([{ location_id: 3 }]) }
    };
    const result = await dbStore.run(store, () => useCase({
      pairingToken: 'paired-token',
      user: { user_id: 15, role: 'cashier' }
    }));

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      paired: true,
      terminal_identity_policy: {
        terminal_id: 'COUNTER-01',
        registry_entry: { location_id: 3 }
      }
    });
  });

  it('rejects a paired terminal outside the cashier location grant', async () => {
    const useCase = buildGetPairedPosTerminalUseCase({
      posRepository: {
        getTerminalIdentityPolicySecretSettings: jest.fn().mockResolvedValue({
          mode: 'enforce',
          binding_enforced: true,
          active_registry: [registryEntry]
        })
      },
      terminalPairingService: {
        verify: jest.fn().mockReturnValue({ terminal_id: 'COUNTER-01' }),
        assertBinding: jest.fn().mockReturnValue(true)
      }
    });
    const store = {
      tenantId: 'tenant-1',
      SystemSetting: { findOne: jest.fn().mockResolvedValue({ setting_value: true }) },
      TenantLocation: { findAll: jest.fn().mockResolvedValue([{ location_id: 3 }]) },
      User: { findByPk: jest.fn().mockResolvedValue({ user_id: 15, is_master_admin: false }) },
      UserLocationGrant: { findAll: jest.fn().mockResolvedValue([{ location_id: 4 }]) }
    };
    const result = await dbStore.run(store, () => useCase({
      pairingToken: 'paired-token',
      user: { user_id: 15, role: 'cashier' }
    }));

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(403);
  });
});
