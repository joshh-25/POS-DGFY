import { jest } from '@jest/globals';
import { buildRegisterCompanyRequestUseCase } from '../src/modules/tenants/usecases/registerCompanyRequestUseCase.js';
import { normalizeTenantRegistrationApprovalMode, TENANT_REGISTRATION_APPROVAL_MODES } from '../src/config/tenantRegistrationApproval.js';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/shared/utils/dgfyLegalTerms.js';

const body = { name: 'Manual Review Foods', workflowMode: 'food_manufacturing', accepted_company_terms: true, company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms, marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms };
const dgfyAccount = { id: 'dgfy-account-1', first_name: 'Owner', email: 'owner@manual.test', phone: '+639123456789', password_hash: 'hash' };

const createUseCase = ({ emailConfigured = false } = {}) => {
  const tenant = { id: '12345678-aaaa-bbbb-cccc-123456789abc', name: body.name, settings: {} };
  const submissionEmailDelivery = { id: 'delivery-1' };
  const deps = {
    tenantAdminRepository: { transaction: jest.fn(async (callback) => callback('transaction')), findTenantByName: jest.fn().mockResolvedValue(null), createTenant: jest.fn().mockResolvedValue(tenant) },
    companyRegistrationRepository: {
      createInitial: jest.fn().mockResolvedValue({ id: 'application-1', submissionEmailDelivery }),
      updateEmailDelivery: jest.fn().mockResolvedValue()
    },
    paypalService: { verifySubscription: jest.fn() }, trackEngagementEvent: jest.fn().mockResolvedValue({}), addEmailTenantMapping: jest.fn().mockResolvedValue({}),
    dgfyAccountRepository: { recordLegalAcknowledgement: jest.fn().mockResolvedValue({}), upsertPendingFounderMembership: jest.fn().mockResolvedValue({}) },
    provisionTenant: jest.fn(), createPayMongoChildAccountForTenant: jest.fn(), shouldAutoCreatePayMongoChildAccounts: jest.fn().mockReturnValue(true),
    emailService: {
      isEmailConfigured: jest.fn().mockReturnValue(emailConfigured),
      sendCompanySubmissionReceivedEmail: jest.fn().mockResolvedValue({ messageId: 'provider-1' })
    }, idGenerator: jest.fn().mockReturnValue(tenant.id),
    getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.MANUAL), logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
  };
  return { deps, useCase: buildRegisterCompanyRequestUseCase(deps) };
};

describe('registerCompanyRequestUseCase mandatory manual review', () => {
  it('normalizes omitted and invalid approval settings to manual review', () => {
    expect(normalizeTenantRegistrationApprovalMode()).toBe(TENANT_REGISTRATION_APPROVAL_MODES.MANUAL);
    expect(normalizeTenantRegistrationApprovalMode('auto_standard')).toBe(TENANT_REGISTRATION_APPROVAL_MODES.MANUAL);
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

  it('rejects registration when current company terms are not acknowledged', async () => {
    const { deps, useCase } = createUseCase();
    const result = await useCase({ body: { ...body, accepted_company_terms: false }, dgfyAccount, correlationId: 'missing-terms' });
    expect(result.success).toBe(false);
    expect(result.error.statusCode).toBe(422);
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
