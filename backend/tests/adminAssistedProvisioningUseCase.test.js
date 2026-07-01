import { jest } from '@jest/globals';
import {
    buildAssignTenantOwnerByAdminUseCase,
    buildCreateAdminProvisionedAccountAndTenantUseCase,
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

  it('retries a matching pending company-only attempt without creating a duplicate tenant', async () => {
    const pendingTenant = createTenant({ status: 'pending' });
    const tenantAdminRepository = {
      findTenantByName: jest.fn().mockResolvedValue(pendingTenant),
      createTenant: jest.fn(),
      updateTenant: jest.fn(async (tenant, payload) => Object.assign(tenant, payload)),
      createTenantAdminAuditLog: jest.fn().mockResolvedValue({}),
      transaction: jest.fn(async (callback) => callback('retry-tx')),
      findTenantById: jest.fn().mockResolvedValue(createTenant())
    };
    const provisionTenant = jest.fn().mockResolvedValue({ id: pendingTenant.id, status: 'active', admin_user_id: 1 });
    const useCase = buildCreateAdminProvisionedTenantUseCase({
      tenantAdminRepository,
      provisionTenant,
      hashPassword: jest.fn(async (password) => `retry:${password}`),
      idGenerator: jest.fn(),
      logger: { error: jest.fn() }
    });

    const result = await useCase({ body: {
      name: pendingTenant.name,
      adminEmail: pendingTenant.admin_email,
      adminPhone: pendingTenant.admin_phone,
      adminPassword: 'RetryPass123!',
      workflowMode: 'food_manufacturing',
      reason: 'Retry failed provisioning'
    } });

    expect(result.success).toBe(true);
    expect(tenantAdminRepository.createTenant).not.toHaveBeenCalled();
    expect(tenantAdminRepository.updateTenant).toHaveBeenCalledWith(pendingTenant, expect.objectContaining({
      admin_password_hash: 'retry:RetryPass123!'
    }), { transaction: 'retry-tx' });
    expect(provisionTenant).toHaveBeenCalledTimes(1);
    expect(tenantAdminRepository.createTenantAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ provisioning_attempt: 'retry' })
    }), { transaction: 'retry-tx' });
  });

  it('returns an explicit retryable partial-state error when company database provisioning fails', async () => {
    const pendingTenant = createTenant({ status: 'pending' });
    const tenantAdminRepository = {
      findTenantByName: jest.fn().mockResolvedValue(null),
      createTenant: jest.fn().mockResolvedValue(pendingTenant),
      createTenantAdminAuditLog: jest.fn().mockResolvedValue({}),
      transaction: jest.fn(async (callback) => callback('tx')),
      findTenantById: jest.fn()
    };
    const useCase = buildCreateAdminProvisionedTenantUseCase({
      tenantAdminRepository,
      provisionTenant: jest.fn().mockRejectedValue(new Error('migration failed')),
      hashPassword: jest.fn(async (password) => `hashed:${password}`),
      idGenerator: () => pendingTenant.id,
      logger: { error: jest.fn() }
    });

    const result = await useCase({ body: {
      name: pendingTenant.name,
      adminEmail: pendingTenant.admin_email,
      adminPhone: pendingTenant.admin_phone,
      adminPassword: 'TempPass123!',
      workflowMode: 'food_manufacturing',
      reason: 'Failure injection'
    } });

    expect(result.success).toBe(false);
    expect(result.error.message).toContain('retained in pending state');
    expect(result.error.details).toEqual(expect.objectContaining({
      partial_state: true,
      retryable: true,
      phase: 'tenant_provisioning',
      tenant_id: pendingTenant.id
    }));
  });

  it('reconciles ownership assignment after tenant provisioning without reprovisioning or duplicates', async () => {
    const account = {
      id: 'dgfy-retry',
      first_name: 'Retry',
      email: 'retry@example.test',
      phone: '+639333333333',
      provisioning_status: 'admin_provisioned',
      deleted_at: null
    };
    const activeTenant = createTenant({
      status: 'active',
      owner_dgfy_account_id: account.id,
      ownership_status: 'claimed',
      admin_email: account.email,
      admin_phone: account.phone
    });
    const tenantAdminRepository = {
      findTenantByName: jest.fn().mockResolvedValue(activeTenant),
      createTenant: jest.fn(),
      updateTenant: jest.fn(async (tenant, payload) => Object.assign(tenant, payload)),
      createTenantAdminAuditLog: jest.fn().mockResolvedValue({}),
      transaction: jest.fn(async (callback) => callback('retry-tx')),
      findTenantById: jest.fn().mockResolvedValue(activeTenant)
    };
    const dgfyAccountRepository = {
      findByEmail: jest.fn().mockResolvedValue(account),
      findByPhone: jest.fn().mockResolvedValue(account),
      findMembershipForAccount: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateAdminProfile: jest.fn(async (row, payload) => Object.assign(row, payload)),
      createAdminAuditLog: jest.fn().mockResolvedValue({}),
      forceAssignTenantOwnership: jest.fn().mockResolvedValue({
        id: 44,
        status: 'accepted',
        source: 'admin_handover',
        tenant_user_id: 9
      })
    };
    const User = {
      findOne: jest.fn().mockResolvedValue({ user_id: 9, update: jest.fn() }),
      create: jest.fn()
    };
    const provisionTenant = jest.fn();
    const useCase = buildCreateAdminProvisionedAccountAndTenantUseCase({
      tenantAdminRepository,
      dgfyAccountRepository,
      provisionTenant,
      tenantConnector: { getConnection: jest.fn().mockResolvedValue({}) },
      getTenantModels: () => ({ User }),
      hashPassword: jest.fn(async (password) => `retry:${password}`),
      idGenerator: jest.fn(),
      logger: { error: jest.fn() }
    });

    const result = await useCase({ body: {
      reason: 'Reconcile ownership failure',
      dgfy_account: {
        first_name: 'Retry',
        last_name: 'Owner',
        email: account.email,
        phone: account.phone,
        temporary_password: 'NewRetry123!'
      },
      company: { name: activeTenant.name, workflowMode: 'food_manufacturing' }
    } });

    expect(result.success).toBe(true);
    expect(dgfyAccountRepository.create).not.toHaveBeenCalled();
    expect(tenantAdminRepository.createTenant).not.toHaveBeenCalled();
    expect(provisionTenant).not.toHaveBeenCalled();
    expect(dgfyAccountRepository.forceAssignTenantOwnership).toHaveBeenCalledWith(expect.objectContaining({
      tenant: activeTenant,
      toAccountId: account.id,
      tenantUserId: 9
    }));
    expect(result.data.payload.data.provisioned.resumed_after_provisioning).toBe(true);
  });
});
