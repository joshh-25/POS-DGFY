import { describe, expect, it, jest } from '@jest/globals';

const mockMembershipFindAll = jest.fn();
const mockUserFindByPk = jest.fn();
const mockGetConnection = jest.fn();
const mockGetTenantModels = jest.fn();
const mockDbStore = {
  get: jest.fn(),
  run: jest.fn()
};
const mockGenerateToken = jest.fn();
const mockGenerateRefreshToken = jest.fn();
const mockGetOnboardingStatus = jest.fn();
const mockResolveEffectivePermissions = jest.fn();
const mockSystemSettingFindOne = jest.fn();

jest.unstable_mockModule('../src/models/index.js', () => ({
  DgfyAccountTenantMembership: { findAll: mockMembershipFindAll },
  Tenant: {}
}));
jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({
  default: { getConnection: mockGetConnection }
}));
jest.unstable_mockModule('../src/utils/dbStore.js', () => ({ default: mockDbStore }));
jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({
  getTenantModels: mockGetTenantModels
}));
jest.unstable_mockModule('../src/services/authService.js', () => ({
  generateToken: mockGenerateToken,
  generateRefreshToken: mockGenerateRefreshToken
}));
jest.unstable_mockModule('../src/modules/onboarding/repositories/onboardingRepository.js', () => ({
  onboardingRepository: { getStatus: mockGetOnboardingStatus }
}));
jest.unstable_mockModule('../src/utils/userPermissions.js', () => ({
  resolveEffectivePermissions: mockResolveEffectivePermissions
}));
jest.unstable_mockModule('../src/services/userService.js', () => ({
  updateOwnPosDayClosePinForVerifiedDgfyAccount: jest.fn()
}));

const { createTenantSessionForDgfyAccount } = await import('../src/services/dgfyTenantSessionService.js');

describe('DGFY tenant session authority normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConnection.mockResolvedValue({});
    mockGetTenantModels.mockReturnValue({});
    mockGenerateToken.mockReturnValue('tenant-access-token');
    mockGenerateRefreshToken.mockReturnValue('tenant-refresh-token');
    mockGetOnboardingStatus.mockResolvedValue({ completed: false });
    mockSystemSettingFindOne.mockResolvedValue(null);
    mockResolveEffectivePermissions.mockReturnValue(['pos:transact']);
    mockDbStore.get.mockImplementation((modelName) => {
      if (modelName === 'User') return { findByPk: mockUserFindByPk };
      if (modelName === 'StaffRole') return {};
      if (modelName === 'SystemSetting') return { findOne: mockSystemSettingFindOne };
      return null;
    });
    mockDbStore.run.mockImplementation(async (_context, callback) => callback());
  });

  it('returns a canonical boolean for a database numeric master-admin flag', async () => {
    const user = {
      user_id: 11,
      username: 'admin',
      email: 'admin@test.com',
      phone_number: null,
      role: 'admin',
      is_active: 1,
      deleted_at: null,
      is_master_admin: 1,
      permissions: ['pos:transact'],
      pos_day_close_pin_hash: null,
      update: jest.fn().mockResolvedValue(null)
    };
    mockMembershipFindAll.mockResolvedValue([{
      tenant_user_id: 11,
      status: 'accepted',
      tenant: {
        id: 'tenant-1',
        name: 'Test Tenant',
        db_name: 'sku_test_tenant',
        company_token: 'tenant-token',
        status: 'active',
        plan: 'premium'
      }
    }]);
    mockUserFindByPk.mockResolvedValue(user);

    const session = await createTenantSessionForDgfyAccount({
      account: { id: 'dgfy-admin', email: 'admin@test.com' },
      tenantId: 'tenant-1'
    });

    expect(session.is_master_admin).toBe(true);
    expect(session.can_configure_pos_global_pin).toBe(true);
    expect(session.pos_global_pin_configured).toBe(false);
    expect(session.onboarding).toEqual({ completed: false });
    expect(session.tenant_capabilities).toEqual({ pos_enabled: true });
    expect(mockGetOnboardingStatus).toHaveBeenCalledWith({ storeNameBaseline: 'Test Tenant' });
  });

  it('returns the tenant POS capability for catalog-only POS routing', async () => {
    const user = {
      user_id: 11,
      username: 'admin',
      email: 'admin@test.com',
      phone_number: null,
      role: 'admin',
      is_active: 1,
      deleted_at: null,
      is_master_admin: 0,
      permissions: ['items:create', 'items:edit', 'categories:manage'],
      pos_day_close_pin_hash: null,
      update: jest.fn().mockResolvedValue(null)
    };
    mockResolveEffectivePermissions.mockReturnValue(['items:create', 'items:edit', 'categories:manage']);
    mockSystemSettingFindOne.mockResolvedValue({ setting_value: 'false' });
    mockMembershipFindAll.mockResolvedValue([{
      tenant_user_id: 11,
      status: 'accepted',
      tenant: {
        id: 'tenant-catalog-only',
        name: 'Catalog Only Tenant',
        db_name: 'sku_catalog_only_tenant',
        company_token: 'catalog-only-token',
        status: 'active',
        plan: 'free'
      }
    }]);
    mockUserFindByPk.mockResolvedValue(user);

    const session = await createTenantSessionForDgfyAccount({
      account: { id: 'dgfy-admin', email: 'admin@test.com' },
      tenantId: 'tenant-catalog-only'
    });

    expect(session.company.pos_enabled).toBe(false);
    expect(session.tenant_capabilities).toEqual({ pos_enabled: false });
    expect(mockSystemSettingFindOne).toHaveBeenCalledWith({
      where: { setting_key: 'tenant_pos_enabled' },
      attributes: ['setting_value']
    });
  });
});
