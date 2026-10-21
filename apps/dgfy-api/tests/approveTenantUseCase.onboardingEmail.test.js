import { describe, expect, it, jest } from '@jest/globals';
import { buildApproveTenantUseCase } from '../src/modules/tenants/usecases/approveTenantUseCase.js';
import { resolveRegisteredTenantPlan } from '../src/modules/tenants/usecases/tenantPlanPolicy.js';

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('approveTenantUseCase POS onboarding email', () => {
  it('sends the POS onboarding link for a manually approved tenant', async () => {
    const previousPosUrl = process.env.POS_APP_URL;
    process.env.POS_APP_URL = 'https://pos.example.test';

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
      settings: { workflow_mode: 'fnb', registration_access_mode: 'catalog_only' }
    };
    const sendCompanyApprovedEmail = jest.fn();
    const sendCompanyOnboardingEmail = jest.fn().mockResolvedValue({ messageId: 'onboarding-1' });
    const deps = {
      tenantAdminRepository: {
        findTenantById: jest.fn().mockResolvedValue(tenant),
        updateTenant: jest.fn().mockResolvedValue(tenant)
      },
      companyRegistrationRepository: {
        markProvisioningStarted: jest.fn().mockResolvedValue({ id: 'application-1' }),
        markProvisioningOutcome: jest.fn().mockResolvedValue({})
      },
      dgfyAccountRepository: { upsertFounderMembership: jest.fn().mockResolvedValue({}) },
      provisionTenant: jest.fn().mockResolvedValue({ admin_user_id: 'user-1' }),
      shouldAutoCreatePayMongoChildAccounts: jest.fn().mockReturnValue(false),
      emailService: {
        isEmailConfigured: jest.fn().mockReturnValue(true),
        sendCompanyApprovedEmail,
        sendCompanyOnboardingEmail
      },
      logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
    };

    try {
      const useCase = buildApproveTenantUseCase(deps);
      const result = await useCase({ id: tenant.id, actor: { id: 'admin-1', username: 'root' } });

      expect(result.success).toBe(true);
      expect(result.data.statusCode).toBe(202);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(sendCompanyOnboardingEmail).toHaveBeenCalledWith({
        email: tenant.admin_email,
        companyName: tenant.name,
        statusUrl: 'http://localhost:5173/register-company/status/application-1',
        posUrl: 'https://pos.example.test/#/terminal?setup_flow=tenant_onboarding&setup_step=profile&view=items&tenant_id=tenant-1'
      });
      expect(sendCompanyApprovedEmail).not.toHaveBeenCalled();
    } finally {
      if (previousPosUrl === undefined) delete process.env.POS_APP_URL;
      else process.env.POS_APP_URL = previousPosUrl;
    }
  });
});
