import { jest } from '@jest/globals';
import { buildGetTenantUseCase } from '../src/modules/tenants/usecases/getTenantUseCase.js';
import { buildListTenantsUseCase } from '../src/modules/tenants/usecases/listTenantsUseCase.js';

const activeTenant = () => ({
  id: 'tenant-42',
  name: 'Detail Foods',
  domain: 'detail.example.test',
  admin_email: 'owner@example.test',
  status: 'active',
  plan: 'standard',
  compliance_mode_state: 'compliant_pending',
  settings: { registration_draft_id: 'draft-4', internal_secret: 'settings-secret' },
  db_name: 'sku_detail_foods',
  company_token: 'company-token-secret',
  password_hash: 'password-hash-secret',
  registrationApplication: {
    id: 'application-4',
    review_status: 'approved',
    provisioning_status: 'complete',
    updatedAt: '2026-10-24T00:00:00.000Z'
  }
});

describe('getTenant use case', () => {
  it('matches the enriched directory item shape while using a targeted read and filtering sensitive values', async () => {
    const tenant = activeTenant();
    const readTenantCapabilities = jest.fn().mockResolvedValue({
      ims_enabled: true,
      pos_enabled: false,
      storefront_visible: true
    });
    const tenantAdminRepository = {
      findAdminTenantById: jest.fn().mockResolvedValue(tenant),
      listTenants: jest.fn()
    };

    const detail = await buildGetTenantUseCase({
      tenantAdminRepository,
      tenantConnector: {},
      readTenantCapabilities
    })({ id: tenant.id });
    const list = await buildListTenantsUseCase({
      tenantAdminRepository: { listTenants: jest.fn().mockResolvedValue([tenant]) },
      tenantConnector: {},
      readTenantCapabilities
    })({ status: 'all' });

    expect(tenantAdminRepository.findAdminTenantById).toHaveBeenCalledWith(tenant.id);
    expect(tenantAdminRepository.listTenants).not.toHaveBeenCalled();
    expect(detail.data.payload.data).toEqual(list.data.payload.data[0]);
    expect(detail.data.payload).toEqual({
      success: true,
      data: expect.objectContaining({
        id: tenant.id,
        registration_draft_id: 'draft-4',
        effective_plan: expect.any(String),
        capabilities: { ims_enabled: true, pos_enabled: false, storefront_visible: true }
      })
    });
    for (const field of ['settings', 'db_name', 'company_token', 'password_hash']) {
      expect(detail.data.payload.data).not.toHaveProperty(field);
    }
    expect(detail.data.payload.data.registrationApplication).toEqual(tenant.registrationApplication);
  });

  it('returns unavailable capabilities when the active tenant capability read fails', async () => {
    const logger = { warn: jest.fn(), error: jest.fn() };
    const result = await buildGetTenantUseCase({
      tenantAdminRepository: { findAdminTenantById: jest.fn().mockResolvedValue(activeTenant()) },
      tenantConnector: {},
      readTenantCapabilities: jest.fn().mockRejectedValue(new Error('tenant DB unavailable')),
      logger
    })({ id: 'tenant-42' });

    expect(result.data.payload.data.capabilities).toEqual({ unavailable: true });
    expect(logger.warn).toHaveBeenCalledWith('[GetTenant] Failed to load tenant capability settings', expect.objectContaining({
      tenantId: 'tenant-42',
      error: 'tenant DB unavailable'
    }));
  });

  it.each(['pending', 'inactive', 'archived'])('retains null capabilities for a %s tenant', async (status) => {
    const tenant = { ...activeTenant(), status };
    const readTenantCapabilities = jest.fn();
    const result = await buildGetTenantUseCase({
      tenantAdminRepository: { findAdminTenantById: jest.fn().mockResolvedValue(tenant) },
      tenantConnector: {},
      readTenantCapabilities
    })({ id: tenant.id });

    expect(readTenantCapabilities).not.toHaveBeenCalled();
    expect(result.data.payload.data.capabilities).toBeNull();
  });

  it('returns TENANT_NOT_FOUND for a missing ID', async () => {
    const result = await buildGetTenantUseCase({
      tenantAdminRepository: { findAdminTenantById: jest.fn().mockResolvedValue(null) },
      logger: { error: jest.fn() }
    })({ id: 'missing' });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('TENANT_NOT_FOUND');
  });
});
