import { describe, expect, it, jest } from '@jest/globals';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import { PERMISSIONS } from '../src/config/permissions.js';

const mockTenant = { findByPk: jest.fn() };
const mockGetConnection = jest.fn();
const mockGetTenantModels = jest.fn();
const mockDbStore = {
  get: jest.fn(),
  run: jest.fn()
};

jest.unstable_mockModule('../src/models/index.js', () => ({ Tenant: mockTenant }));
jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
  default: { getConnection: mockGetConnection }
}));
jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
  getTenantModels: mockGetTenantModels
}));
jest.unstable_mockModule('../src/utils/dbStore.js', () => ({ default: mockDbStore }));

const { validateDgfyPosTerminalPolicy } = await import('../src/services/dgfyPosTerminalPolicyService.js');

describe('DGFY POS terminal cashier assignment policy', () => {
  const systemSetting = {
    findAll: jest.fn().mockResolvedValue([
      {
        setting_key: 'pos_terminal_registry',
        setting_value: JSON.stringify([{
          terminal_id: 'COUNTER-01',
          location_id: 7,
          cashier_user_ids: [21],
          is_active: true
        }])
      },
      { setting_key: 'pos_terminal_registry_mode', setting_value: 'enforce' },
      { setting_key: 'pos_terminal_location_binding_enforced', setting_value: 'true' }
    ])
  };
  const userLocationGrant = { count: jest.fn().mockResolvedValue(1) };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenant.findByPk.mockResolvedValue({
      id: 'tenant-1',
      status: 'active',
      company_token: 'tenant-token',
      name: 'Test Tenant',
      plan: 'premium'
    });
    mockGetConnection.mockResolvedValue({});
    mockGetTenantModels.mockReturnValue({});
    mockDbStore.get.mockImplementation((modelName) => {
      if (modelName === 'SystemSetting') return systemSetting;
      if (modelName === 'UserLocationGrant') return userLocationGrant;
      return null;
    });
    mockDbStore.run.mockImplementation((_context, callback) => callback());
  });

  it('denies a cashier who has a location grant but is not assigned to the terminal', async () => {
    await expect(validateDgfyPosTerminalPolicy({
      tenantId: 'tenant-1',
      terminalId: 'counter-01',
      tenantUserId: 22,
      userRole: 'cashier',
      permissions: [],
      isMasterAdmin: false
    })).rejects.toMatchObject({
      code: DomainErrorCode.AUTHORIZATION_FAILED,
      statusCode: 403,
      details: {
        terminal_identity_policy: expect.objectContaining({
          reason_code: 'CASHIER_TERMINAL_NOT_ASSIGNED',
          registry_entry: expect.objectContaining({ cashier_user_ids: [21] })
        })
      }
    });
    expect(userLocationGrant.count).toHaveBeenCalledWith({
      where: { user_id: 22, location_id: 7 }
    });
  });

  it('allows an explicitly assigned cashier after the existing location grant check', async () => {
    await expect(validateDgfyPosTerminalPolicy({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      tenantUserId: 21,
      userRole: 'cashier',
      permissions: [],
      isMasterAdmin: false
    })).resolves.toEqual(expect.objectContaining({
      reason_code: 'ALLOWED',
      registry_entry: expect.objectContaining({ cashier_user_ids: [21] })
    }));
  });

  it('preserves master-admin access when the terminal has explicit cashier assignments', async () => {
    await expect(validateDgfyPosTerminalPolicy({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      tenantUserId: null,
      userRole: 'admin',
      permissions: [],
      isMasterAdmin: true
    })).resolves.toEqual(expect.objectContaining({
      reason_code: 'ALLOWED',
      registry_entry: expect.objectContaining({ cashier_user_ids: [21] })
    }));
    expect(userLocationGrant.count).not.toHaveBeenCalled();
  });

  it('allows the accepted tenant owner admin without a branch grant', async () => {
    await expect(validateDgfyPosTerminalPolicy({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      tenantUserId: 22,
      userRole: 'admin',
      permissions: ['pos:transact'],
      isMasterAdmin: false,
      isTenantOwner: true
    })).resolves.toEqual(expect.objectContaining({
      reason_code: 'ALLOWED',
      registry_entry: expect.objectContaining({ cashier_user_ids: [21] })
    }));
    expect(userLocationGrant.count).not.toHaveBeenCalled();
  });

  it('does not treat switch-location permission as a terminal assignment bypass', async () => {
    await expect(validateDgfyPosTerminalPolicy({
      tenantId: 'tenant-1',
      terminalId: 'COUNTER-01',
      tenantUserId: 22,
      userRole: 'cashier',
      permissions: [PERMISSIONS.POS.actions.SWITCH_LOCATION_POS],
      isMasterAdmin: false
    })).rejects.toMatchObject({
      code: DomainErrorCode.AUTHORIZATION_FAILED,
      statusCode: 403,
      details: {
        terminal_identity_policy: expect.objectContaining({
          reason_code: 'CASHIER_TERMINAL_NOT_ASSIGNED',
          registry_entry: expect.objectContaining({ cashier_user_ids: [21] })
        })
      }
    });
    expect(userLocationGrant.count).toHaveBeenCalledWith({
      where: { user_id: 22, location_id: 7 }
    });
  });
});
