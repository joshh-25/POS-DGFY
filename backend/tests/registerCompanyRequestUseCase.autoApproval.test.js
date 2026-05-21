import { jest } from '@jest/globals';

const mockVerifyEmailOtp = jest.fn().mockResolvedValue({ valid: true });

jest.unstable_mockModule('../src/services/emailOtpService.js', () => ({
    EMAIL_OTP_PURPOSES: {
        COMPANY_REGISTRATION: 'company_registration'
    },
    verifyEmailOtp: mockVerifyEmailOtp
}));

const { buildRegisterCompanyRequestUseCase } = await import('../src/modules/tenants/usecases/registerCompanyRequestUseCase.js');
const {
    normalizeTenantRegistrationApprovalMode,
    TENANT_REGISTRATION_APPROVAL_MODES
} = await import('../src/config/tenantRegistrationApproval.js');

const validBody = {
    name: 'Auto Accept Foods',
    email_otp_code: '123456',
    workflowMode: 'food_manufacturing'
};

const dgfyAccount = {
    id: 'dgfy-account-1',
    first_name: 'Owner',
    last_name: 'Founder',
    username: 'Owner',
    email: 'owner@autoaccept.test',
    phone: '+639123456789',
    password_hash: 'dgfy-hashed-password',
    email_verified_at: new Date('2026-05-21T00:00:00.000Z')
};

const createUseCase = (overrides = {}) => {
    const tenantAdminRepository = {
        findTenantByName: jest.fn().mockResolvedValue(null),
        createTenant: jest.fn().mockImplementation(async (payload) => ({ ...payload }))
    };
    const paypalService = {
        verifySubscription: jest.fn()
    };
    const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
    const addEmailTenantMapping = jest.fn().mockResolvedValue({ created: true });
    const dgfyAccountRepository = {
        upsertFounderMembership: jest.fn().mockResolvedValue({ id: 1 })
    };
    const provisionTenant = jest.fn().mockResolvedValue({ id: 'tenant-id', status: 'active', admin_user_id: 1 });
    const emailService = {
        isEmailConfigured: jest.fn().mockReturnValue(false),
        sendCompanyApprovedEmail: jest.fn()
    };
    const idGenerator = jest.fn().mockReturnValue('12345678-aaaa-bbbb-cccc-123456789abc');
    const logger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    };

    const deps = {
        tenantAdminRepository,
        paypalService,
        trackEngagementEvent,
        addEmailTenantMapping,
        dgfyAccountRepository,
        provisionTenant,
        emailService,
        idGenerator,
        getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD),
        logger,
        ...overrides
    };

    return {
        deps,
        useCase: buildRegisterCompanyRequestUseCase(deps)
    };
};

