import { jest } from '@jest/globals';
import { buildApproveTenantUseCase } from '../src/modules/tenants/usecases/approveTenantUseCase.js';
import { resolveRegisteredTenantPlan } from '../src/modules/tenants/usecases/tenantPlanPolicy.js';

const createUseCase = ({ tenantSettings }) => {
  const tenant = {
    id: 'tenant-1',
    name: 'Micro Eatery Co',
    status: 'pending',
    db_name: 'sku_tenant_microeatery_abcd1234',
    company_token: 'token-microeatery-abcd1234',
    admin_email: 'owner@microeatery.test',
    admin_phone: '+639123456789',
    admin_password_hash: 'hash',
    owner_dgfy_account_id: 'dgfy-account-1',
    plan: resolveRegisteredTenantPlan(),
    settings: tenantSettings
  };
  const deps = {
    tenantAdminRepository: { findTenantById: jest.fn().mockResolvedValue(tenant), updateTenant: jest.fn().mockResolvedValue(tenant) },
    companyRegistrationRepository: {
      markProvisioningStarted: jest.fn().mockResolvedValue({ id: 'application-1' }),
      markProvisioningOutcome: jest.fn().mockResolvedValue({})
    },
    dgfyAccountRepository: { upsertFounderMembership: jest.fn().mockResolvedValue({}) },
    provisionTenant: jest.fn().mockResolvedValue({ admin_user_id: 'user-1', workflowMode: 'fnb' }),
    shouldAutoCreatePayMongoChildAccounts: jest.fn().mockReturnValue(false),
    emailService: { isEmailConfigured: jest.fn().mockReturnValue(false) },
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
  };
  return { deps, tenant, useCase: buildApproveTenantUseCase(deps) };
};

// issue #178 "templates become the Operating Mode" follow-up: approval reads
// the store_template_key a registration stamped into settings and forwards
// it to provisionTenant, so the merchant's Industry-picker choice actually
// reaches provisioning instead of only ever taking the canonical fallback.
describe('approveTenantUseCase - forwards store_template_key to provisioning', () => {
  it('forwards the templateKey stamped by a registration made through the Industry picker', async () => {
    const { deps, useCase } = createUseCase({
      tenantSettings: { workflow_mode: 'fnb', registration_industry: 'micro_fnb', store_template_key: 'fnb_counter_service' }
    });

    const result = await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' } });

    expect(result.success).toBe(true);
    expect(deps.provisionTenant).toHaveBeenCalledWith(
      expect.objectContaining({ workflowMode: 'fnb', templateKey: 'fnb_counter_service' })
    );
  });

  it('forwards a null templateKey for a tenant registered before this change (no key in settings) - unchanged behavior', async () => {
    const { deps, useCase } = createUseCase({ tenantSettings: { workflow_mode: 'retail' } });

    const result = await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' } });

    expect(result.success).toBe(true);
    expect(deps.provisionTenant).toHaveBeenCalledWith(
      expect.objectContaining({ workflowMode: 'retail', templateKey: null })
    );
  });

  it('forwards a null templateKey for a tenant with a JSON-string settings blob and no key', async () => {
    const { deps, useCase } = createUseCase({ tenantSettings: JSON.stringify({ workflow_mode: 'services' }) });

    const result = await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' } });

    expect(result.success).toBe(true);
    expect(deps.provisionTenant).toHaveBeenCalledWith(
      expect.objectContaining({ workflowMode: 'services', templateKey: null })
    );
  });

  it('tolerates a corrupted settings blob by provisioning with the default mode and a null templateKey', async () => {
    const { deps, useCase } = createUseCase({ tenantSettings: '{not valid json' });

    const result = await useCase({ id: 'tenant-1', actor: { id: 'admin-1', username: 'root' } });

    expect(result.success).toBe(true);
    expect(deps.provisionTenant).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: null })
    );
  });
});
