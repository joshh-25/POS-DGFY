import { jest } from '@jest/globals';

const mockRegisterCompanyRequestUseCase = jest.fn();
const mockListTenantsUseCase = jest.fn();
const mockGetTenantUseCase = jest.fn();
const mockApproveTenantUseCase = jest.fn();
const mockRejectTenantUseCase = jest.fn();
const mockProvisionNewTenantUseCase = jest.fn();
const mockCreateAdminProvisionedAccountAndTenantUseCase = jest.fn();
const mockCreateAdminProvisionedTenantUseCase = jest.fn();
const mockAssignTenantOwnerByAdminUseCase = jest.fn();
const mockGetPricingSettingsUseCase = jest.fn();
const mockUpdatePricingSettingsUseCase = jest.fn();
const mockUpdateTenantUseCase = jest.fn();
const mockDeleteTenantUseCase = jest.fn();
const mockResubmitRegistrationUseCase = jest.fn();
const mockUpdateTenantCapabilitiesUseCase = jest.fn();
const mockApplyTemplateToTenantUseCase = jest.fn();
const mockListTenantCapabilityAuditLogsUseCase = jest.fn();
const mockListTenantPosMetadataAuditLogsUseCase = jest.fn();
const mockGetTenantPosMetadataUseCase = jest.fn();
const mockUpdateTenantPosMetadataUseCase = jest.fn();
const mockGetTenantAffiliateSlotsUseCase = jest.fn();
const mockUpdateTenantAffiliateSlotsUseCase = jest.fn();
const mockListTenantAffiliateSlotsAuditLogsUseCase = jest.fn();
const mockApproveCompanyRegistrationDraftUseCase = jest.fn();
const mockListAdminCompanyRegistrationDraftsUseCase = jest.fn();
const mockListCompanyRegistrationUploadsUseCase = jest.fn();
const mockDownloadCompanyRegistrationUploadUseCase = jest.fn();
const mockDownloadCompanyRegistrationMenuArchiveUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();
const mockSetupPayPalRecurringUseCase = jest.fn();
const mockChangePlanUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/tenants/index.js', () => ({
  registerCompanyRequestUseCase: mockRegisterCompanyRequestUseCase,
  listTenantsUseCase: mockListTenantsUseCase,
  getTenantUseCase: mockGetTenantUseCase,
  approveTenantUseCase: mockApproveTenantUseCase,
  rejectTenantUseCase: mockRejectTenantUseCase,
  provisionNewTenantUseCase: mockProvisionNewTenantUseCase,
  createAdminProvisionedAccountAndTenantUseCase: mockCreateAdminProvisionedAccountAndTenantUseCase,
  createAdminProvisionedTenantUseCase: mockCreateAdminProvisionedTenantUseCase,
  assignTenantOwnerByAdminUseCase: mockAssignTenantOwnerByAdminUseCase,
  getPricingSettingsUseCase: mockGetPricingSettingsUseCase,
  updatePricingSettingsUseCase: mockUpdatePricingSettingsUseCase,
  updateTenantUseCase: mockUpdateTenantUseCase,
  deleteTenantUseCase: mockDeleteTenantUseCase,
  resubmitRegistrationUseCase: mockResubmitRegistrationUseCase,
  updateTenantCapabilitiesUseCase: mockUpdateTenantCapabilitiesUseCase,
  applyTemplateToTenantUseCase: mockApplyTemplateToTenantUseCase,
  listTenantCapabilityAuditLogsUseCase: mockListTenantCapabilityAuditLogsUseCase,
  listTenantPosMetadataAuditLogsUseCase: mockListTenantPosMetadataAuditLogsUseCase,
  getTenantPosMetadataUseCase: mockGetTenantPosMetadataUseCase,
  updateTenantPosMetadataUseCase: mockUpdateTenantPosMetadataUseCase,
  getTenantAffiliateSlotsUseCase: mockGetTenantAffiliateSlotsUseCase,
  updateTenantAffiliateSlotsUseCase: mockUpdateTenantAffiliateSlotsUseCase,
  listTenantAffiliateSlotsAuditLogsUseCase: mockListTenantAffiliateSlotsAuditLogsUseCase,
  approveCompanyRegistrationDraftUseCase: mockApproveCompanyRegistrationDraftUseCase,
  listAdminCompanyRegistrationDraftsUseCase: mockListAdminCompanyRegistrationDraftsUseCase,
  listCompanyRegistrationUploadsUseCase: mockListCompanyRegistrationUploadsUseCase,
  downloadCompanyRegistrationUploadUseCase: mockDownloadCompanyRegistrationUploadUseCase,
  downloadCompanyRegistrationMenuArchiveUseCase: mockDownloadCompanyRegistrationMenuArchiveUseCase,
  tenantAdminRepository: {
    findTenantById: jest.fn(),
    updateTenant: jest.fn()
  }
}));