describe('registerCompanyRequestUseCase approval mode', () => {
    it('defaults to auto-standard mode when approval mode is omitted', () => {
        expect(normalizeTenantRegistrationApprovalMode()).toBe(
            TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD
        );
    });

    it('falls back to auto-standard mode for invalid approval mode values', () => {
        const logger = { warn: jest.fn() };

        expect(normalizeTenantRegistrationApprovalMode('invalid-mode', logger)).toBe(
            TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD
        );
        expect(logger.warn).toHaveBeenCalledWith(
            '[TenantRegistration] Invalid TENANT_REGISTRATION_APPROVAL_MODE; using default auto-standard approval',
            expect.objectContaining({ providedValue: 'invalid-mode' })
        );
    });

    it('auto-provisions standard registration by default', async () => {
        const { deps, useCase } = createUseCase();

        const result = await useCase({ body: validBody, dgfyAccount, correlationId: 'req-auto-default' });

        expect(result.success).toBe(true);
        expect(result.data.payload.message).toBe('Company registered and activated successfully. You can sign in now.');
        expect(result.data.payload.data).toEqual(expect.objectContaining({
            status: 'active',
            company_token: 'token-autoacceptfoods-12345678',
            email_sent: false
        }));
        expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalledWith(expect.objectContaining({
            status: 'pending',
            payment_method: 'manual',
            plan: 'premium',
            admin_email: dgfyAccount.email,
            admin_phone: dgfyAccount.phone,
            admin_password_hash: dgfyAccount.password_hash,
            compliance_mode_state: 'non_compliant_active'
        }));
        expect(deps.addEmailTenantMapping).not.toHaveBeenCalled();
        expect(deps.provisionTenant).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: '12345678-aaaa-bbbb-cccc-123456789abc',
            name: validBody.name,
            dbName: 'sku_tenant_autoacceptfoods_12345678',
            companyToken: 'token-autoacceptfoods-12345678',
            adminEmail: dgfyAccount.email,
            adminPhone: dgfyAccount.phone,
            adminUsername: dgfyAccount.first_name,
            adminPasswordHash: dgfyAccount.password_hash,
            workflowMode: validBody.workflowMode
        }));
        expect(deps.dgfyAccountRepository.upsertFounderMembership).toHaveBeenCalledWith(expect.objectContaining({
            dgfyAccountId: dgfyAccount.id,
            tenantId: '12345678-aaaa-bbbb-cccc-123456789abc',
            role: 'admin'
        }));
    });

    it('keeps standard registration pending when manual approval mode is explicitly configured', async () => {
        const { deps, useCase } = createUseCase({
            getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.MANUAL)
        });

        const result = await useCase({ body: validBody, dgfyAccount, correlationId: 'req-manual' });

        expect(result.success).toBe(true);
        expect(result.data.payload.data.status).toBe('pending');
        expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalledWith(expect.objectContaining({
            status: 'pending',
            admin_email: dgfyAccount.email,
            admin_phone: dgfyAccount.phone,
            db_name: 'sku_tenant_autoacceptfoods_12345678',
            plan: 'premium'
        }));
        expect(deps.addEmailTenantMapping).toHaveBeenCalledWith(dgfyAccount.email, '12345678-aaaa-bbbb-cccc-123456789abc');
        expect(deps.provisionTenant).not.toHaveBeenCalled();
    });

    it('rejects missing DGFY account before creating a tenant', async () => {
        const { deps, useCase } = createUseCase();

        const result = await useCase({
            body: validBody,
            correlationId: 'req-short-password'
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(400);
        expect(result.error.message).toBe('A signed-in DGFY account, company name, and business industry are required.');
        expect(deps.tenantAdminRepository.createTenant).not.toHaveBeenCalled();
    });

    it('auto-provisions standard registration when auto_standard mode is explicitly configured', async () => {
        const { deps, useCase } = createUseCase({
            getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD)
        });

        const result = await useCase({ body: validBody, dgfyAccount, correlationId: 'req-auto' });

        expect(result.success).toBe(true);
        expect(result.data.payload.message).toBe('Company registered and activated successfully. You can sign in now.');
        expect(result.data.payload.data).toEqual(expect.objectContaining({
            status: 'active',
            company_token: 'token-autoacceptfoods-12345678',
            email_sent: false
        }));
        expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalledWith(expect.objectContaining({
            status: 'pending',
            payment_method: 'manual',
            plan: 'premium',
            subscription_status: 'inactive'
        }));
        expect(deps.addEmailTenantMapping).not.toHaveBeenCalled();
        expect(deps.provisionTenant).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: '12345678-aaaa-bbbb-cccc-123456789abc',
            name: validBody.name,
            dbName: 'sku_tenant_autoacceptfoods_12345678',
            companyToken: 'token-autoacceptfoods-12345678',
            adminEmail: dgfyAccount.email,
            adminPhone: dgfyAccount.phone,
            adminUsername: dgfyAccount.first_name,
            adminPasswordHash: dgfyAccount.password_hash,
            workflowMode: validBody.workflowMode
        }));
    });

    it('returns active success when approval email fails after provisioning succeeds', async () => {
        const { deps, useCase } = createUseCase({
            getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD),
            emailService: {
                isEmailConfigured: jest.fn().mockReturnValue(true),
                sendCompanyApprovedEmail: jest.fn().mockRejectedValue(new Error('SMTP failed'))
            }
        });

        const result = await useCase({ body: validBody, dgfyAccount, correlationId: 'req-email-fail' });

        expect(result.success).toBe(true);
        expect(result.data.payload.data).toEqual(expect.objectContaining({
            status: 'active',
            email_sent: false
        }));
        expect(deps.provisionTenant).toHaveBeenCalled();
        expect(deps.emailService.sendCompanyApprovedEmail).toHaveBeenCalledWith({
            email: dgfyAccount.email,
            companyName: validBody.name,
            companyToken: 'token-autoacceptfoods-12345678'
        });
        expect(deps.logger.warn).toHaveBeenCalledWith(
            '[Registration] Failed to send approval email to owner@autoaccept.test: SMTP failed'
        );
    });

    it('returns email_sent true when approval email sends after provisioning', async () => {
        const { deps, useCase } = createUseCase({
            getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD),
            emailService: {
                isEmailConfigured: jest.fn().mockReturnValue(true),
                sendCompanyApprovedEmail: jest.fn().mockResolvedValue({ accepted: [dgfyAccount.email] })
            }
        });

        const result = await useCase({ body: validBody, dgfyAccount, correlationId: 'req-email-sent' });

        expect(result.success).toBe(true);
        expect(result.data.payload.data).toEqual(expect.objectContaining({
            status: 'active',
            email_sent: true
        }));
        expect(deps.emailService.sendCompanyApprovedEmail).toHaveBeenCalledWith({
            email: dgfyAccount.email,
            companyName: validBody.name,
            companyToken: 'token-autoacceptfoods-12345678'
        });
    });

    it('does not report login-ready success when auto-provisioning fails', async () => {
        const { deps, useCase } = createUseCase({
            getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD),
            provisionTenant: jest.fn().mockRejectedValue(new Error('Provisioning failed'))
        });

        const result = await useCase({ body: validBody, dgfyAccount, correlationId: 'req-fail' });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(500);
        expect(result.error.message).toBe('Provisioning failed');
        expect(deps.addEmailTenantMapping).not.toHaveBeenCalled();
    });
});
