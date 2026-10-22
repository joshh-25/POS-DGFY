import { describe, expect, it, jest } from '@jest/globals';
import {
  buildApproveCompanyRegistrationDraftUseCase,
  buildMaterializeCompanyRegistrationDraftUseCase
} from '../src/modules/tenants/usecases/companyRegistrationDraftMaterializationUseCase.js';

const draftId = '22222222-2222-4222-8222-222222222222';
const tenantId = '33333333-3333-4333-8333-333333333333';
const accountId = '11111111-1111-4111-8111-111111111111';

const payload = {
  business: {
    company_name: 'Example Cafe',
    industry_key: 'fnb'
  },
  storefront: {
    store_email: 'store@example.test',
    store_phone: '09171234567',
    tagline: 'Fresh every day',
    about: 'A neighborhood cafe.',
    social_links: { facebook: 'https://facebook.com/example' },
    delivery_partners: []
  },
  location: {
    address_line: '1 Main Street',
    latitude: '14.5995',
    longitude: '120.9842'
  },
  hours: {
    timezone: 'Asia/Manila',
    weekly: {
      mon: { enabled: true, open: '09:00', close: '18:00' }
    }
  }
};

const legalTermsSnapshot = {
  flow: 'dgfy_company_registration',
  company_terms_version: 'dgfy-company-terms-2026-06-08',
  marketplace_terms_version: 'dgfy-marketplace-provider-2026-06-08',
  acknowledgement_text: 'Accepted for test.',
  acknowledgement_hash: 'a'.repeat(64),
  accepted_company_terms: true,
  accepted_marketplace_terms: true,
  accepted_at: '2026-09-26T00:00:00.000Z'
};

const buildDraft = (overrides = {}) => ({
  id: draftId,
  dgfy_account_id: accountId,
  registration_email_snapshot: 'owner@example.test',
  status: 'pending_review',
  materialization_status: 'not_started',
  materialization_snapshot: null,
  draft_payload: payload,
  submission_snapshot: {
    schema_version: 1,
    payload,
    uploads: []
  },
  // MySQL JSON columns can be returned as serialized JSON strings in the runtime path.
  legal_terms_snapshot: JSON.stringify(legalTermsSnapshot),
  ...overrides
});

const buildTenant = (overrides = {}) => ({
  id: tenantId,
  name: 'Example Cafe',
  db_name: 'sku_tenant_examplecafe_33333333',
  company_token: 'token-example-cafe',
  admin_email: 'owner@example.test',
  admin_phone: '09171234567',
  admin_password_hash: 'hash',
  owner_dgfy_account_id: accountId,
  status: 'pending',
  ...overrides
});

