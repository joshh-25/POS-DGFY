import { jest } from '@jest/globals';
import {
  buildAssignTenantOwnerByAdminUseCase,
  buildCreateAdminProvisionedTenantUseCase
} from '../src/modules/tenants/usecases/adminAssistedProvisioningUseCase.js';

const createTenant = (overrides = {}) => ({
  id: 'tenant-1',
  name: 'Merchant One',
  db_name: 'sku_tenant_merchantone_abc123',
  company_token: 'token-merchantone-abc123',
  status: 'active',
  admin_email: 'ops@example.test',
  admin_phone: '+639111111111',
  plan: 'premium',
  owner_dgfy_account_id: null,
  provisioning_source: 'platform_admin',
  ownership_status: 'unassigned',
  update: jest.fn(async function update(payload) {
    Object.assign(this, payload);
    return this;
  }),
  reload: jest.fn(async function reload() { return this; }),
  ...overrides
});

describe('admin assisted provisioning use cases', () => {
  it('creates an ownerless admin-provisioned tenant and immediately provisions its tenant DB', async () => {
    const createdTenant = createTenant({ status: 'pending' });
    const tenantAdminRepository = {
      findTenantByName: jest.fn().mockResolvedValue(null),
      createTenant: jest.fn().mockResolvedValue(createdTenant),
      createTenantAdminAuditLog: jest.fn().mockResolvedValue({}),
      transaction: jest.fn(async (callback) => callback('tx')),
      findTenantById: jest.fn().mockResolvedValue(createTenant())
    };
    const provisionTenant = jest.fn().mockResolvedValue({
      id: 'tenant-1',
      status: 'active',
      admin_user_id: 1
    });
    const useCase = buildCreateAdminProvisionedTenantUseCase({
      tenantAdminRepository,
      provisionTenant,
      hashPassword: jest.fn(async (password) => `hashed:${password}`),
      idGenerator: () => 'abc12345-0000-4000-8000-000000000000',
      logger: { error: jest.fn() }
    });

    const result = await useCase({
      body: {
        name: 'Merchant One',
        adminEmail: 'ops@example.test',
        adminPhone: '+639111111111',
        adminPassword: 'TempPass123!',
        workflowMode: 'food_manufacturing',
        reason: 'White glove onboarding'
      },
      actor: { username: 'platform-admin' }
    });

    expect(result.success).toBe(true);
    expect(tenantAdminRepository.createTenant).toHaveBeenCalledWith(expect.objectContaining({
      provisioning_source: 'platform_admin',
      ownership_status: 'unassigned',
      owner_dgfy_account_id: null
    }), { transaction: 'tx' });
    expect(provisionTenant).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      adminPasswordHash: createdTenant.admin_password_hash
    }));
    expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin_create_tenant',
      reason: 'White glove onboarding'
    }), { transaction: 'tx' });
  });

  it('force-assigns an active DGFY account as company owner through explicit membership', async () => {
    const tenant = createTenant();
    const account = {
      id: 'dgfy-1',
      email: 'owner@example.test',
      phone: '+639222222222',
      first_name: 'Owner'
    };
    const tenantAdminRepository = {
      findTenantById: jest.fn().mockResolvedValueOnce(tenant).mockResolvedValueOnce(createTenant({
        owner_dgfy_account_id: 'dgfy-1',
        ownership_status: 'claimed'
      })),
      createTenantAdminAuditLog: jest.fn().mockResolvedValue({})
    };
    const dgfyAccountRepository = {
      findActiveAdminAssignableAccount: jest.fn().mockResolvedValue(account),
      forceAssignTenantOwnership: jest.fn().mockResolvedValue({
        id: 10,
        dgfy_account_id: 'dgfy-1',
        status: 'accepted',
        source: 'admin_handover',
        tenant_user_id: 7
      })
    };
    const User = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ user_id: 7 })
    };
    const tenantConnector = {
      getConnection: jest.fn().mockResolvedValue({})
    };
    const useCase = buildAssignTenantOwnerByAdminUseCase({
      tenantAdminRepository,
      dgfyAccountRepository,
      tenantConnector,
      getTenantModels: () => ({ User }),
      logger: { error: jest.fn() }
    });

    const result = await useCase({
      tenantId: 'tenant-1',
      body: {
        dgfy_account_id: 'dgfy-1',
        reason: 'Owner handover',
        force: true
      },
      actor: { username: 'platform-admin' }
    });

    expect(result.success).toBe(true);
    expect(dgfyAccountRepository.forceAssignTenantOwnership).toHaveBeenCalledWith(expect.objectContaining({
      tenant,
      toAccountId: 'dgfy-1',
      tenantUserId: 7
    }));
    expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin_force_assign_owner',
      reason: 'Owner handover'
    }));
  });
});