jest.unstable_mockModule('../src/modules/payments/index.js', () => ({
  setupPayPalRecurringUseCase: mockSetupPayPalRecurringUseCase,
  changePlanUseCase: mockChangePlanUseCase
}));

jest.unstable_mockModule('../src/services/emailService.js', () => ({
  isEmailConfigured: jest.fn().mockReturnValue(false),
  sendReactivationApprovedEmail: jest.fn()
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let listTenants;
let getTenant;
let approveTenant;
let getPricingSettings;
let registerCompanyRequest;
let provisionNewTenant;
let updateTenant;
let deleteTenant;
let getTenantPosMetadata;
let updateTenantPosMetadata;
let listTenantPosMetadataAuditLogs;
let createAdminProvisionedTenant;
let createAdminProvisionedAccountAndTenant;

beforeAll(async () => {
  const mod = await import('../src/modules/tenants/controllers/adminTenantHandlers.js');
  listTenants = mod.listTenants;
  getTenant = mod.getTenant;
  approveTenant = mod.approveTenant;
  getPricingSettings = mod.getPricingSettings;
  registerCompanyRequest = mod.registerCompanyRequest;
  provisionNewTenant = mod.provisionNewTenant;
  updateTenant = mod.updateTenant;
  deleteTenant = mod.deleteTenant;
  getTenantPosMetadata = mod.getTenantPosMetadata;
  updateTenantPosMetadata = mod.updateTenantPosMetadata;
  listTenantPosMetadataAuditLogs = mod.listTenantPosMetadataAuditLogs;
  createAdminProvisionedTenant = mod.createAdminProvisionedTenant;
  createAdminProvisionedAccountAndTenant = mod.createAdminProvisionedAccountAndTenant;
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

  it('getTenant sends one enriched tenant under data and forwards the requested ID', async () => {
    const tenant = { id: 'tenant-42', name: 'Detail Foods', effective_plan: 'premium' };
    mockGetTenantUseCase.mockResolvedValue({
      success: true,
      data: { statusCode: 200, payload: { success: true, data: tenant } }
    });

    const req = { params: { id: 'tenant-42' } };
    const res = createRes();

    await getTenant(req, res);

    expect(mockGetTenantUseCase).toHaveBeenCalledWith({ id: 'tenant-42' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: tenant });
  });

  it('getTenant preserves the TENANT_NOT_FOUND application error as a 404', async () => {
    mockGetTenantUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
        statusCode: 404
      }
    });

    const res = createRes();
    await getTenant({ params: { id: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Tenant not found' });
  });

  it.each([
    ['company only', () => createAdminProvisionedTenant, mockCreateAdminProvisionedTenantUseCase],
    ['account and company', () => createAdminProvisionedAccountAndTenant, mockCreateAdminProvisionedAccountAndTenantUseCase]
  ])('extends the synchronous provisioning timeout for %s', async (_label, getHandler, useCase) => {
    useCase.mockResolvedValue({ success: true, data: { statusCode: 201, payload: { success: true } } });
    const req = {
      body: { reason: 'Local provisioning' },
      admin: { username: 'platform-admin' },
      headers: {},
      setTimeout: jest.fn()
    };
    const res = { ...createRes(), setTimeout: jest.fn() };

    await getHandler()(req, res);

    expect(req.setTimeout).toHaveBeenCalledWith(180000);
    expect(res.setTimeout).toHaveBeenCalledWith(180000);
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

  it('registerCompanyRequest rejects subscription-driven payloads when payments are disabled', async () => {
    const req = {
      body: {
        name: 'Tenant A',
        adminEmail: 'owner@example.com',
        adminPhone: '+63 912 345 6789',
        adminPassword: 'Password123!',
        plan: 'premium',
        subscriptionId: 'sub_123'
      }
    };
    const res = createRes();

    await registerCompanyRequest(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'PAYMENTS_DISABLED'
    }));
    expect(mockRegisterCompanyRequestUseCase).not.toHaveBeenCalled();
  });

  it('provisionNewTenant allows manual premium-capable payloads when payments are disabled', async () => {
    mockProvisionNewTenantUseCase.mockResolvedValue({
      success: true,
      data: {
        statusCode: 201,
        payload: { success: true, data: { id: 1, plan: 'premium' } }
      }
    });
    const req = {
      body: {
        name: 'Tenant A',
        adminEmail: 'owner@example.com',
        adminPhone: '+63 912 345 6789',
        adminPassword: 'Password123!',
        plan: 'premium'
      }
    };
    const res = createRes();

    await provisionNewTenant(req, res);

    expect(mockProvisionNewTenantUseCase).toHaveBeenCalledWith({ body: req.body });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updateTenant forwards admin update payloads to the use case', async () => {
    mockUpdateTenantUseCase.mockResolvedValue({
      success: true,
      data: {
        id: 1,
        status: 'active',
        plan: 'premium'
      }
    });

    const req = {
      params: { id: 'tenant-1' },
      body: { status: 'active', plan: 'premium' }
    };
    const res = createRes();

    await updateTenant(req, res);

    expect(mockUpdateTenantUseCase).toHaveBeenCalledWith({
      id: 'tenant-1',
      body: { status: 'active', plan: 'premium' }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_tenant_updated',
      surface: 'admin_tenants',
      action: 'update_tenant'
    }));
  });

  it('deleteTenant forwards the registration-history force query parameter', async () => {
    mockDeleteTenantUseCase.mockResolvedValue({
      success: true,
      data: {
        statusCode: 200,
        payload: { success: true, message: 'Tenant and database permanently deleted' }
      }
    });

    const req = {
      params: { id: 'tenant-1' },
      query: { forceDeleteRegistrationHistory: 'true' },
      user: { user_id: 1, tenant_id: 'landlord', is_master_admin: true }
    };
    const res = createRes();

    await deleteTenant(req, res);

    expect(mockDeleteTenantUseCase).toHaveBeenCalledWith({
      id: 'tenant-1',
      forceDeleteRegistrationHistory: true,
      actor: { is_platform_admin: true, username: 'platform_admin', user_id: null },
      metadata: { request_id: null, ip_address: null, user_agent: null }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Tenant and database permanently deleted'
    });
  });

  it.each([
    ['missing', {}],
    ['false', { forceDeleteRegistrationHistory: 'false' }]
  ])('deleteTenant passes false for %s registration-history force query', async (_label, query) => {
    mockDeleteTenantUseCase.mockResolvedValue({
      success: false,
      error: { code: 'CONFLICT', statusCode: 409, message: 'Registration history requires explicit force' }
    });

    const req = { params: { id: 'tenant-1' }, query };
    const res = createRes();

    await deleteTenant(req, res);

    expect(mockDeleteTenantUseCase).toHaveBeenCalledWith({
      id: 'tenant-1',
      forceDeleteRegistrationHistory: false,
      actor: { is_platform_admin: true, username: 'platform_admin', user_id: null },
      metadata: { request_id: null, ip_address: null, user_agent: null }
    });
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('getTenantPosMetadata returns metadata data for platform-admin review UI', async () => {
    mockGetTenantPosMetadataUseCase.mockResolvedValue({
      success: true,
      data: {
        tenant_id: 'tenant-1',
        current: { pos_receipt_footer_message: 'Current footer' },
        pending_review: {
          status: 'pending_review',
          changes: { pos_receipt_footer_message: 'Requested footer' }
        }
      }
    });

    const req = {
      params: { id: 'tenant-1' },
      headers: {},
      requestId: 'req-pos-metadata-view'
    };
    const res = createRes();

    await getTenantPosMetadata(req, res);

    expect(mockGetTenantPosMetadataUseCase).toHaveBeenCalledWith({ id: 'tenant-1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        tenant_id: 'tenant-1',
        pending_review: expect.objectContaining({ status: 'pending_review' })
      })
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_tenant_pos_metadata_viewed',
      surface: 'admin_tenants',
      action: 'view_tenant_pos_metadata'
    }));
  });

  it('updateTenantPosMetadata forwards platform-admin POS metadata review payloads', async () => {
    mockUpdateTenantPosMetadataUseCase.mockResolvedValue({
      success: true,
      data: {
        tenant_id: 'tenant-1',
        current: { pos_software_name: 'DGFY POS' }
      }
    });

    const req = {
      params: { id: 'tenant-1' },
      body: { pending_action: 'approve', reason: 'verified' },
      validatedData: { pending_action: 'approve', reason: 'verified' },
      admin: { username: 'platform-admin' },
      headers: {},
      requestId: 'req-pos-metadata'
    };
    const res = createRes();

    await updateTenantPosMetadata(req, res);

    expect(mockUpdateTenantPosMetadataUseCase).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tenant-1',
      body: { pending_action: 'approve', reason: 'verified' },
      actor: { username: 'platform-admin' }
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        tenant_id: 'tenant-1',
        current: { pos_software_name: 'DGFY POS' }
      })
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_tenant_pos_metadata_updated',
      surface: 'admin_tenants',
      action: 'update_tenant_pos_metadata'
    }));
  });

  it('listTenantPosMetadataAuditLogs forwards POS metadata audit query', async () => {
    mockListTenantPosMetadataAuditLogsUseCase.mockResolvedValue({
      success: true,
      data: {
        payload: {
          success: true,
          data: { logs: [{ id: 1, action: 'pos_metadata_update' }] }
        }
      }
    });

    const req = {
      params: { id: 'tenant-1' },
      validatedQuery: { limit: 10 },
      headers: {}
    };
    const res = createRes();

    await listTenantPosMetadataAuditLogs(req, res);

    expect(mockListTenantPosMetadataAuditLogsUseCase).toHaveBeenCalledWith({
      id: 'tenant-1',
      limit: 10
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_tenant_pos_metadata_audit_logs_viewed',
      surface: 'admin_tenants',
      action: 'list_tenant_pos_metadata_audit_logs'
    }));
  });
});
