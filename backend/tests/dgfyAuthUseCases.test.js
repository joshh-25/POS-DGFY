import { jest } from '@jest/globals';
import {
    buildAcceptDgfyInvitationUseCase,
    buildChangeDgfyPasswordUseCase,
    buildCompleteDgfyPasswordResetUseCase,
    buildCreateDgfyHandoffUseCase,
    buildExchangeDgfyHandoffUseCase,
    buildGetDgfyMeUseCase,
    buildListDgfyAccountCompaniesUseCase,
    buildLoginDgfyAccountUseCase,
    buildRequestDgfyBusinessStepUpUseCase,
    buildRequestDgfyPasswordResetUseCase,
    buildRequestDgfyEmailVerificationUseCase,
    buildStartDgfyTenantSessionUseCase,
    buildSwitchDgfyCompanyUseCase,
    buildUpdateDgfyProfileUseCase,
    buildVerifyDgfyEmailUseCase,
    buildRegisterDgfyAccountUseCase
} from '../src/modules/dgfy/usecases/dgfyAuthUseCases.js';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/shared/utils/dgfyLegalTerms.js';

const createAccount = (overrides = {}) => ({
    id: 'dgfy-1',
    first_name: 'Ada',
    middle_name: null,
    last_name: 'Lovelace',
    username: 'Ada',
    email: 'ada@example.test',
    phone: '+639123456789',
    password_hash: 'hashed-password',
    is_active: true,
    email_verified_at: null,
    phone_verified_at: null,
    last_login_at: null,
    update: jest.fn().mockResolvedValue(null),
    ...overrides
});

