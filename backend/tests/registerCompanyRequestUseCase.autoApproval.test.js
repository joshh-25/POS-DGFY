import { jest } from '@jest/globals';
import { buildRegisterCompanyRequestUseCase } from '../src/modules/tenants/usecases/registerCompanyRequestUseCase.js';
import {
    normalizeTenantRegistrationApprovalMode,
    TENANT_REGISTRATION_APPROVAL_MODES
} from '../src/config/tenantRegistrationApproval.js';

const validBody = {
    name: 'Auto Accept Foods',
    adminEmail: 'owner@autoaccept.test',
    adminPhone: '+63 912 345 6789',
    adminPassword: 'StrongPass1!',
    plan: 'standard',
    complianceMode: 'non_compliant',
    workflowMode: 'food_manufacturing'
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
    const provisionTenant = jest.fn().mockResolvedValue({ id: 'tenant-id', status: 'active' });
    const emailService = {
        isEmailConfigured: jest.fn().mockReturnValue(false),
        sendCompanyApprovedEmail: jest.fn()
    };
    const hashPassword = jest.fn().mockResolvedValue('hashed-password');
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
        provisionTenant,
        emailService,
        hashPassword,
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

        const result = await useCase({ body: validBody, correlationId: 'req-auto-default' });

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
            plan: 'premium'
        }));
        expect(deps.addEmailTenantMapping).not.toHaveBeenCalled();
        expect(deps.provisionTenant).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: '12345678-aaaa-bbbb-cccc-123456789abc',
            name: validBody.name,
            dbName: 'sku_tenant_autoacceptfoods_12345678',
            companyToken: 'token-autoacceptfoods-12345678',
            adminEmail: validBody.adminEmail,
            adminPhone: validBody.adminPhone,
            adminPasswordHash: 'hashed-password',
            workflowMode: validBody.workflowMode
        }));
    });

    it('keeps standard registration pending when manual approval mode is explicitly configured', async () => {
        const { deps, useCase } = createUseCase({
            getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.MANUAL)
        });

        const result = await useCase({ body: validBody, correlationId: 'req-manual' });

        expect(result.success).toBe(true);
        expect(result.data.payload.data.status).toBe('pending');
        expect(deps.tenantAdminRepository.createTenant).toHaveBeenCalledWith(expect.objectContaining({
            status: 'pending',
            admin_email: validBody.adminEmail,
            admin_phone: validBody.adminPhone,
            db_name: 'sku_tenant_autoacceptfoods_12345678',
            plan: 'premium'
        }));
        expect(deps.addEmailTenantMapping).toHaveBeenCalledWith(validBody.adminEmail, '12345678-aaaa-bbbb-cccc-123456789abc');
        expect(deps.provisionTenant).not.toHaveBeenCalled();
    });

    it('rejects founder passwords shorter than 8 characters before creating a tenant', async () => {
        const { deps, useCase } = createUseCase();

        const result = await useCase({
            body: {
                ...validBody,
                adminPassword: 'abcdefg'
            },
            correlationId: 'req-short-password'
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(400);
        expect(result.error.message).toBe('Password must be at least 8 characters');
        expect(deps.tenantAdminRepository.createTenant).not.toHaveBeenCalled();
        expect(deps.hashPassword).not.toHaveBeenCalled();
    });

    it('auto-provisions standard registration when auto_standard mode is explicitly configured', async () => {
        const { deps, useCase } = createUseCase({
            getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD)
        });

        const result = await useCase({ body: validBody, correlationId: 'req-auto' });

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
            adminEmail: validBody.adminEmail,
            adminPhone: validBody.adminPhone,
            adminPasswordHash: 'hashed-password',
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

        const result = await useCase({ body: validBody, correlationId: 'req-email-fail' });

        expect(result.success).toBe(true);
        expect(result.data.payload.data).toEqual(expect.objectContaining({
            status: 'active',
            email_sent: false
        }));
        expect(deps.provisionTenant).toHaveBeenCalled();
        expect(deps.emailService.sendCompanyApprovedEmail).toHaveBeenCalledWith({
            email: validBody.adminEmail,
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
                sendCompanyApprovedEmail: jest.fn().mockResolvedValue({ accepted: [validBody.adminEmail] })
            }
        });

        const result = await useCase({ body: validBody, correlationId: 'req-email-sent' });

        expect(result.success).toBe(true);
        expect(result.data.payload.data).toEqual(expect.objectContaining({
            status: 'active',
            email_sent: true
        }));
        expect(deps.emailService.sendCompanyApprovedEmail).toHaveBeenCalledWith({
            email: validBody.adminEmail,
            companyName: validBody.name,
            companyToken: 'token-autoacceptfoods-12345678'
        });
    });

    it('does not report login-ready success when auto-provisioning fails', async () => {
        const { deps, useCase } = createUseCase({
            getTenantRegistrationApprovalMode: jest.fn().mockReturnValue(TENANT_REGISTRATION_APPROVAL_MODES.AUTO_STANDARD),
            provisionTenant: jest.fn().mockRejectedValue(new Error('Provisioning failed'))
        });

        const result = await useCase({ body: validBody, correlationId: 'req-fail' });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(500);
        expect(result.error.message).toBe('Provisioning failed');
        expect(deps.addEmailTenantMapping).not.toHaveBeenCalled();
    });
});
