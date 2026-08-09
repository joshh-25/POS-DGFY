import { jest } from '@jest/globals';
import { buildRegisterCompanyRequestUseCase } from '../src/modules/tenants/usecases/registerCompanyRequestUseCase.js';
import { TENANT_REGISTRATION_APPROVAL_MODES } from '../src/config/tenantRegistrationApproval.js';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/shared/utils/dgfyLegalTerms.js';

const baseBody = {
  name: 'Micro Eatery Co',
  accepted_company_terms: true,
  company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
  marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
};
const dgfyAccount = { id: 'dgfy-account-1', first_name: 'Owner', email: 'owner@microeatery.test', phone: '+639123456789', password_hash: 'hash' };

const createUseCase = () => {
  const tenant = { id: '12345678-aaaa-bbbb-cccc-123456789abd', name: baseBody.name, settings: {} };
  const deps = {
    tenantAdminRepository: { transaction: jest.fn(async (callback) => callback('transaction')), findTenantByName: jest.fn().mockResolvedValue(null), createTenant: jest.fn().mockResolvedValue(tenant) },
    companyRegistrationRepository: {
      createInitial: jest.fn().mockResolvedValue({ id: 'application-1', submissionEmailDelivery: null }),
      updateEmailDelivery: jest.fn().mockResolvedValue()
    },
    paypalService: { verifySubscription: jest.fn() },
    trackEngagementEvent: jest.fn().mockResolvedValue({}),
    addEmailTenantMapping: jest.fn().mockResolvedValue({}),
    dgfyAccountRepository: { recordLegalAcknowledgement: jest.fn().mockResolvedValue({}), upsertPendingFounderMembership: jest.fn().mockResolvedValue({}) },
    registrationIndustryVisibilityRepository: { isHidden: jest.fn().mockResolvedValue(false) },
    provisionTenant: jest.fn(),
    createPayMongoChildAccountForTenant: jest.fn(),
    shouldAutoCreatePayMongoChildAccounts: jest.fn().mockReturnValue(false),
    emailService: { isEmailConfigured: jest.fn().mockReturnValue(false), sendCompanySubmissionReceivedEmail: jest.fn() },
    idGenerator: jest.fn().mockReturnValue(tenant.id),
    getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.MANUAL),
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
  };
  return { deps, tenant, useCase: buildRegisterCompanyRequestUseCase(deps) };
};

