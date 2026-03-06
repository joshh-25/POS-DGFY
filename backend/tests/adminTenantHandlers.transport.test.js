import { jest } from '@jest/globals';

const mockRegisterCompanyRequestUseCase = jest.fn();
const mockListTenantsUseCase = jest.fn();
const mockApproveTenantUseCase = jest.fn();
const mockRejectTenantUseCase = jest.fn();
const mockProvisionNewTenantUseCase = jest.fn();
const mockGetPricingSettingsUseCase = jest.fn();
const mockUpdatePricingSettingsUseCase = jest.fn();
const mockUpdateTenantUseCase = jest.fn();
const mockDeleteTenantUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/tenants/index.js', () => ({
  registerCompanyRequestUseCase: mockRegisterCompanyRequestUseCase,
  listTenantsUseCase: mockListTenantsUseCase,
  approveTenantUseCase: mockApproveTenantUseCase,
  rejectTenantUseCase: mockRejectTenantUseCase,
  provisionNewTenantUseCase: mockProvisionNewTenantUseCase,
  getPricingSettingsUseCase: mockGetPricingSettingsUseCase,
  updatePricingSettingsUseCase: mockUpdatePricingSettingsUseCase,
  updateTenantUseCase: mockUpdateTenantUseCase,
  deleteTenantUseCase: mockDeleteTenantUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let listTenants;
let approveTenant;
let getPricingSettings;

beforeAll(async () => {
  const mod = await import('../src/modules/tenants/controllers/adminTenantHandlers.js');
  listTenants = mod.listTenants;
  approveTenant = mod.approveTenant;
  getPricingSettings = mod.getPricingSettings;
});

const createRes = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('adminTenantHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('listTenants keeps stable success payload', async () => {
    mockListTenantsUseCase.mockResolvedValue({
      success: true,
      data: [{ id: 1, name: 'Tenant A', status: 'pending' }]
    });

    const req = {
      query: { status: 'pending' },
      user: { user_id: 1, tenant_id: 'landlord', is_master_admin: true },
      requestId: 'req-admin-tenants'
    };
    const res = createRes();

    await listTenants(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_tenants_viewed',
      surface: 'admin_tenants',
      action: 'list_tenants'
    }));
  });

  it('approveTenant keeps stable success payload', async () => {
    mockApproveTenantUseCase.mockResolvedValue({
      success: true,
      data: { id: 7, status: 'approved' }
    });

    const req = {
      params: { id: '7' },
      user: { user_id: 1, tenant_id: 'landlord', is_master_admin: true },
      requestId: 'req-admin-approve'
    };
    const res = createRes();

    await approveTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_tenant_approved',
      surface: 'admin_tenants',
      action: 'approve_tenant'
    }));
  });

  it('getPricingSettings preserves error payload shape', async () => {
    mockGetPricingSettingsUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Pricing settings unavailable',
        details: null,
        statusCode: 500
      }
    });

    const req = {
      user: { user_id: 1, tenant_id: 'landlord', is_master_admin: true },
      requestId: 'req-admin-pricing'
    };
    const res = createRes();

    await getPricingSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Pricing settings unavailable'
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_pricing_settings_viewed',
      surface: 'admin_tenants',
      action: 'view_pricing_settings'
    }));
  });
});
