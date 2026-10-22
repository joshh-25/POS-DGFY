import { jest } from '@jest/globals';
import { buildRegisterCompanyRequestUseCase } from '../src/modules/tenants/usecases/registerCompanyRequestUseCase.js';
import { normalizeTenantRegistrationApprovalMode, TENANT_REGISTRATION_APPROVAL_MODES } from '../src/config/tenantRegistrationApproval.js';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/shared/utils/dgfyLegalTerms.js';

const body = { name: 'Manual Review Foods', workflowMode: 'food_manufacturing', accepted_company_terms: true, accepted_marketplace_terms: true, company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms, marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms };
const dgfyAccount = { id: 'dgfy-account-1', first_name: 'Owner', email: 'owner@manual.test', phone: '+639123456789', password_hash: 'hash' };

const createUseCase = ({ emailConfigured = false, approvalMode = TENANT_REGISTRATION_APPROVAL_MODES.MANUAL } = {}) => {
  const tenant = {
    id: '12345678-aaaa-bbbb-cccc-123456789abc',
    name: body.name,
    db_name: 'sku_tenant_manualreview_12345678',
    company_token: 'token-manualreview-12345678',
    admin_email: dgfyAccount.email,
    admin_password_hash: dgfyAccount.password_hash,
    owner_dgfy_account_id: dgfyAccount.id,
    settings: {}
  };
  const submissionEmailDelivery = { id: 'delivery-1' };
  const deps = {
    tenantAdminRepository: { transaction: jest.fn(async (callback) => callback('transaction')), findTenantByName: jest.fn().mockResolvedValue(null), createTenant: jest.fn().mockResolvedValue(tenant) },
    companyRegistrationRepository: {
      createInitial: jest.fn().mockResolvedValue({ id: 'application-1', submissionEmailDelivery }),
      updateEmailDelivery: jest.fn().mockResolvedValue(),
      markAutoProvisioningStarted: jest.fn().mockResolvedValue({ id: 'application-1' }),
      markProvisioningOutcome: jest.fn().mockResolvedValue()
    },
    paypalService: { verifySubscription: jest.fn() }, trackEngagementEvent: jest.fn().mockResolvedValue({}), addEmailTenantMapping: jest.fn().mockResolvedValue({}),
    dgfyAccountRepository: { recordLegalAcknowledgement: jest.fn().mockResolvedValue({}), upsertPendingFounderMembership: jest.fn().mockResolvedValue({}), upsertFounderMembership: jest.fn().mockResolvedValue({}) },
    provisionTenant: jest.fn().mockResolvedValue({ admin_user_id: 11 }),
    materializeApprovedCompanyRegistration: jest.fn().mockResolvedValue(null),
    createPayMongoChildAccountForTenant: jest.fn(), shouldAutoCreatePayMongoChildAccounts: jest.fn().mockReturnValue(true),
    emailService: {
      isEmailConfigured: jest.fn().mockReturnValue(emailConfigured),
      sendCompanySubmissionReceivedEmail: jest.fn().mockResolvedValue({ messageId: 'provider-1' }),
      sendCompanyOnboardingEmail: jest.fn().mockResolvedValue({ messageId: 'onboarding-provider-1' })
    }, idGenerator: jest.fn().mockReturnValue(tenant.id),
    getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(approvalMode), logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
  };
  return { deps, useCase: buildRegisterCompanyRequestUseCase(deps) };
};