describe('dgfyAuthUseCases', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_ci_only_32_chars!';
    });

    it('creates a global DGFY account with username seeded from first name', async () => {
        const repository = {
            transaction: jest.fn(async (callback) => callback('tx-account')),
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(async (payload) => createAccount(payload)),
            recordLegalAcknowledgement: jest.fn().mockResolvedValue({ acknowledgement_id: 'ack-1' }),
            mirrorPendingInvitationsForAccount: jest.fn().mockResolvedValue([]),
            mirrorLegacyFounderMembershipsForAccount: jest.fn().mockResolvedValue([])
        };
        const useCase = buildRegisterDgfyAccountUseCase({
            repository,
            hashPassword: jest.fn().mockResolvedValue('hashed-password'),
            verifyEmailOtp: jest.fn().mockResolvedValue({ verified: true })
        });

        const result = await useCase({
            body: {
                first_name: 'Ada',
                middle_name: 'Byron',
                last_name: 'Lovelace',
                email: 'ADA@EXAMPLE.TEST',
                phone: '+63 912 345 6789',
                password: 'password123',
                confirm_password: 'password123',
                email_otp_code: '123456',
                accepted_terms: true,
                terms_version: DGFY_LEGAL_TERM_VERSIONS.accountTerms,
                privacy_version: DGFY_LEGAL_TERM_VERSIONS.privacy,
                marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
            },
            metadata: {
                ip_address: '127.0.0.1',
                user_agent: 'vitest',
                request_id: 'req-dgfy-register'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(201);
        expect(repository.transaction).toHaveBeenCalled();
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
            first_name: 'Ada',
            middle_name: 'Byron',
            last_name: 'Lovelace',
            username: 'Ada',
            email: 'ada@example.test',
            phone: '+63 912 345 6789'
        }), { transaction: 'tx-account' });
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
            email_verified_at: expect.any(Date)
        }), { transaction: 'tx-account' });
        expect(result.data.payload.data.token).toBeTruthy();
        expect(result.data.payload.data.account.middle_name).toBe('Byron');
        expect(repository.mirrorPendingInvitationsForAccount).toHaveBeenCalledWith(expect.anything(), { transaction: 'tx-account' });
        expect(repository.mirrorLegacyFounderMembershipsForAccount).toHaveBeenCalledWith(expect.anything(), { transaction: 'tx-account' });
        expect(repository.recordLegalAcknowledgement).toHaveBeenCalledWith(expect.objectContaining({
            flow: 'dgfy_account_registration',
            dgfy_account_id: 'dgfy-1',
            tenant_id: null,
            terms_version: DGFY_LEGAL_TERM_VERSIONS.accountTerms,
            privacy_version: DGFY_LEGAL_TERM_VERSIONS.privacy,
            marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms,
            ip_address: '127.0.0.1',
            user_agent: 'vitest',
            request_id: 'req-dgfy-register'
        }), { transaction: 'tx-account' });
    });

    it('rejects DGFY account registration without an email verification code', async () => {
        const repository = {
            transaction: jest.fn(),
            findByEmail: jest.fn(),
            findByPhone: jest.fn(),
            create: jest.fn(),
            recordLegalAcknowledgement: jest.fn()
        };
        const verifyEmailOtp = jest.fn().mockRejectedValue(Object.assign(
            new Error('A valid 6-digit email verification code is required'),
            { statusCode: 422 }
        ));
        const useCase = buildRegisterDgfyAccountUseCase({
            repository,
            hashPassword: jest.fn(),
            verifyEmailOtp
        });

        const result = await useCase({
            body: {
                first_name: 'Ada',
                last_name: 'Lovelace',
                email: 'ada@example.test',
                phone: '+63 912 345 6789',
                password: 'password123',
                confirm_password: 'password123',
                accepted_terms: true,
                terms_version: DGFY_LEGAL_TERM_VERSIONS.accountTerms,
                privacy_version: DGFY_LEGAL_TERM_VERSIONS.privacy,
                marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.message).toBe('A valid 6-digit email verification code is required');
        expect(verifyEmailOtp).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'dgfy_account_verification',
            email: 'ada@example.test',
            tenantId: null
        }));
        expect(repository.findByEmail).toHaveBeenCalledWith('ada@example.test');
        expect(repository.findByPhone).toHaveBeenCalledWith('+63 912 345 6789');
        expect(repository.create).not.toHaveBeenCalled();
    });

    it('does not consume DGFY registration email OTP when the email already exists', async () => {
        const existingAccount = createAccount();
        const repository = {
            transaction: jest.fn(),
            findByEmail: jest.fn().mockResolvedValue(existingAccount),
            findByPhone: jest.fn(),
            create: jest.fn(),
            recordLegalAcknowledgement: jest.fn()
        };
        const verifyEmailOtp = jest.fn();
        const useCase = buildRegisterDgfyAccountUseCase({
            repository,
            hashPassword: jest.fn(),
            verifyEmailOtp
        });

        const result = await useCase({
            body: {
                first_name: 'Ada',
                last_name: 'Lovelace',
                email: 'ada@example.test',
                phone: '+63 912 345 6789',
                password: 'password123',
                confirm_password: 'password123',
                email_otp_code: '123456',
                accepted_terms: true,
                terms_version: DGFY_LEGAL_TERM_VERSIONS.accountTerms,
                privacy_version: DGFY_LEGAL_TERM_VERSIONS.privacy,
                marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(verifyEmailOtp).not.toHaveBeenCalled();
        expect(repository.findByPhone).not.toHaveBeenCalled();
        expect(repository.create).not.toHaveBeenCalled();
    });

    it('fails closed when legal acknowledgement persistence is unavailable', async () => {
        const repository = {
            findByEmail: jest.fn(),
            findByPhone: jest.fn(),
            create: jest.fn(),
            recordLegalAcknowledgement: jest.fn()
        };
        const useCase = buildRegisterDgfyAccountUseCase({
            repository,
            hashPassword: jest.fn()
        });

        const result = await useCase({
            body: {
                first_name: 'Ada',
                last_name: 'Lovelace',
                email: 'ada@example.test',
                phone: '+63 912 345 6789',
                password: 'password123',
                confirm_password: 'password123',
                accepted_terms: true,
                terms_version: DGFY_LEGAL_TERM_VERSIONS.accountTerms,
                privacy_version: DGFY_LEGAL_TERM_VERSIONS.privacy,
                marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(500);
        expect(result.error.details).toEqual(expect.objectContaining({
            error_code: 'LEGAL_ACKNOWLEDGEMENT_PERSISTENCE_UNAVAILABLE'
        }));
        expect(repository.findByEmail).not.toHaveBeenCalled();
        expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects DGFY account registration without terms acknowledgement', async () => {
        const repository = {
            findByEmail: jest.fn(),
            findByPhone: jest.fn(),
            create: jest.fn(),
            recordLegalAcknowledgement: jest.fn()
        };
        const useCase = buildRegisterDgfyAccountUseCase({
            repository,
            hashPassword: jest.fn()
        });

        const result = await useCase({
            body: {
                first_name: 'Ada',
                last_name: 'Lovelace',
                email: 'ada@example.test',
                phone: '+63 912 345 6789',
                password: 'password123',
                confirm_password: 'password123'
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details).toEqual(expect.objectContaining({
            error_code: 'TERMS_ACKNOWLEDGEMENT_REQUIRED',
            field: 'accepted_terms'
        }));
        expect(repository.findByEmail).not.toHaveBeenCalled();
        expect(repository.create).not.toHaveBeenCalled();
        expect(repository.recordLegalAcknowledgement).not.toHaveBeenCalled();
    });

    it('logs in an active DGFY account', async () => {
        const account = createAccount();
        const repository = {
            findByEmail: jest.fn().mockResolvedValue(account),
            findById: jest.fn().mockResolvedValue(account),
            updateLastLogin: jest.fn().mockResolvedValue(null),
            mirrorPendingInvitationsForAccount: jest.fn().mockResolvedValue([]),
            mirrorLegacyFounderMembershipsForAccount: jest.fn().mockResolvedValue([])
        };
        const useCase = buildLoginDgfyAccountUseCase({
            repository,
            comparePassword: jest.fn().mockResolvedValue(true)
        });

        const result = await useCase({
            body: {
                email: 'ada@example.test',
                password: 'password123'
            }
        });

        expect(result.success).toBe(true);
        expect(repository.updateLastLogin).toHaveBeenCalledWith(account);
        expect(repository.mirrorPendingInvitationsForAccount).toHaveBeenCalledWith(account);
        expect(repository.mirrorLegacyFounderMembershipsForAccount).toHaveBeenCalledWith(account);
        expect(result.data.payload.data.account.email).toBe('ada@example.test');
        expect(result.data.payload.data.token).toBeTruthy();
    });

    it('requests and verifies DGFY account email OTP', async () => {
        const account = createAccount();
        const requestUseCase = buildRequestDgfyEmailVerificationUseCase({
            requestEmailOtp: jest.fn().mockResolvedValue({
                otp_id: 'otp-1',
                purpose: 'dgfy_account_verification',
                email: account.email
            })
        });
        const markEmailVerified = jest.fn().mockResolvedValue(createAccount({
            email_verified_at: new Date('2026-05-21T00:00:00.000Z')
        }));
        const verifyUseCase = buildVerifyDgfyEmailUseCase({
            repository: { markEmailVerified },
            verifyEmailOtp: jest.fn().mockResolvedValue({ verified: true })
        });

        const requestResult = await requestUseCase({ account });
        const verifyResult = await verifyUseCase({ account, body: { code: '123456' } });

        expect(requestResult.success).toBe(true);
        expect(requestResult.data.statusCode).toBe(202);
        expect(verifyResult.success).toBe(true);
        expect(markEmailVerified).toHaveBeenCalledWith(account);
        expect(verifyResult.data.payload.data.account.is_email_verified).toBe(true);
    });

    it('exchanges a one-time short-lived DGFY handoff token for a normal DGFY session', async () => {
        const account = createAccount({ email_verified_at: new Date('2026-05-21T00:00:00.000Z') });
        const createHandoff = jest.fn().mockResolvedValue({});
        const createUseCase = buildCreateDgfyHandoffUseCase({
            repository: { createHandoff }
        });
        const handoffResult = await createUseCase({ account });
        const consumeHandoff = jest.fn()
            .mockResolvedValueOnce({
                jti: expect.any(String),
                dgfy_account_id: account.id
            })
            .mockResolvedValueOnce(null);
        const exchangeUseCase = buildExchangeDgfyHandoffUseCase({
            repository: {
                consumeHandoff,
                findById: jest.fn().mockResolvedValue(account),
                mirrorPendingInvitationsForAccount: jest.fn().mockResolvedValue([]),
                mirrorLegacyFounderMembershipsForAccount: jest.fn().mockResolvedValue([])
            }
        });

        const exchangeResult = await exchangeUseCase({
            body: { handoff_token: handoffResult.data.payload.data.handoff_token }
        });

        expect(exchangeResult.success).toBe(true);
        expect(exchangeResult.data.payload.data.account.email).toBe(account.email);
        expect(exchangeResult.data.payload.data.token).toBeTruthy();
        expect(createHandoff).toHaveBeenCalledWith(expect.objectContaining({
            dgfyAccountId: account.id,
            expiresAt: expect.any(Date),
            jti: expect.any(String)
        }));
        expect(consumeHandoff).toHaveBeenCalledWith(expect.objectContaining({
            dgfyAccountId: account.id,
            jti: expect.any(String)
        }));

        const replayResult = await exchangeUseCase({
            body: { handoff_token: handoffResult.data.payload.data.handoff_token }
        });
        expect(replayResult.success).toBe(false);
        expect(replayResult.error.statusCode).toBe(401);

        const browserRecoveryResult = await exchangeUseCase({
            body: {
                handoff_token: handoffResult.data.payload.data.handoff_token,
                soft_fail: true
            }
        });
        expect(browserRecoveryResult.success).toBe(true);
        expect(browserRecoveryResult.data.payload.data).toEqual({
            status: 'invalid',
            reason: 'expired_or_consumed'
        });
    });

    it('starts a SKUpervisor tenant session from an accepted DGFY membership', async () => {
        const session = {
            token: 'tenant-token',
            refreshToken: 'tenant-refresh-token',
            company: { id: 'tenant-1', token: 'token-tenant-1' }
        };
        const createTenantSessionForDgfyAccount = jest.fn().mockResolvedValue(session);
        const useCase = buildStartDgfyTenantSessionUseCase({ createTenantSessionForDgfyAccount });
        const account = createAccount({ id: 'dgfy-account-1' });

        const result = await useCase({
            account,
            body: {
                tenant_id: 'tenant-1',
                company_token: 'token-tenant-1'
            }
        });

        expect(result.success).toBe(true);
        expect(createTenantSessionForDgfyAccount).toHaveBeenCalledWith({
            account,
            tenantId: 'tenant-1',
            companyToken: 'token-tenant-1'
        });
        expect(result.data.payload.data).toEqual(session);
    });

    it('requires company identity before starting a SKUpervisor tenant session', async () => {
        const createTenantSessionForDgfyAccount = jest.fn();
        const useCase = buildStartDgfyTenantSessionUseCase({ createTenantSessionForDgfyAccount });

        const result = await useCase({
            account: createAccount(),
            body: {}
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(400);
        expect(createTenantSessionForDgfyAccount).not.toHaveBeenCalled();
    });

    it('lists DGFY account companies without exposing company tokens', async () => {
        const membershipRows = [{
            id: 10,
            tenant_id: 'tenant-1',
            tenant_user_id: 5,
            role: 'admin',
            status: 'accepted',
            source: 'founder',
            accepted_at: new Date('2026-06-16T10:00:00.000Z'),
            last_selected_at: new Date('2026-06-16T10:10:00.000Z'),
            tenant: {
                id: 'tenant-1',
                name: 'Accepted Foods',
                company_token: 'secret-company-token',
                status: 'active',
                plan: 'premium'
            }
        }, {
            id: 11,
            tenant_id: 'tenant-2',
            tenant_user_id: 6,
            role: 'staff',
            status: 'pending',
            source: 'invite',
            accepted_at: null,
            last_selected_at: null,
            tenant: {
                id: 'tenant-2',
                name: 'Pending Coffee',
                company_token: 'secret-pending-token',
                status: 'active',
                plan: 'standard'
            }
        }];
        const repository = {
            mirrorPendingInvitationsForAccount: jest.fn().mockResolvedValue([]),
            mirrorLegacyFounderMembershipsForAccount: jest.fn().mockResolvedValue([]),
            listMemberships: jest.fn().mockResolvedValue(membershipRows)
        };
        const useCase = buildListDgfyAccountCompaniesUseCase({ repository });

        const result = await useCase({
            account: createAccount(),
            currentTenantToken: 'secret-company-token'
        });

        expect(result.success).toBe(true);
        expect(repository.mirrorPendingInvitationsForAccount).toHaveBeenCalledWith(expect.objectContaining({
            email: 'ada@example.test'
        }));
        expect(repository.mirrorLegacyFounderMembershipsForAccount).toHaveBeenCalledWith(expect.objectContaining({
            email: 'ada@example.test'
        }));
        expect(result.data.payload.data.accepted_count).toBe(1);
        expect(result.data.payload.data.pending_count).toBe(1);
        expect(result.data.payload.data.companies[0]).toEqual(expect.objectContaining({
            company_name: 'Accepted Foods',
            can_switch: true,
            is_current: true,
            requires_action: null
        }));
        expect(result.data.payload.data.companies[1]).toEqual(expect.objectContaining({
            company_name: 'Pending Coffee',
            can_switch: false,
            requires_action: 'accept_invitation'
        }));
        expect(JSON.stringify(result.data.payload.data)).not.toContain('secret-company-token');
        expect(JSON.stringify(result.data.payload.data)).not.toContain('secret-pending-token');
        expect(result.data.payload.data.business_step_up).toEqual(expect.objectContaining({
            verified: false,
            verified_at: null,
            expires_at: null
        }));
    });

    it('requests a DGFY business step-up code for the account email', async () => {
        const requestEmailOtp = jest.fn().mockResolvedValue({
            otp_id: 'otp-step-up',
            purpose: 'dgfy_business_step_up',
            email: 'ada@example.test'
        });
        const useCase = buildRequestDgfyBusinessStepUpUseCase({ requestEmailOtp });

        const result = await useCase({
            account: createAccount(),
            metadata: { request_id: 'req-step-up' }
        });

        expect(result.success).toBe(true);
        expect(requestEmailOtp).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'dgfy_business_step_up',
            email: 'ada@example.test',
            tenantId: null,
            metadata: { request_id: 'req-step-up' }
        }));
    });

    it('switches DGFY companies only after business email step-up', async () => {
        const account = createAccount();
        const membership = {
            id: 12,
            tenant_id: 'tenant-1',
            tenant: {
                id: 'tenant-1',
                name: 'Switch Foods',
                company_token: 'secret-switch-token',
                status: 'active',
                plan: 'premium'
            }
        };
        const session = {
            token: 'tenant-access',
            refreshToken: 'tenant-refresh',
            company: { id: 'tenant-1', name: 'Switch Foods', token: 'secret-switch-token' }
        };
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            updateMembershipLastSelected: jest.fn().mockResolvedValue(null),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const verifyEmailOtp = jest.fn().mockResolvedValue({ verified: true });
        const createTenantSessionForDgfyAccount = jest.fn().mockResolvedValue(session);
        const useCase = buildSwitchDgfyCompanyUseCase({
            repository,
            createTenantSessionForDgfyAccount,
            verifyEmailOtp
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-1',
            body: { email_otp_code: '123456' },
            metadata: { request_id: 'req-switch' }
        });

        expect(result.success).toBe(true);
        expect(verifyEmailOtp).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'dgfy_business_step_up',
            email: account.email,
            code: '123456',
            tenantId: null
        }));
        expect(createTenantSessionForDgfyAccount).toHaveBeenCalledWith({
            account,
            tenantId: 'tenant-1'
        });
        expect(repository.updateMembershipLastSelected).toHaveBeenCalledWith(membership);
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'company_switch_success',
            result: 'success',
            request_id: 'req-switch'
        }));
        expect(result.data.payload.data).toEqual(session);
    });

    it('switches DGFY companies with a recent business step-up without consuming another OTP', async () => {
        const account = createAccount({
            business_step_up_verified_at: new Date()
        });
        const membership = {
            id: 12,
            tenant_id: 'tenant-1',
            tenant: {
                id: 'tenant-1',
                name: 'Switch Foods',
                company_token: 'secret-switch-token',
                status: 'active',
                plan: 'premium'
            }
        };
        const session = {
            token: 'tenant-access',
            refreshToken: 'tenant-refresh',
            company: { id: 'tenant-1', name: 'Switch Foods', token: 'secret-switch-token' }
        };
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            updateMembershipLastSelected: jest.fn().mockResolvedValue(null),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null),
            markBusinessStepUpVerified: jest.fn()
        };
        const verifyEmailOtp = jest.fn();
        const createTenantSessionForDgfyAccount = jest.fn().mockResolvedValue(session);
        const useCase = buildSwitchDgfyCompanyUseCase({
            repository,
            createTenantSessionForDgfyAccount,
            verifyEmailOtp
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-1',
            body: {}
        });

        expect(result.success).toBe(true);
        expect(verifyEmailOtp).not.toHaveBeenCalled();
        expect(repository.markBusinessStepUpVerified).not.toHaveBeenCalled();
        expect(createTenantSessionForDgfyAccount).toHaveBeenCalledWith({
            account,
            tenantId: 'tenant-1'
        });
    });

    it('accepts a pending DGFY invitation with email step-up and does not return a company token', async () => {
        const account = createAccount();
        const membership = {
            id: 21,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-1',
            tenant_user_id: 6,
            role: 'staff',
            status: 'pending',
            source: 'invite',
            tenant: {
                id: 'tenant-1',
                name: 'Invited Foods',
                company_token: 'secret-invite-token',
                status: 'active',
                plan: 'standard'
            }
        };
        const acceptedMembership = {
            ...membership,
            status: 'accepted',
            accepted_at: new Date('2026-06-16T11:00:00.000Z')
        };
        const repository = {
            findMembershipById: jest.fn().mockResolvedValue(membership),
            acceptInvitationMembership: jest.fn().mockResolvedValue(acceptedMembership),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null),
            markBusinessStepUpVerified: jest.fn().mockResolvedValue(null)
        };
        const verifyEmailOtp = jest.fn().mockResolvedValue({ verified: true });
        const useCase = buildAcceptDgfyInvitationUseCase({
            repository,
            verifyEmailOtp
        });

        const result = await useCase({
            account,
            membershipId: '21',
            body: { email_otp_code: '123456' }
        });

        expect(result.success).toBe(true);
        expect(verifyEmailOtp).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'dgfy_business_step_up',
            email: account.email,
            code: '123456',
            tenantId: null
        }));
        expect(repository.acceptInvitationMembership).toHaveBeenCalledWith({ membership, account });
        expect(JSON.stringify(result.data.payload.data)).not.toContain('secret-invite-token');
        expect(result.data.payload.data.membership.company).toEqual(expect.objectContaining({
            id: 'tenant-1',
            name: 'Invited Foods'
        }));
    });

    it('updates the DGFY profile and clears phone verification when phone changes', async () => {
        const account = createAccount({
            phone_verified_at: new Date('2026-05-20T00:00:00.000Z')
        });
        const repository = {
            findByPhone: jest.fn().mockResolvedValue(null),
            updateProfile: jest.fn().mockImplementation(async (_account, payload) => ({
                ...account,
                ...payload
            }))
        };
        const useCase = buildUpdateDgfyProfileUseCase({ repository });

        const result = await useCase({
            account,
            body: {
                first_name: 'Grace',
                middle_name: 'Brewster',
                last_name: 'Hopper',
                phone: '+639987654321'
            }
        });

        expect(result.success).toBe(true);
        expect(repository.updateProfile).toHaveBeenCalledWith(account, expect.objectContaining({
            first_name: 'Grace',
            middle_name: 'Brewster',
            last_name: 'Hopper',
            username: 'Grace',
            phone: '+639987654321',
            phone_verified_at: null
        }));
        expect(result.data.payload.data.account.middle_name).toBe('Brewster');
        expect(result.data.payload.data.account.username).toBe('Grace');
    });

    it('rejects a DGFY profile phone that belongs to a different account', async () => {
        const account = createAccount();
        const useCase = buildUpdateDgfyProfileUseCase({
            repository: {
                findByPhone: jest.fn().mockResolvedValue(createAccount({ id: 'dgfy-2' })),
                updateProfile: jest.fn()
            }
        });

        const result = await useCase({
            account,
            body: {
                first_name: 'Ada',
                last_name: 'Lovelace',
                phone: '+639987654321'
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
    });

    it('changes the DGFY password after validating the current password', async () => {
        const account = createAccount();
        const updatePassword = jest.fn().mockResolvedValue(null);
        const comparePassword = jest.fn().mockResolvedValue(true);
        const hashPassword = jest.fn().mockResolvedValue('hashed-new-password');
        const useCase = buildChangeDgfyPasswordUseCase({
            repository: { updatePassword },
            comparePassword,
            hashPassword
        });

        const result = await useCase({
            account,
            body: {
                current_password: 'password123',
                new_password: 'new-password123',
                confirm_password: 'new-password123'
            }
        });

        expect(result.success).toBe(true);
        expect(comparePassword).toHaveBeenCalledWith('password123', account.password_hash);
        expect(hashPassword).toHaveBeenCalledWith('new-password123');
        expect(updatePassword).toHaveBeenCalledWith(account, 'hashed-new-password');
    });

    it('requests DGFY password reset generically but only sends OTP for active accounts', async () => {
        const requestEmailOtp = jest.fn().mockResolvedValue({
            otp_id: 'otp-1',
            purpose: 'dgfy_password_reset',
            email: 'ada@example.test'
        });
        const repository = {
            findByEmail: jest.fn()
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(createAccount())
        };
        const useCase = buildRequestDgfyPasswordResetUseCase({
            repository,
            requestEmailOtp
        });

        const missingResult = await useCase({ body: { email: 'missing@example.test' } });
        const activeResult = await useCase({ body: { email: 'ADA@EXAMPLE.TEST' } });

        expect(missingResult.success).toBe(true);
        expect(missingResult.data.statusCode).toBe(202);
        expect(activeResult.success).toBe(true);
        expect(requestEmailOtp).toHaveBeenCalledTimes(1);
        expect(requestEmailOtp).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'dgfy_password_reset',
            email: 'ada@example.test',
            tenantId: null
        }));
    });

    it('completes DGFY password reset with a consumed email OTP', async () => {
        const account = createAccount();
        const verifyEmailOtp = jest.fn().mockResolvedValue({ verified: true });
        const hashPassword = jest.fn().mockResolvedValue('hashed-reset-password');
        const updatePassword = jest.fn().mockResolvedValue(null);
        const useCase = buildCompleteDgfyPasswordResetUseCase({
            repository: {
                findByEmail: jest.fn().mockResolvedValue(account),
                updatePassword
            },
            verifyEmailOtp,
            hashPassword
        });

        const result = await useCase({
            body: {
                email: 'ADA@EXAMPLE.TEST',
                code: '123456',
                password: 'reset-password123',
                confirm_password: 'reset-password123'
            }
        });

        expect(result.success).toBe(true);
        expect(verifyEmailOtp).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'dgfy_password_reset',
            email: 'ada@example.test',
            code: '123456',
            tenantId: null
        }));
        expect(updatePassword).toHaveBeenCalledWith(account, 'hashed-reset-password');
    });

    it('returns linked company memberships for the account profile', async () => {
        const account = createAccount();
        const repository = {
            listMemberships: jest.fn().mockResolvedValue([{
                id: 1,
                tenant_id: 'tenant-1',
                tenant_user_id: 2,
                role: 'admin',
                status: 'accepted',
                source: 'founder',
                accepted_at: new Date('2026-05-21T00:00:00.000Z'),
                tenant: {
                    id: 'tenant-1',
                    name: 'Ada Foods',
                    company_token: 'token-ada',
                    status: 'active',
                    plan: 'premium'
                }
            }])
        };
        const useCase = buildGetDgfyMeUseCase({ repository });

        const result = await useCase({ account });

        expect(result.success).toBe(true);
        expect(result.data.payload.data.memberships).toEqual([
            expect.objectContaining({
                tenant_id: 'tenant-1',
                role: 'admin',
                source: 'founder',
                company: expect.objectContaining({ name: 'Ada Foods' })
            })
        ]);
    });

    it('rejects invitation acceptance without a valid membership id', async () => {
        const useCase = buildAcceptDgfyInvitationUseCase({
            repository: {
                findMembershipById: jest.fn()
            }
        });

        const result = await useCase({
            account: createAccount(),
            membershipId: 'not-a-number'
        });

        expect(result.success).toBe(false);
        expect(result.error.message).toBe('Invitation id is required.');
    });
});