describe('company registration draft materialization', () => {
  it('rejects the internal system actor unless the auto-approval use case explicitly enables it', async () => {
    const useCase = buildApproveCompanyRegistrationDraftUseCase({
      repository: {},
      tenantAdminRepository: {},
      companyRegistrationRepository: {},
      dgfyAccountRepository: {},
      registrationIndustryRepository: {},
      provisionTenant: jest.fn(),
      materializeCompanyRegistrationDraft: jest.fn(),
      background: false
    });

    const result = await useCase({
      draftId,
      actor: { actor_type: 'system', source: 'public_registration' }
    });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(403);
  });

  it('approves a submitted draft once, creates the tenant projection, and materializes asynchronously', async () => {
    const draftPayload = {
      ...payload,
      business: { ...payload.business, industry_tag: 'Neighborhood cafe and bakery' }
    };
    const draft = buildDraft({
      draft_payload: draftPayload,
      submission_snapshot: { schema_version: 1, payload: draftPayload, uploads: [] }
    });
    const tenant = buildTenant();
    const approvedDraft = buildDraft({
      status: 'approved',
      materialization_status: 'in_progress',
      materialized_tenant_id: tenantId,
      materialized_application_id: '44444444-4444-4444-8444-444444444444',
      materialization_snapshot: { schema_version: 1, registration_draft_id: draftId, asset_uploads: {} }
    });
    const repository = {
      transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
      findForAdminForUpdate: jest.fn().mockResolvedValue(draft),
      markApprovedForMaterialization: jest.fn().mockResolvedValue(approvedDraft),
      markMaterializationOutcome: jest.fn().mockResolvedValue(undefined)
    };
    const tenantAdminRepository = {
      transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
      findTenantByName: jest.fn().mockResolvedValue(null),
      createTenant: jest.fn().mockResolvedValue(tenant)
    };
    const account = {
      id: accountId,
      email: 'owner@example.test',
      phone: '09171234567',
      password_hash: 'hash',
      is_active: true,
      deleted_at: null
    };
    const companyRegistrationRepository = {
      createApprovedProjection: jest.fn().mockResolvedValue({
        id: '44444444-4444-4444-8444-444444444444',
        onboardingEmailDelivery: { id: 'delivery-1', status: 'queued' }
      }),
      updateEmailDelivery: jest.fn().mockResolvedValue(undefined),
      markProvisioningOutcome: jest.fn().mockResolvedValue(undefined)
    };
    const dgfyAccountRepository = {
      findById: jest.fn().mockResolvedValue(account),
      recordLegalAcknowledgement: jest.fn().mockResolvedValue(undefined),
      upsertPendingFounderMembership: jest.fn().mockResolvedValue(undefined),
      upsertFounderMembership: jest.fn().mockResolvedValue(undefined)
    };
    const materialize = jest.fn().mockResolvedValue({
      snapshot: { schema_version: 1, registration_draft_id: draftId, settings_written: true },
      locationId: 1,
      imageUploadIds: [],
      menuUploadIds: []
    });
    const provisionTenant = jest.fn().mockResolvedValue({ admin_user_id: 9 });
    const emailService = {
      isEmailConfigured: jest.fn().mockReturnValue(true),
      sendCompanyOnboardingEmail: jest.fn().mockResolvedValue({ messageId: 'provider-1' })
    };
    const useCase = buildApproveCompanyRegistrationDraftUseCase({
      repository,
      tenantAdminRepository,
      companyRegistrationRepository,
      dgfyAccountRepository,
      registrationIndustryRepository: { findByKey: jest.fn().mockResolvedValue(null) },
      provisionTenant,
      materializeCompanyRegistrationDraft: materialize,
      emailService,
      idGenerator: () => tenantId,
      now: () => new Date('2026-09-26T01:00:00.000Z'),
      background: false
    });

    const result = await useCase({
      draftId,
      actor: { is_platform_admin: true, id: 'admin-1', username: 'admin' }
    });

    expect(result.success).toBe(true);
    expect(result.data.statusCode).toBe(202);
    expect(tenantAdminRepository.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        id: tenantId,
        status: 'pending',
        owner_dgfy_account_id: accountId,
        settings: expect.objectContaining({ registration_draft_id: draftId })
      }),
      expect.anything()
    );
    expect(tenantAdminRepository.createTenant.mock.calls[0][0].settings).not.toHaveProperty('business_type');
    expect(tenantAdminRepository.createTenant.mock.calls[0][0].settings.industry_tag).toBe('Neighborhood cafe and bakery');
    expect(companyRegistrationRepository.createApprovedProjection).toHaveBeenCalledWith(expect.objectContaining({
      tenant,
      industryTag: 'Neighborhood cafe and bakery',
      submissionSnapshot: expect.objectContaining({ registration_draft_id: draftId }),
      transaction: expect.anything()
    }));
    expect(provisionTenant).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      dbName: tenant.db_name,
      workflowMode: 'fnb',
      templateKey: 'fnb_full_service',
      tenantCapabilities: { pos_enabled: false }
    }));
    expect(materialize).toHaveBeenCalledWith({ draft: approvedDraft, tenant });
    expect(companyRegistrationRepository.markProvisioningOutcome).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      succeeded: true
    }));
    expect(emailService.sendCompanyOnboardingEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: tenant.admin_email,
      companyName: tenant.name,
      posUrl: expect.stringContaining(tenantId)
    }));
    expect(companyRegistrationRepository.updateEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'delivery-1' }),
      expect.objectContaining({ status: 'sent_to_provider', provider_message_id: 'provider-1' })
    );
  });

  it('returns an idempotent success without creating a second tenant after completion', async () => {
    const repository = {
      transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
      findForAdminForUpdate: jest.fn().mockResolvedValue(buildDraft({
        status: 'approved',
        materialization_status: 'succeeded',
        materialized_tenant_id: tenantId
      }))
    };
    const tenantAdminRepository = {
      transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
      createTenant: jest.fn()
    };
    const useCase = buildApproveCompanyRegistrationDraftUseCase({
      repository,
      tenantAdminRepository,
      companyRegistrationRepository: {},
      dgfyAccountRepository: {},
      registrationIndustryRepository: { findByKey: jest.fn().mockResolvedValue(null) },
      provisionTenant: jest.fn(),
      materializeCompanyRegistrationDraft: jest.fn(),
      background: false
    });

    const result = await useCase({ draftId, actor: { is_platform_admin: true, id: 'admin-1' } });

    expect(result.success).toBe(true);
    expect(result.data.statusCode).toBe(200);
    expect(tenantAdminRepository.createTenant).not.toHaveBeenCalled();
  });

  it('retries failed materialization without provisioning a second tenant', async () => {
    const tenant = buildTenant({ status: 'active' });
    const failedDraft = buildDraft({
      status: 'approved',
      materialization_status: 'failed',
      materialized_tenant_id: tenantId,
      materialized_application_id: '44444444-4444-4444-8444-444444444444',
      materialization_snapshot: { schema_version: 1, registration_draft_id: draftId, asset_uploads: {} }
    });
    const retriedDraft = { ...failedDraft, materialization_status: 'in_progress' };
    const repository = {
      transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
      findForAdminForUpdate: jest.fn().mockResolvedValue(failedDraft),
      claimRetryForMaterialization: jest.fn().mockResolvedValue(retriedDraft),
      markMaterializationOutcome: jest.fn().mockResolvedValue(undefined)
    };
    const companyRegistrationRepository = {
      markProvisioningStarted: jest.fn().mockResolvedValue({ id: failedDraft.materialized_application_id }),
      markProvisioningOutcome: jest.fn().mockResolvedValue(undefined)
    };
    const materialize = jest.fn().mockResolvedValue({
      snapshot: retriedDraft.materialization_snapshot,
      locationId: 1,
      imageUploadIds: [],
      menuUploadIds: []
    });
    const provisionTenant = jest.fn();
    const useCase = buildApproveCompanyRegistrationDraftUseCase({
      repository,
      tenantAdminRepository: {
        transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })),
        findTenantById: jest.fn().mockResolvedValue(tenant)
      },
      companyRegistrationRepository,
      dgfyAccountRepository: {},
      registrationIndustryRepository: { findByKey: jest.fn().mockResolvedValue(null) },
      provisionTenant,
      materializeCompanyRegistrationDraft: materialize,
      background: false
    });

    const result = await useCase({
      draftId,
      actor: { is_platform_admin: true, id: 'admin-1' },
      retry: true
    });

    expect(result.success).toBe(true);
    expect(provisionTenant).not.toHaveBeenCalled();
    expect(companyRegistrationRepository.markProvisioningStarted).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      retry: true
    }));
    expect(materialize).toHaveBeenCalledWith({ draft: retriedDraft, tenant });
  });

  it('materializes a primary location and Storefront settings without duplicating on retry', async () => {
    const location = {
      location_id: 7,
      update: jest.fn().mockResolvedValue(undefined)
    };
    const TenantLocation = {
      findByPk: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue([0]),
      create: jest.fn().mockResolvedValue(location)
    };
    const settingRows = new Map();
    const SystemSetting = {
      findOne: jest.fn(async ({ where }) => settingRows.get(where.setting_key) || null),
      create: jest.fn(async (value) => {
        const row = { ...value, update: jest.fn() };
        settingRows.set(value.setting_key, row);
        return row;
      })
    };
    const tenantSequelize = {
      transaction: jest.fn(async (callback) => callback({ id: 'tenant-transaction' }))
    };
    const repository = {
      updateMaterializationSnapshot: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn(async (callback) => callback({ id: 'landlord-transaction' })),
      updateUploadMaterializationStates: jest.fn().mockResolvedValue(undefined)
    };
    const materialize = buildMaterializeCompanyRegistrationDraftUseCase({
      repository,
      tenantConnector: { getConnection: jest.fn().mockResolvedValue(tenantSequelize) },
      getTenantModels: jest.fn().mockReturnValue({ TenantLocation, SystemSetting }),
      dbStore: { run: jest.fn(async (_context, callback) => callback()) },
      companyRegistrationStorage: {},
      storefrontAssetStorage: {},
      syncStorefrontDiscoveryWithReliability: jest.fn().mockResolvedValue({ ok: true }),
      logger: { error: jest.fn() }
    });

    const result = await materialize({
      draft: buildDraft({
        status: 'approved',
        materialization_status: 'in_progress',
        materialization_snapshot: { schema_version: 1, registration_draft_id: draftId, asset_uploads: {} },
        submission_snapshot: {
          payload,
          uploads: [{ id: 'menu-1', category: 'menu_upload', original_name: 'menu.csv' }]
        }
      }),
      tenant: buildTenant({ status: 'active' })
    });

    expect(result.locationId).toBe(7);
    expect(TenantLocation.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Example Cafe',
      latitude: 14.5995,
      longitude: 120.9842,
      is_primary_storefront: true
    }), expect.anything());
    expect(settingRows.get('storefront_tagline').setting_value).toBe('Fresh every day');
    expect(settingRows.get('storefront_hours').data_type).toBe('json');
    expect(settingRows.has('registration_business_type')).toBe(false);
    expect(settingRows.get('store_is_visible').setting_value).toBe('false');
    expect(repository.updateUploadMaterializationStates).toHaveBeenCalledWith(expect.objectContaining({
      draftId,
      menuUploadIds: ['menu-1']
    }));
  });
});