describe('registerCompanyRequestUseCase registration approval modes', () => {
  it('normalizes omitted and invalid approval settings to automatic standard registration', () => {
    expect(normalizeTenantRegistrationApprovalMode()).toBe(TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD);
    expect(normalizeTenantRegistrationApprovalMode('auto_standard')).toBe(TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD);
  });

  it('creates an application and pending founder membership without provisioning or token disclosure', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({ body, dgfyAccount, correlationId: 'manual-registration' });
    expect(result.success).toBe(true);
    expect(result.data.payload).toEqual(expect.objectContaining({ success: true, data: expect.objectContaining({ application_id: 'application-1', status: 'pending' }) }));
    expect(result.data.payload.data.company_token).toBeUndefined();
    expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', owner_dgfy_account_id: dgfyAccount.id }), { transaction: 'transaction' });
    expect(deps.companyRegistrationRepository.createInitial).toHaveBeenCalledWith(expect.objectContaining({ tenant: expect.objectContaining({ id: '12345678-aaaa-bbbb-cccc-123456789abc' }), dgfyAccount, transaction: 'transaction' }));
    expect(deps.dgfyAccountRepository.upsertPendingFounderMembership).toHaveBeenCalledWith(expect.objectContaining({ dgfyAccountId: dgfyAccount.id, tenantId: '12345678-aaaa-bbbb-cccc-123456789abc', role: 'admin' }), { transaction: 'transaction' });
    expect(deps.provisionTenant).not.toHaveBeenCalled();
    expect(deps.createPayMongoChildAccountForTenant).not.toHaveBeenCalled();
  });

  it('auto-approves, provisions in the background, and sends the POS onboarding link', async () => {
    const previousPosUrl = process.env.POS_APP_URL;
    process.env.POS_APP_URL = 'https://pos.example.test';
    const { deps, useCase } = createUseCase({
      approvalMode: TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD,
      emailConfigured: true
    });

    const result = await useCase({ body, dgfyAccount, correlationId: 'auto-registration' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(result.success).toBe(true);
    expect(result.data.statusCode).toBe(202);
    expect(result.data.payload).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        application_id: 'application-1',
        status: 'setting_up_company',
        review_status: 'approved',
        provisioning_status: 'in_progress',
        registration_access_mode: 'catalog_only'
      })
    }));
    expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending',
      settings: expect.objectContaining({ registration_access_mode: 'catalog_only' })
    }), { transaction: 'transaction' });
    expect(deps.companyRegistrationRepository.markAutoProvisioningStarted).toHaveBeenCalledWith({ tenantId: '12345678-aaaa-bbbb-cccc-123456789abc' });
    expect(deps.provisionTenant).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: '12345678-aaaa-bbbb-cccc-123456789abc',
      tenantCapabilities: { pos_enabled: false }
    }));
    expect(deps.companyRegistrationRepository.markProvisioningOutcome).toHaveBeenCalledWith({
      tenantId: '12345678-aaaa-bbbb-cccc-123456789abc',
      succeeded: true
    });
    expect(deps.emailService.sendCompanyOnboardingEmail).toHaveBeenCalledWith({
      email: dgfyAccount.email,
      companyName: body.name,
      statusUrl: 'http://localhost:5173/register-company/status/application-1',
      posUrl: 'https://pos.example.test/#/terminal?setup_flow=tenant_onboarding&setup_step=profile&view=items&tenant_id=12345678-aaaa-bbbb-cccc-123456789abc'
    });
    expect(deps.emailService.sendCompanySubmissionReceivedEmail).not.toHaveBeenCalled();

    if (previousPosUrl == null) delete process.env.POS_APP_URL;
    else process.env.POS_APP_URL = previousPosUrl;
  });

  it('rejects registration when current company terms are not acknowledged', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({ body: { ...body, accepted_company_terms: false }, dgfyAccount, correlationId: 'missing-terms' });
    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(422);
    expect(deps.tenantAdminRepository.createTenant).not.toHaveBeenCalled();
  });

  it('rejects registration when marketplace provider terms are not acknowledged independently', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({ body: { ...body, accepted_marketplace_terms: false }, dgfyAccount, correlationId: 'missing-marketplace-terms' });
    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(422);
    expect(result.error.details).toEqual(expect.objectContaining({ field: 'accepted_marketplace_terms' }));
    expect(deps.tenantAdminRepository.createTenant).not.toHaveBeenCalled();
  });

  it('fails closed when legal acknowledgement persistence is unavailable', async () => {
    const { deps, useCase } = createUseCase();
    delete deps.dgfyAccountRepository.recordLegalAcknowledgement;

    const result = await useCase({ body, dgfyAccount, correlationId: 'missing-legal-persistence' });

    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(500);
    expect(result.error.details).toEqual({ error_code: 'LEGAL_ACKNOWLEDGEMENT_PERSISTENCE_UNAVAILABLE' });
    expect(deps.tenantAdminRepository.createTenant).not.toHaveBeenCalled();
  });

  it('dispatches the queued submission email with the SKUpervisor status URL', async () => {
    const previousOrigin = process.env.SKUPERVISOR_PUBLIC_ORIGIN;
    process.env.SKUPERVISOR_PUBLIC_ORIGIN = 'https://app.example.test';
    const { deps, useCase } = createUseCase({ emailConfigured: true });

    const result = await useCase({ body, dgfyAccount, correlationId: 'submission-email' });

    expect(result.success).toBe(true);
    expect(deps.emailService.sendCompanySubmissionReceivedEmail).toHaveBeenCalledWith({
      email: dgfyAccount.email,
      companyName: body.name,
      statusUrl: 'https://app.example.test/register-company/status/application-1'
    });
    expect(deps.companyRegistrationRepository.updateEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'delivery-1' }),
      expect.objectContaining({ status: 'sent_to_provider', provider_message_id: 'provider-1' })
    );
    if (previousOrigin == null) delete process.env.SKUPERVISOR_PUBLIC_ORIGIN;
    else process.env.SKUPERVISOR_PUBLIC_ORIGIN = previousOrigin;
  });
});