// issue #178 "templates become the Operating Mode" follow-up: industryKey
// derives both workflow_mode and the store template server-side, so a
// signup surface using the Industry picker never sends a raw templateKey.
describe('registerCompanyRequestUseCase - registration Industry catalog', () => {
  it('derives workflow_mode and store_template_key from industryKey alone', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({ body: { ...baseBody, industryKey: 'micro_fnb' }, dgfyAccount, correlationId: 'industry-derive' });

    expect(result.success).toBe(true);
    expect(result.data.payload.data).toEqual(expect.objectContaining({
      workflow_mode: 'fnb',
      registration_industry: 'micro_fnb',
      store_template_key: 'fnb_counter_service'
    }));
    expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          workflow_mode: 'fnb',
          registration_industry: 'micro_fnb',
          store_template_key: 'fnb_counter_service'
        })
      }),
      { transaction: 'transaction' }
    );
    expect(deps.companyRegistrationRepository.createInitial).toHaveBeenCalledWith(
      expect.objectContaining({ registrationIndustry: 'micro_fnb', storeTemplateKey: 'fnb_counter_service' })
    );
  });

  it('leaves the legacy workflowMode-only path byte-identical when industryKey is absent', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({ body: { ...baseBody, workflowMode: 'retail' }, dgfyAccount, correlationId: 'legacy-mode-only' });

    expect(result.success).toBe(true);
    expect(result.data.payload.data).toEqual(expect.objectContaining({
      workflow_mode: 'retail',
      registration_industry: null,
      store_template_key: null
    }));
    expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ workflow_mode: 'retail', registration_industry: null, store_template_key: null })
      }),
      { transaction: 'transaction' }
    );
  });

  it('rejects an unknown industryKey with a 400 before touching the database', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({ body: { ...baseBody, industryKey: 'not_a_real_industry' }, dgfyAccount, correlationId: 'bad-industry' });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(400);
    expect(deps.tenantAdminRepository.createTenant).not.toHaveBeenCalled();
  });

  it('rejects a workflowMode that conflicts with the resolved industryKey', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({
      body: { ...baseBody, industryKey: 'micro_fnb', workflowMode: 'retail' },
      dgfyAccount,
      correlationId: 'conflicting-mode'
    });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(400);
    expect(deps.tenantAdminRepository.createTenant).not.toHaveBeenCalled();
  });

  it('accepts a workflowMode sent alongside industryKey when the two agree', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({
      body: { ...baseBody, industryKey: 'micro_fnb', workflowMode: 'fnb' },
      dgfyAccount,
      correlationId: 'agreeing-mode'
    });

    expect(result.success).toBe(true);
    expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalled();
  });

  it('gives an engine-external industry (no template) a null store_template_key, exactly like a legacy mode-only registration', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({ body: { ...baseBody, industryKey: 'healthcare' }, dgfyAccount, correlationId: 'external-industry' });

    expect(result.success).toBe(true);
    expect(result.data.payload.data).toEqual(expect.objectContaining({
      workflow_mode: 'healthcare',
      registration_industry: 'healthcare',
      store_template_key: null
    }));
  });

  // Phase 39: an industry an admin has hidden from registration is rejected
  // even though the client can technically still send its key - the
  // picker filters it client-side, but nothing stops a direct API call.
  describe('admin visibility toggle (issue #178 Phase 39)', () => {
    it('rejects a hidden industryKey with a 400 before touching the database', async () => {
      const { deps, useCase } = createUseCase();
      deps.registrationIndustryVisibilityRepository.isHidden.mockImplementation(async (key) => key === 'micro_fnb');

      const result = await useCase({ body: { ...baseBody, industryKey: 'micro_fnb' }, dgfyAccount, correlationId: 'hidden-industry' });

      // Pins the exact key isHidden() is called with - a stray reference to
      // a field the resolved catalog entry doesn't carry (e.g.
      // resolvedIndustry.key, which resolveRegistrationIndustry() never
      // sets) would call isHidden(undefined) and this mock would return
      // false, silently letting a hidden industry through.
      expect(deps.registrationIndustryVisibilityRepository.isHidden).toHaveBeenCalledWith('micro_fnb');
      expect(result.success).toBe(false);
      expect(result.error.statusCode).toBe(400);
      expect(deps.tenantAdminRepository.createTenant).not.toHaveBeenCalled();
      expect(deps.trackEngagementEvent).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ failure_reason: 'hidden_industry_key' })
      }));
    });

    it('fails open (registration proceeds) when the visibility lookup itself rejects', async () => {
      const { deps, useCase } = createUseCase();
      deps.registrationIndustryVisibilityRepository.isHidden.mockRejectedValue(new Error('landlord DB unreachable'));

      const result = await useCase({ body: { ...baseBody, industryKey: 'micro_fnb' }, dgfyAccount, correlationId: 'visibility-lookup-fails' });

      expect(result.success).toBe(true);
      expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalled();
    });

    it('fails open (registration proceeds) when registrationIndustryVisibilityRepository is not injected at all', async () => {
      const { deps } = createUseCase();
      delete deps.registrationIndustryVisibilityRepository;
      const useCase = buildRegisterCompanyRequestUseCase(deps);

      const result = await useCase({ body: { ...baseBody, industryKey: 'micro_fnb' }, dgfyAccount, correlationId: 'no-visibility-dep' });

      expect(result.success).toBe(true);
      expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalled();
    });
  });
});
