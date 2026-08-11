import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import {
    buildAcceptDgfyInvitationUseCase,
    buildChangeDgfyPasswordUseCase,
    buildConfigureDgfyCompanyDayClosePinUseCase,
    buildCompleteDgfyPasswordResetUseCase,
    buildCreateDgfyInvitationUseCase,
    buildCreateDgfyHandoffUseCase,
    buildExchangeDgfyHandoffUseCase,
    buildGetDgfyMeUseCase,
    buildLeaveDgfyCompanyUseCase,
    buildListDgfyAccountCompaniesUseCase,
    buildLoginDgfyAccountUseCase,
    buildRequestDgfyBusinessStepUpUseCase,
    buildRequestDgfyPasswordResetUseCase,
    buildRequestDgfyEmailVerificationUseCase,
    buildRecordDgfyCompanySwitchOutcomeUseCase,
    buildRejectDgfyInvitationUseCase,
    buildSearchDgfyBusinessAccountsUseCase,
    buildStartDgfyPosSessionUseCase,
    buildStartDgfyTenantSessionUseCase,
    buildSwitchDgfyCompanyUseCase,
    buildTransferDgfyCompanyOwnershipUseCase,
    buildUpdateDgfyProfileUseCase,
    buildVerifyDgfyEmailUseCase,
    buildPreflightDgfyAccountRegistrationUseCase,
    buildRegisterDgfyAccountUseCase,
    generateDgfyToken
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

    describe('preflight DGFY account registration', () => {
        it('returns available when email and phone are unused', async () => {
            const repository = {
                findByEmail: jest.fn().mockResolvedValue(null),
                findByPhone: jest.fn().mockResolvedValue(null)
            };
            const useCase = buildPreflightDgfyAccountRegistrationUseCase({ repository });

            const result = await useCase({
                body: {
                    email: 'ADA@EXAMPLE.TEST',
                    phone: '+63 912 345 6789'
                }
            });

            expect(result.success).toBe(true);
            expect(result.data.payload).toMatchObject({
                success: true,
                data: { available: true },
                message: 'DGFY registration credentials are available.'
            });
            expect(repository.findByEmail).toHaveBeenCalledWith('ada@example.test');
            expect(repository.findByPhone).toHaveBeenCalledWith('+63 912 345 6789');
        });

        it('rejects duplicate email before checking phone', async () => {
            const repository = {
                findByEmail: jest.fn().mockResolvedValue(createAccount()),
                findByPhone: jest.fn()
            };
            const useCase = buildPreflightDgfyAccountRegistrationUseCase({ repository });

            const result = await useCase({
                body: {
                    email: 'ada@example.test',
                    phone: '+63 912 345 6789'
                }
            });

            expect(result.success).toBe(false);
            expect(result.error.statusCode).toBe(409);
            expect(result.error.message).toBe('A DGFY account already exists with this email.');
            expect(result.error.details).toEqual({
                error_code: 'DGFY_ACCOUNT_ALREADY_EXISTS',
                field: 'email'
            });
            expect(repository.findByPhone).not.toHaveBeenCalled();
        });

        it('rejects duplicate phone when email is unused', async () => {
            const repository = {
                findByEmail: jest.fn().mockResolvedValue(null),
                findByPhone: jest.fn().mockResolvedValue(createAccount({ id: 'dgfy-phone' }))
            };
            const useCase = buildPreflightDgfyAccountRegistrationUseCase({ repository });

            const result = await useCase({
                body: {
                    email: 'new@example.test',
                    phone: '+63 912 345 6789'
                }
            });

            expect(result.success).toBe(false);
            expect(result.error.statusCode).toBe(409);
            expect(result.error.message).toBe('A DGFY account already exists with this phone number.');
            expect(result.error.details).toEqual({
                error_code: 'DGFY_ACCOUNT_ALREADY_EXISTS',
                field: 'phone'
            });
        });

        it('rejects invalid credentials without repository lookups', async () => {
            const repository = {
                findByEmail: jest.fn(),
                findByPhone: jest.fn()
            };
            const useCase = buildPreflightDgfyAccountRegistrationUseCase({ repository });

            const result = await useCase({
                body: {
                    email: 'not-an-email',
                    phone: '+63 912 345 6789'
                }
            });

            expect(result.success).toBe(false);
            expect(result.error.statusCode).toBe(400);
            expect(repository.findByEmail).not.toHaveBeenCalled();
            expect(repository.findByPhone).not.toHaveBeenCalled();
        });
    });

    it('mints unique normal DGFY session tokens for immediate re-login after logout', () => {
        const account = createAccount();

        const firstToken = generateDgfyToken(account);
        const secondToken = generateDgfyToken(account);
        const firstDecoded = jwt.decode(firstToken);
        const secondDecoded = jwt.decode(secondToken);

        expect(secondToken).not.toBe(firstToken);
        expect(firstDecoded).toMatchObject({
            token_scope: 'dgfy',
            dgfy_account_id: account.id,
            email: account.email
        });
        expect(secondDecoded).toMatchObject({
            token_scope: 'dgfy',
            dgfy_account_id: account.id,
            email: account.email
        });
        expect(firstDecoded.jti).toEqual(expect.any(String));
        expect(secondDecoded.jti).toEqual(expect.any(String));
        expect(secondDecoded.jti).not.toBe(firstDecoded.jti);
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
        expect(result.data.payload.data.expiresIn).toBe(24 * 60 * 60);
        expect(result.data.payload.data.rememberDevice).toBe(false);
        expect(jwt.decode(result.data.payload.data.token)).toMatchObject({
            session_persistence: 'standard'
        });
    });

    it('issues a 30-day DGFY session only for an explicit remembered-device login', async () => {
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
                password: 'password123',
                remember_device: true
            }
        });

        expect(result.data.payload.data.expiresIn).toBe(30 * 24 * 60 * 60);
        expect(result.data.payload.data.rememberDevice).toBe(true);
        expect(jwt.decode(result.data.payload.data.token)).toMatchObject({
            session_persistence: 'remembered_device'
        });
    });

    it('does not enable remembered-device login for truthy non-boolean input', async () => {
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
                password: 'password123',
                remember_device: 'true'
            }
        });

        expect(result.data.payload.data.expiresIn).toBe(24 * 60 * 60);
        expect(result.data.payload.data.rememberDevice).toBe(false);
        expect(jwt.decode(result.data.payload.data.token)).toMatchObject({
            session_persistence: 'standard'
        });
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

    it('requires POS access when a tenant session is requested for the POS route', async () => {
        const session = {
            token: 'tenant-pos-token',
            role: 'cashier',
            permissions: ['pos:view'],
            company: { id: 'tenant-1', token: 'token-tenant-1' }
        };
        const createTenantSessionForDgfyAccount = jest.fn().mockResolvedValue(session);
        const useCase = buildStartDgfyTenantSessionUseCase({ createTenantSessionForDgfyAccount });

        const result = await useCase({
            account: createAccount({ id: 'dgfy-pos-entry' }),
            body: { tenant_id: 'tenant-1', access_scope: 'pos' }
        });

        expect(result.success).toBe(true);
        expect(result.data.payload.data).toEqual(session);
    });

    it('fails closed when a POS-scoped tenant session lacks POS permission', async () => {
        const createTenantSessionForDgfyAccount = jest.fn().mockResolvedValue({
            token: 'tenant-no-pos-token',
            role: 'staff',
            permissions: ['items:view'],
            company: { id: 'tenant-1', token: 'token-tenant-1' }
        });
        const useCase = buildStartDgfyTenantSessionUseCase({ createTenantSessionForDgfyAccount });

        const result = await useCase({
            account: createAccount({ id: 'dgfy-no-pos-entry' }),
            body: { tenant_id: 'tenant-1', access_scope: 'pos' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.message).toBe('This DGFY account does not have POS access for the selected company.');
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
            listMemberships: jest.fn().mockResolvedValue(membershipRows),
            listRegistrationApplications: jest.fn().mockResolvedValue([{
                id: 'application-pending',
                review_status: 'pending',
                provisioning_status: 'not_started',
                updatedAt: new Date('2026-07-29T00:00:00.000Z'),
                tenant: { name: 'Company Awaiting Review' }
            }])
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

    it('lists only companies owned by or explicitly accepted for the signed-in DGFY account', async () => {
        const account = createAccount({ id: 'dgfy-user-b', email: 'cashier-b@example.test' });
        const membershipRows = [{
            id: 20,
            dgfy_account_id: account.id,
            tenant_id: 'company-b-owned',
            tenant_user_id: 20,
            role: 'admin',
            status: 'accepted',
            source: 'founder',
            tenant: {
                id: 'company-b-owned',
                name: 'B Owned Company',
                company_token: 'secret-b-owned',
                status: 'active',
                plan: 'premium',
                owner_dgfy_account_id: account.id
            }
        }, {
            id: 21,
            dgfy_account_id: account.id,
            tenant_id: 'company-1-invited',
            tenant_user_id: 21,
            role: 'cashier',
            status: 'accepted',
            source: 'invite',
            tenant: {
                id: 'company-1-invited',
                name: 'Company 1',
                company_token: 'secret-company-1',
                status: 'active',
                plan: 'standard',
                owner_dgfy_account_id: 'dgfy-user-a'
            }
        }, {
            id: 22,
            dgfy_account_id: account.id,
            tenant_id: 'company-2-pending',
            tenant_user_id: 22,
            role: 'cashier',
            status: 'pending',
            source: 'invite',
            tenant: {
                id: 'company-2-pending',
                name: 'Company 2 Pending',
                company_token: 'secret-company-2',
                status: 'active',
                plan: 'standard',
                owner_dgfy_account_id: 'dgfy-user-a'
            }
        }];
        const repository = {
            mirrorPendingInvitationsForAccount: jest.fn().mockResolvedValue([]),
            mirrorLegacyFounderMembershipsForAccount: jest.fn().mockResolvedValue([]),
            listMemberships: jest.fn().mockResolvedValue(membershipRows),
            listRegistrationApplications: jest.fn().mockResolvedValue([{
                id: 'application-pending',
                review_status: 'pending',
                provisioning_status: 'not_started',
                updatedAt: new Date('2026-07-29T00:00:00.000Z'),
                tenant: { name: 'Company Awaiting Review' }
            }])
        };
        const useCase = buildListDgfyAccountCompaniesUseCase({ repository });

        const result = await useCase({ account });

        expect(result.success).toBe(true);
        expect(repository.listMemberships).toHaveBeenCalledWith(account.id);
        expect(result.data.payload.data.owned_companies).toEqual([
            expect.objectContaining({
                tenant_id: 'company-b-owned',
                is_owner: true,
                can_switch: true
            })
        ]);
        expect(result.data.payload.data.invited_companies).toEqual([
            expect.objectContaining({
                tenant_id: 'company-1-invited',
                company_name: 'Company 1',
                is_owner: false,
                can_switch: true
            })
        ]);
        expect(result.data.payload.data.pending_invitations).toEqual([
            expect.objectContaining({
                tenant_id: 'company-2-pending',
                can_switch: false,
                requires_action: 'accept_invitation'
            })
        ]);
        expect(result.data.payload.data.registration_applications).toEqual([{
            application_id: 'application-pending',
            company_name: 'Company Awaiting Review',
            status: 'pending_review',
            status_path: '/register-company/status/application-pending',
            updated_at: new Date('2026-07-29T00:00:00.000Z')
        }]);
        expect(result.data.payload.data.companies.map((company) => company.tenant_id)).toEqual([
            'company-b-owned',
            'company-1-invited',
            'company-2-pending'
        ]);
        expect(JSON.stringify(result.data.payload.data)).not.toContain('secret-company-1');
        expect(JSON.stringify(result.data.payload.data)).not.toContain('secret-company-2');
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

    it('switches DGFY companies without sending or requiring a business email code', async () => {
        const account = createAccount();
        const membership = {
            id: 12,
            tenant_id: 'tenant-1',
            tenant_user_id: 31,
            role: 'cashier',
            role_preset_key: 'cashier',
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
            body: {},
            metadata: { request_id: 'req-switch' }
        });

        expect(result.success).toBe(true);
        expect(verifyEmailOtp).not.toHaveBeenCalled();
        expect(createTenantSessionForDgfyAccount).toHaveBeenCalledWith({
            account,
            tenantId: 'tenant-1'
        });
        expect(repository.updateMembershipLastSelected).toHaveBeenCalledWith(membership);
        expect(repository.createBusinessAuditLog).not.toHaveBeenCalled();
        expect(result.auditContext).toEqual(expect.objectContaining({
            account,
            membership,
            tenantId: 'tenant-1',
            evidence: expect.objectContaining({
                target_tenant_user_id: 31,
                target_role: 'cashier',
                target_role_preset_key: 'cashier'
            })
        }));
        expect(result.data.payload.data).toEqual(session);
    });

    it('records the final company-switch audit after session rotation', async () => {
        const account = createAccount();
        const membership = {
            id: 12,
            tenant_id: 'tenant-2',
            tenant_user_id: 32,
            role: 'cashier',
            role_preset_key: 'cashier',
            tenant: {
                id: 'tenant-2',
                name: 'Target Foods'
            }
        };
        const repository = {
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildRecordDgfyCompanySwitchOutcomeUseCase({ repository });

        const result = await useCase({
            account,
            membership,
            tenantId: 'tenant-2',
            result: 'success',
            metadata: {
                request_id: 'req-switch-final',
                ip_address: '127.0.0.1',
                user_agent: 'test-agent'
            },
            evidence: {
                current_tenant_id: 'tenant-1',
                current_tenant_user_id: 18,
                target_tenant_user_id: 32,
                target_role: 'cashier',
                target_role_preset_key: 'cashier',
                previous_session_revoked: true,
                new_session_issued: true,
                session_rotated: true
            }
        });

        expect(result.success).toBe(true);
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'company_switch_success',
            result: 'success',
            request_id: 'req-switch-final',
            dgfy_account_id: account.id,
            tenant_id: 'tenant-2',
            membership_id: 12,
            metadata: expect.objectContaining({
                actor_dgfy_account_id: account.id,
                tenant_user_id: 32,
                role: 'cashier',
                role_preset_key: 'cashier',
                current_tenant_id: 'tenant-1',
                current_tenant_user_id: 18,
                target_tenant_user_id: 32,
                previous_session_revoked: true,
                new_session_issued: true,
                session_rotated: true
            })
        }));
    });

    it('blocks a tenant operator from switching companies while they own an open shift', async () => {
        const account = createAccount();
        const membership = {
            id: 12,
            tenant_id: 'tenant-2',
            tenant: {
                id: 'tenant-2',
                name: 'Target Foods',
                company_token: 'target-token',
                status: 'active',
                plan: 'premium'
            }
        };
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            updateMembershipLastSelected: jest.fn(),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const createTenantSessionForDgfyAccount = jest.fn();
        const findOwnedOpenShift = jest.fn().mockResolvedValue({
            shift_id: 44,
            terminal_id: 'JOHN-01',
            location_id: 7,
            cashier_id: 18
        });
        const useCase = buildSwitchDgfyCompanyUseCase({
            repository,
            createTenantSessionForDgfyAccount,
            findOwnedOpenShift
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-2',
            currentTenantUserId: 18,
            currentTenantId: 'tenant-1',
            authSource: 'tenant_membership',
            metadata: { request_id: 'req-shift-block' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(result.error.message).toBe('Close your active shift before switching companies.');
        expect(result.error.details).toEqual({
            reason_code: 'ACTIVE_SHIFT_OWNED',
            current_tenant_id: 'tenant-1',
            shift_id: 44,
            terminal_id: 'JOHN-01',
            location_id: 7,
            cashier_id: 18
        });
        expect(findOwnedOpenShift).toHaveBeenCalledWith({
            tenantUserId: 18,
            tenantId: 'tenant-1'
        });
        expect(createTenantSessionForDgfyAccount).not.toHaveBeenCalled();
        expect(repository.updateMembershipLastSelected).not.toHaveBeenCalled();
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'company_switch_failed',
            result: 'failure',
            reason: 'Close your active shift before switching companies.',
            request_id: 'req-shift-block',
            metadata: expect.objectContaining({
                reason_code: 'ACTIVE_SHIFT_OWNED',
                current_tenant_id: 'tenant-1',
                current_tenant_user_id: 18,
                target_tenant_id: 'tenant-2',
                shift_id: 44,
                terminal_id: 'JOHN-01',
                session_rotated: false
            })
        }));
    });

    it('switches companies after confirming the current tenant user has no open shift', async () => {
        const account = createAccount();
        const membership = {
            id: 12,
            tenant_id: 'tenant-2',
            tenant: {
                id: 'tenant-2',
                name: 'Target Foods',
                company_token: 'target-token',
                status: 'active',
                plan: 'premium'
            }
        };
        const session = {
            token: 'tenant-access',
            refreshToken: 'tenant-refresh',
            company: { id: 'tenant-2', name: 'Target Foods', token: 'target-token' }
        };
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            updateMembershipLastSelected: jest.fn().mockResolvedValue(null),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const createTenantSessionForDgfyAccount = jest.fn().mockResolvedValue(session);
        const findOwnedOpenShift = jest.fn().mockResolvedValue(null);
        const useCase = buildSwitchDgfyCompanyUseCase({
            repository,
            createTenantSessionForDgfyAccount,
            findOwnedOpenShift
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-2',
            currentTenantUserId: 18,
            currentTenantId: 'tenant-1',
            authSource: 'tenant_membership'
        });

        expect(result.success).toBe(true);
        expect(findOwnedOpenShift).toHaveBeenCalledWith({
            tenantUserId: 18,
            tenantId: 'tenant-1'
        });
        expect(createTenantSessionForDgfyAccount).toHaveBeenCalledWith({
            account,
            tenantId: 'tenant-2'
        });
    });

    it('does not run the POS shift guard without an authenticated tenant operator context', async () => {
        const account = createAccount();
        const membership = {
            id: 12,
            tenant_id: 'tenant-2',
            tenant: {
                id: 'tenant-2',
                name: 'Target Foods',
                company_token: 'target-token',
                status: 'active',
                plan: 'premium'
            }
        };
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            updateMembershipLastSelected: jest.fn().mockResolvedValue(null),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const createTenantSessionForDgfyAccount = jest.fn().mockResolvedValue({
            token: 'tenant-access'
        });
        const findOwnedOpenShift = jest.fn();
        const useCase = buildSwitchDgfyCompanyUseCase({
            repository,
            createTenantSessionForDgfyAccount,
            findOwnedOpenShift
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-2',
            authSource: 'dgfy_account'
        });

        expect(result.success).toBe(true);
        expect(findOwnedOpenShift).not.toHaveBeenCalled();
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

    it('accepts a pending DGFY invitation without email step-up and does not return a company token', async () => {
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
        const verifyEmailOtp = jest.fn();
        const useCase = buildAcceptDgfyInvitationUseCase({
            repository,
            verifyEmailOtp
        });

        const result = await useCase({
            account,
            membershipId: '21',
            body: {}
        });

        expect(result.success).toBe(true);
        expect(verifyEmailOtp).not.toHaveBeenCalled();
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
        expect(updatePassword).toHaveBeenCalledWith(account, 'hashed-new-password', {
            temporary_password_active: false
        });
    });

    it('configures a company Day Close PIN after validating the global DGFY password', async () => {
        const account = createAccount({ id: 'dgfy-cashier-1', password_hash: 'global-account-hash' });
        const comparePassword = jest.fn().mockResolvedValue(true);
        const configureTenantDayClosePinForDgfyAccount = jest.fn().mockResolvedValue({
            user_id: 17,
            email: account.email,
            pos_day_close_pin_configured: true
        });
        const useCase = buildConfigureDgfyCompanyDayClosePinUseCase({
            comparePassword,
            configureTenantDayClosePinForDgfyAccount
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-laundry',
            body: { current_password: 'global-password', pin: '1234' }
        });

        expect(result.success).toBe(true);
        expect(comparePassword).toHaveBeenCalledWith('global-password', 'global-account-hash');
        expect(configureTenantDayClosePinForDgfyAccount).toHaveBeenCalledWith({
            account,
            tenantId: 'tenant-laundry',
            pin: '1234'
        });
        expect(result.data.payload.data.pos_day_close_pin_configured).toBe(true);
    });

    it('rejects an incorrect global DGFY password before opening tenant context', async () => {
        const comparePassword = jest.fn().mockResolvedValue(false);
        const configureTenantDayClosePinForDgfyAccount = jest.fn();
        const useCase = buildConfigureDgfyCompanyDayClosePinUseCase({
            comparePassword,
            configureTenantDayClosePinForDgfyAccount
        });

        const result = await useCase({
            account: createAccount({ password_hash: 'global-account-hash' }),
            tenantId: 'tenant-laundry',
            body: { current_password: 'incorrect-password', pin: '1234' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(401);
        expect(result.error.message).toBe('Current DGFY account password is incorrect.');
        expect(configureTenantDayClosePinForDgfyAccount).not.toHaveBeenCalled();
    });

    it('rejects an invalid Day Close PIN before checking any credential', async () => {
        const comparePassword = jest.fn();
        const configureTenantDayClosePinForDgfyAccount = jest.fn();
        const useCase = buildConfigureDgfyCompanyDayClosePinUseCase({
            comparePassword,
            configureTenantDayClosePinForDgfyAccount
        });

        const result = await useCase({
            account: createAccount(),
            tenantId: 'tenant-laundry',
            body: { current_password: 'global-password', pin: '12ab' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(comparePassword).not.toHaveBeenCalled();
        expect(configureTenantDayClosePinForDgfyAccount).not.toHaveBeenCalled();
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
        expect(updatePassword).toHaveBeenCalledWith(account, 'hashed-reset-password', {
            temporary_password_active: false
        });
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

    it('rejects short DGFY account search queries before repository lookup', async () => {
        const repository = {
            searchActiveAccounts: jest.fn()
        };
        const useCase = buildSearchDgfyBusinessAccountsUseCase({ repository });

        const result = await useCase({ query: 'a', tenantId: 'tenant-1' });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.message).toBe('Search requires at least 2 characters.');
        expect(repository.searchActiveAccounts).not.toHaveBeenCalled();
    });

    it('returns safe active DGFY account search results with membership state', async () => {
        const accounts = [{
            dgfy_account_id: 'dgfy-new',
            display_name: 'Ada Lovelace',
            email: 'ada@example.test',
            masked_phone: '+63******6789',
            account_status: 'active',
            membership_status: null,
            already_connected: false
        }, {
            dgfy_account_id: 'dgfy-pending',
            display_name: 'Grace Hopper',
            email: 'grace@example.test',
            masked_phone: '+63******1111',
            account_status: 'active',
            membership_status: 'pending',
            already_connected: true
        }];
        const repository = {
            searchActiveAccounts: jest.fn().mockResolvedValue(accounts)
        };
        const useCase = buildSearchDgfyBusinessAccountsUseCase({ repository });

        const result = await useCase({ query: ' ADA ', tenantId: 'tenant-1' });

        expect(result.success).toBe(true);
        expect(repository.searchActiveAccounts).toHaveBeenCalledWith('ADA', { tenantId: 'tenant-1' });
        expect(result.data.payload.data.accounts).toEqual(accounts);
        expect(JSON.stringify(result.data.payload)).not.toContain('company_token');
    });

    it('creates a DGFY invitation and reports successful email delivery plus account visibility', async () => {
        const account = createAccount();
        const membership = {
            id: 91,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-1',
            tenant_user_id: 7,
            role: 'staff',
            status: 'pending',
            source: 'invite',
            tenant: {
                id: 'tenant-1',
                name: 'Ada Foods',
                status: 'active'
            }
        };
        const repository = {
            createInvitationForDgfyAccount: jest.fn().mockResolvedValue({ account, membership }),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const sendEmail = jest.fn().mockResolvedValue(null);
        const useCase = buildCreateDgfyInvitationUseCase({ repository, sendEmail });

        const result = await useCase({
            tenant: { id: 'tenant-1', company_token: 'secret-token', name: 'Ada Foods' },
            adminUser: { user_id: 1, username: 'Admin', is_master_admin: true },
            body: { dgfy_account_id: account.id, role: 'staff' },
            metadata: { request_id: 'req-invite-created' }
        });

        expect(result.success).toBe(true);
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
            to: account.email,
            subject: 'Invitation to join Ada Foods on DGFY',
            text: expect.stringContaining('open My Account > Business')
        }));
        expect(result.data.payload.data.email_sent).toBe(true);
        expect(result.data.payload.data.delivery_error).toBeNull();
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'invitation_created',
            result: 'success',
            request_id: 'req-invite-created'
        }));
        expect(JSON.stringify(result.data.payload)).not.toContain('secret-token');
    });

    it('creates the DGFY invitation even when email delivery fails and returns delivery diagnostics', async () => {
        const account = createAccount();
        const membership = {
            id: 92,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-1',
            tenant_user_id: 8,
            role: 'staff',
            status: 'pending',
            source: 'invite',
            tenant: {
                id: 'tenant-1',
                name: 'Ada Foods',
                status: 'active'
            }
        };
        const repository = {
            createInvitationForDgfyAccount: jest.fn().mockResolvedValue({ account, membership }),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const sendEmail = jest.fn().mockRejectedValue(new Error('SMTP unavailable'));
        const useCase = buildCreateDgfyInvitationUseCase({ repository, sendEmail });

        const result = await useCase({
            tenant: { id: 'tenant-1', company_token: 'secret-token', name: 'Ada Foods' },
            adminUser: { user_id: 1, username: 'Admin', is_master_admin: true },
            body: { dgfy_account_id: account.id, role: 'staff' },
            metadata: { request_id: 'req-invite-email-failed' }
        });

        expect(result.success).toBe(true);
        expect(result.data.payload.data.email_sent).toBe(false);
        expect(result.data.payload.data.delivery_error).toBe('SMTP unavailable');
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'invitation_created',
            result: 'success',
            request_id: 'req-invite-email-failed'
        }));
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

    it('loads tenant db_name before accepting a DGFY invitation', async () => {
        const account = createAccount({ id: 'dgfy-accept-db' });
        const membership = {
            id: 38,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-accept',
            tenant_user_id: 2,
            role: 'cashier',
            status: 'pending',
            source: 'invite',
            tenant: {
                id: 'tenant-accept',
                name: 'Kusina & Café',
                status: 'active',
                plan: 'premium',
                db_name: 'sku_tenant_kusinacaf_9277ba56'
            }
        };
        const repository = {
            findMembershipById: jest.fn().mockResolvedValue(membership),
            acceptInvitationMembership: jest.fn().mockResolvedValue({
                ...membership,
                status: 'accepted',
                accepted_at: new Date('2026-07-03T08:00:00Z')
            }),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildAcceptDgfyInvitationUseCase({ repository });

        const result = await useCase({
            account,
            membershipId: 38,
            metadata: { request_id: 'req-accept-db-name' }
        });

        expect(result.success).toBe(true);
        expect(repository.findMembershipById).toHaveBeenCalledWith(38, {
            include: [{
                association: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'db_name']
            }]
        });
        expect(repository.acceptInvitationMembership).toHaveBeenCalledWith({ membership, account });
    });

    it('loads tenant db_name before rejecting a DGFY invitation', async () => {
        const account = createAccount({ id: 'dgfy-reject-db' });
        const membership = {
            id: 39,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-reject',
            tenant_user_id: 3,
            role: 'cashier',
            status: 'pending',
            source: 'invite',
            tenant: {
                id: 'tenant-reject',
                name: 'Eatery ni Doe',
                status: 'active',
                plan: 'premium',
                db_name: 'sku_tenant_eaterynidoe_2e561dbb',
                owner_dgfy_account_id: 'owner-dgfy'
            }
        };
        const repository = {
            findMembershipById: jest.fn().mockResolvedValue(membership),
            declineInvitationMembership: jest.fn().mockResolvedValue({
                ...membership,
                status: 'declined'
            }),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildRejectDgfyInvitationUseCase({ repository });

        const result = await useCase({
            account,
            membershipId: 39,
            metadata: { request_id: 'req-reject-db-name' }
        });

        expect(result.success).toBe(true);
        expect(repository.findMembershipById).toHaveBeenCalledWith(39, {
            include: [{
                association: 'tenant',
                attributes: ['id', 'name', 'company_token', 'status', 'plan', 'db_name', 'owner_dgfy_account_id']
            }]
        });
        expect(repository.declineInvitationMembership).toHaveBeenCalledWith({ membership });
    });

    it('starts a DGFY POS session with membership and terminal audit evidence', async () => {
        const account = createAccount({ id: 'dgfy-pos-1' });
        const membership = {
            id: 51,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-pos',
            tenant_user_id: 8,
            status: 'accepted',
            source: 'invite',
            tenant: {
                id: 'tenant-pos',
                name: 'POS Foods',
                status: 'active'
            }
        };
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const createTenantSessionForDgfyAccount = jest.fn().mockResolvedValue({
            user_id: 8,
            role: 'cashier',
            permissions: ['pos:view'],
            company: { id: 'tenant-pos', token: 'secret-pos-token' }
        });
        const validateTerminalPolicy = jest.fn().mockResolvedValue({
            terminal_id: 'COUNTER-01',
            reason_code: 'ALLOWED'
        });
        const useCase = buildStartDgfyPosSessionUseCase({
            createTenantSessionForDgfyAccount,
            repository,
            validateTerminalPolicy
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-pos',
            body: { terminal_id: 'counter-01' },
            metadata: { request_id: 'req-pos-unlock' }
        });

        expect(result.success).toBe(true);
        expect(repository.findMembershipForAccount).toHaveBeenCalledWith({
            dgfyAccountId: account.id,
            tenantId: 'tenant-pos',
            status: 'accepted'
        });
        expect(createTenantSessionForDgfyAccount).toHaveBeenCalledWith({
            account,
            tenantId: 'tenant-pos'
        });
        expect(validateTerminalPolicy).toHaveBeenCalledWith({
            tenantId: 'tenant-pos',
            terminalId: 'COUNTER-01',
            tenantUserId: 8,
            userRole: 'cashier',
            isMasterAdmin: false,
            permissions: ['pos:view']
        });
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'pos_unlock_attempted',
            result: 'success',
            request_id: 'req-pos-unlock'
        }));
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'pos_unlock_success',
            result: 'success',
            request_id: 'req-pos-unlock'
        }));
        expect(result.data.payload.data.pos.terminal_identity_policy.reason_code).toBe('ALLOWED');
    });

    it('fails POS session start when terminal policy validation fails', async () => {
        const account = createAccount({ id: 'dgfy-pos-3' });
        const membership = {
            id: 53,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-pos',
            status: 'accepted',
            tenant: {
                id: 'tenant-pos',
                name: 'POS Foods',
                status: 'active'
            }
        };
        const terminalError = Object.assign(new Error('Terminal is not assigned to a store.'), {
            statusCode: 401,
            code: 'AUTHENTICATION_FAILED',
            details: {
                terminal_identity_policy: {
                    terminal_id: 'COUNTER-01',
                    reason_code: 'TERMINAL_LOCATION_REQUIRED'
                }
            }
        });
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildStartDgfyPosSessionUseCase({
            repository,
            createTenantSessionForDgfyAccount: jest.fn().mockResolvedValue({
                role: 'cashier',
                permissions: ['pos:view'],
                company: { id: 'tenant-pos', token: 'secret-pos-token' }
            }),
            validateTerminalPolicy: jest.fn().mockRejectedValue(terminalError)
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-pos',
            body: { terminal_id: 'COUNTER-01' },
            metadata: { request_id: 'req-pos-password-fail' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(401);
        expect(result.error.message).toBe('Terminal is not assigned to a store.');
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'pos_unlock_failed',
            result: 'failure',
            request_id: 'req-pos-password-fail'
        }));
    });

    it('audits DGFY POS session failure when POS permission is missing', async () => {
        const account = createAccount({ id: 'dgfy-pos-2' });
        const membership = {
            id: 52,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-pos',
            status: 'accepted',
            tenant: {
                id: 'tenant-pos',
                name: 'POS Foods',
                status: 'active'
            }
        };
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildStartDgfyPosSessionUseCase({
            repository,
            createTenantSessionForDgfyAccount: jest.fn().mockResolvedValue({
                role: 'cashier',
                permissions: ['items:view'],
                company: { id: 'tenant-pos', token: 'secret-pos-token' }
            }),
            validateTerminalPolicy: jest.fn()
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-pos',
            body: { terminal_id: 'COUNTER-01' },
            metadata: { request_id: 'req-pos-denied' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'pos_unlock_failed',
            result: 'failure',
            reason: 'This DGFY account does not have POS access for the selected company.',
            request_id: 'req-pos-denied'
        }));
    });

    it('allows an active company admin with POS permission to start a POS session', async () => {
        const account = createAccount({ id: 'dgfy-pos-admin' });
        const membership = {
            id: 54,
            tenant_id: 'tenant-pos',
            tenant_user_id: 9,
            status: 'accepted',
            tenant: { id: 'tenant-pos', status: 'active' }
        };
        const validateTerminalPolicy = jest.fn().mockResolvedValue({
            terminal_id: 'COUNTER-01',
            reason_code: 'ALLOWED'
        });
        const useCase = buildStartDgfyPosSessionUseCase({
            repository: {
                findMembershipForAccount: jest.fn().mockResolvedValue(membership),
                createBusinessAuditLog: jest.fn().mockResolvedValue(null)
            },
            createTenantSessionForDgfyAccount: jest.fn().mockResolvedValue({
                user_id: 9,
                role: 'admin',
                permissions: ['pos:transact'],
                company: { id: 'tenant-pos', token: 'secret-pos-token' }
            }),
            validateTerminalPolicy
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-pos',
            body: { terminal_id: 'counter-01' }
        });

        expect(result.success).toBe(true);
        expect(validateTerminalPolicy).toHaveBeenCalledWith(expect.objectContaining({
            tenantUserId: 9,
            userRole: 'admin',
            permissions: ['pos:transact']
        }));
    });

    it('allows a cashier membership backed by a master-admin tenant session', async () => {
        const account = createAccount({ id: 'dgfy-pos-dual-role' });
        const validateTerminalPolicy = jest.fn().mockResolvedValue({
            terminal_id: 'COUNTER-01',
            reason_code: 'ALLOWED'
        });
        const useCase = buildStartDgfyPosSessionUseCase({
            repository: {
                findMembershipForAccount: jest.fn().mockResolvedValue({
                    id: 55,
                    tenant_id: 'tenant-pos',
                    tenant_user_id: 10,
                    role: 'cashier',
                    status: 'accepted',
                    tenant: { id: 'tenant-pos', status: 'active' }
                }),
                createBusinessAuditLog: jest.fn().mockResolvedValue(null)
            },
            createTenantSessionForDgfyAccount: jest.fn().mockResolvedValue({
                user_id: 10,
                role: 'cashier',
                is_master_admin: true,
                permissions: ['pos:view', 'pos:transact'],
                company: { id: 'tenant-pos', token: 'secret-pos-token' }
            }),
            validateTerminalPolicy
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-pos',
            body: { terminal_id: 'COUNTER-01' }
        });

        expect(result.success).toBe(true);
        expect(validateTerminalPolicy).toHaveBeenCalledWith(expect.objectContaining({
            userRole: 'cashier',
            isMasterAdmin: true
        }));
    });

    it('rejects a POS permission when the authoritative tenant role is not Cashier or Admin', async () => {
        const account = createAccount({ id: 'dgfy-pos-wrong-role' });
        const validateTerminalPolicy = jest.fn();
        const useCase = buildStartDgfyPosSessionUseCase({
            repository: {
                findMembershipForAccount: jest.fn().mockResolvedValue({
                    id: 56,
                    tenant_id: 'tenant-pos',
                    tenant_user_id: 11,
                    status: 'accepted',
                    tenant: { id: 'tenant-pos', status: 'active' }
                }),
                createBusinessAuditLog: jest.fn().mockResolvedValue(null)
            },
            createTenantSessionForDgfyAccount: jest.fn().mockResolvedValue({
                user_id: 11,
                role: 'staff',
                permissions: ['pos:view'],
                company: { id: 'tenant-pos', token: 'secret-pos-token' }
            }),
            validateTerminalPolicy
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-pos',
            body: { terminal_id: 'COUNTER-01' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.message).toBe('An active Cashier or Admin role is required for POS access in the selected company.');
        expect(validateTerminalPolicy).not.toHaveBeenCalled();
    });

    it('rejects POS access for a company without an accepted active membership', async () => {
        const account = createAccount({ id: 'dgfy-pos-wrong-company' });
        const createTenantSessionForDgfyAccount = jest.fn();
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(null),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildStartDgfyPosSessionUseCase({
            repository,
            createTenantSessionForDgfyAccount,
            validateTerminalPolicy: jest.fn()
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-not-assigned',
            body: { terminal_id: 'COUNTER-01' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(createTenantSessionForDgfyAccount).not.toHaveBeenCalled();
        expect(repository.findMembershipForAccount).toHaveBeenCalledWith({
            dgfyAccountId: account.id,
            tenantId: 'tenant-not-assigned',
            status: 'accepted'
        });
    });

    it('rejects POS access when the selected company membership is inactive', async () => {
        const account = createAccount({ id: 'dgfy-pos-inactive-membership' });
        const createTenantSessionForDgfyAccount = jest.fn();
        const useCase = buildStartDgfyPosSessionUseCase({
            repository: {
                findMembershipForAccount: jest.fn().mockResolvedValue({
                    id: 57,
                    tenant_id: 'tenant-pos',
                    status: 'inactive',
                    tenant: { id: 'tenant-pos', status: 'active' }
                }),
                createBusinessAuditLog: jest.fn().mockResolvedValue(null)
            },
            createTenantSessionForDgfyAccount,
            validateTerminalPolicy: jest.fn()
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-pos',
            body: { terminal_id: 'COUNTER-01' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(createTenantSessionForDgfyAccount).not.toHaveBeenCalled();
    });

    it('rejects a tenant session that resolves to a different company', async () => {
        const account = createAccount({ id: 'dgfy-pos-session-company-mismatch' });
        const validateTerminalPolicy = jest.fn();
        const useCase = buildStartDgfyPosSessionUseCase({
            repository: {
                findMembershipForAccount: jest.fn().mockResolvedValue({
                    id: 58,
                    tenant_id: 'tenant-pos',
                    tenant_user_id: 12,
                    status: 'accepted',
                    tenant: { id: 'tenant-pos', status: 'active' }
                }),
                createBusinessAuditLog: jest.fn().mockResolvedValue(null)
            },
            createTenantSessionForDgfyAccount: jest.fn().mockResolvedValue({
                user_id: 12,
                role: 'cashier',
                permissions: ['pos:view'],
                company: { id: 'another-tenant', token: 'wrong-company-token' }
            }),
            validateTerminalPolicy
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-pos',
            body: { terminal_id: 'COUNTER-01' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.message).toBe('The authenticated tenant session does not match the selected company.');
        expect(validateTerminalPolicy).not.toHaveBeenCalled();
    });

    it('transfers ownership only from the current owner to an accepted member', async () => {
        const account = createAccount({ id: 'owner-dgfy' });
        const membership = {
            id: 71,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-own',
            status: 'accepted',
            source: 'founder',
            tenant: {
                id: 'tenant-own',
                owner_dgfy_account_id: account.id,
                status: 'active'
            }
        };
        const targetMembership = {
            id: 72,
            dgfy_account_id: 'target-dgfy',
            tenant_id: 'tenant-own',
            status: 'accepted'
        };
        const repository = {
            findMembershipForAccount: jest.fn()
                .mockResolvedValueOnce(membership)
                .mockResolvedValueOnce(targetMembership),
            transferTenantOwnership: jest.fn().mockResolvedValue(null),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null),
            markBusinessStepUpVerified: jest.fn().mockResolvedValue(null)
        };
        const verifyEmailOtp = jest.fn().mockResolvedValue({ verified: true });
        const useCase = buildTransferDgfyCompanyOwnershipUseCase({
            repository,
            verifyEmailOtp
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-own',
            body: {
                target_dgfy_account_id: 'target-dgfy',
                email_otp_code: '123456'
            },
            metadata: { request_id: 'req-transfer' }
        });

        expect(result.success).toBe(true);
        expect(verifyEmailOtp).toHaveBeenCalledWith(expect.objectContaining({
            purpose: 'dgfy_business_step_up',
            email: account.email,
            code: '123456'
        }));
        expect(repository.transferTenantOwnership).toHaveBeenCalledWith({
            tenant: membership.tenant,
            fromAccountId: account.id,
            toAccountId: 'target-dgfy'
        });
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'ownership_transfer_success',
            result: 'success',
            request_id: 'req-transfer'
        }));
    });

    it('blocks ownership transfer to a non-accepted target and audits the failure', async () => {
        const account = createAccount({ id: 'owner-dgfy' });
        const membership = {
            id: 81,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-own',
            status: 'accepted',
            source: 'founder',
            tenant: {
                id: 'tenant-own',
                owner_dgfy_account_id: account.id,
                status: 'active'
            }
        };
        const repository = {
            findMembershipForAccount: jest.fn()
                .mockResolvedValueOnce(membership)
                .mockResolvedValueOnce(null),
            transferTenantOwnership: jest.fn(),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildTransferDgfyCompanyOwnershipUseCase({
            repository,
            verifyEmailOtp: jest.fn()
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-own',
            body: {
                target_dgfy_account_id: 'pending-dgfy',
                email_otp_code: '123456'
            },
            metadata: { request_id: 'req-transfer-fail' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(repository.transferTenantOwnership).not.toHaveBeenCalled();
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'ownership_transfer_failed',
            result: 'failure',
            reason: 'Ownership can only be transferred to an accepted company member.',
            request_id: 'req-transfer-fail'
        }));
    });

    it('does not treat a transferred previous founder as owner when tenant owner has changed', async () => {
        const account = createAccount({ id: 'previous-owner-dgfy' });
        const repository = {
            mirrorPendingInvitationsForAccount: jest.fn().mockResolvedValue([]),
            mirrorLegacyFounderMembershipsForAccount: jest.fn().mockResolvedValue([]),
            listMemberships: jest.fn().mockResolvedValue([{
                id: 91,
                dgfy_account_id: account.id,
                tenant_id: 'tenant-transferred',
                tenant_user_id: 12,
                role: 'admin',
                status: 'accepted',
                source: 'founder',
                tenant: {
                    id: 'tenant-transferred',
                    name: 'Transferred Foods',
                    company_token: 'secret-transferred-token',
                    status: 'active',
                    plan: 'premium',
                    owner_dgfy_account_id: 'new-owner-dgfy'
                }
            }])
        };
        const useCase = buildListDgfyAccountCompaniesUseCase({ repository });

        const result = await useCase({ account });

        expect(result.success).toBe(true);
        expect(result.data.payload.data.owned_companies).toEqual([]);
        expect(result.data.payload.data.invited_companies).toEqual([
            expect.objectContaining({
                tenant_id: 'tenant-transferred',
                is_owner: false,
                ownership: 'member',
                can_leave: true,
                can_transfer_ownership: false,
                group: 'invited'
            })
        ]);
        expect(JSON.stringify(result.data.payload.data)).not.toContain('secret-transferred-token');
    });

    it('blocks company leave for the current owner before repository mutation', async () => {
        const account = createAccount({ id: 'owner-dgfy' });
        const membership = {
            id: 92,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-own',
            status: 'accepted',
            source: 'founder',
            tenant: {
                id: 'tenant-own',
                name: 'Owner Foods',
                status: 'active',
                owner_dgfy_account_id: account.id
            }
        };
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            leaveMembership: jest.fn(),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildLeaveDgfyCompanyUseCase({ repository });

        const result = await useCase({
            account,
            tenantId: 'tenant-own',
            metadata: { request_id: 'req-owner-leave' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(repository.leaveMembership).not.toHaveBeenCalled();
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'company_leave_failed',
            result: 'failure',
            reason: 'Company owners must transfer ownership before leaving.',
            request_id: 'req-owner-leave'
        }));
    });

    it('allows a transferred former founder member to leave after ownership moved', async () => {
        const account = createAccount({ id: 'previous-owner-dgfy' });
        const membership = {
            id: 93,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-own',
            status: 'accepted',
            source: 'founder',
            tenant: {
                id: 'tenant-own',
                name: 'Owner Foods',
                status: 'active',
                owner_dgfy_account_id: 'new-owner-dgfy'
            }
        };
        const removedMembership = { ...membership, status: 'removed' };
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            leaveMembership: jest.fn().mockResolvedValue(removedMembership),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildLeaveDgfyCompanyUseCase({ repository });

        const result = await useCase({
            account,
            tenantId: 'tenant-own',
            metadata: { request_id: 'req-former-owner-leave' }
        });

        expect(result.success).toBe(true);
        expect(repository.leaveMembership).toHaveBeenCalledWith({ membership });
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'company_leave_success',
            result: 'success',
            request_id: 'req-former-owner-leave'
        }));
    });

    it('audits invitation acceptance failure when membership activation fails', async () => {
        const account = createAccount();
        const membership = {
            id: 94,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-1',
            tenant_user_id: 6,
            role: 'staff',
            status: 'pending',
            source: 'invite',
            tenant: {
                id: 'tenant-1',
                name: 'Replay Foods',
                company_token: 'secret-replay-token',
                status: 'active',
                plan: 'premium'
            }
        };
        const repository = {
            findMembershipById: jest.fn().mockResolvedValue(membership),
            acceptInvitationMembership: jest.fn().mockRejectedValue(new Error('Tenant activation failed.')),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null),
            markBusinessStepUpVerified: jest.fn()
        };
        const verifyEmailOtp = jest.fn();
        const useCase = buildAcceptDgfyInvitationUseCase({ repository, verifyEmailOtp });

        const result = await useCase({
            account,
            membershipId: '94',
            body: {},
            metadata: { request_id: 'req-invite-replay' }
        });

        expect(result.success).toBe(false);
        expect(verifyEmailOtp).not.toHaveBeenCalled();
        expect(repository.acceptInvitationMembership).toHaveBeenCalledWith({ membership, account });
        expect(repository.markBusinessStepUpVerified).not.toHaveBeenCalled();
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'invitation_accept_failed',
            result: 'failure',
            reason: 'Tenant activation failed.',
            request_id: 'req-invite-replay'
        }));
        expect(JSON.stringify(result)).not.toContain('secret-replay-token');
    });

    it('audits DGFY POS terminal registry denial separately from authentication', async () => {
        const account = createAccount({ id: 'dgfy-pos-terminal-denied' });
        const membership = {
            id: 95,
            dgfy_account_id: account.id,
            tenant_id: 'tenant-pos',
            tenant_user_id: 8,
            status: 'accepted',
            tenant: {
                id: 'tenant-pos',
                name: 'POS Foods',
                status: 'active'
            }
        };
        const terminalError = Object.assign(new Error('terminal_id "COUNTER-99" is not an active registry terminal.'), {
            statusCode: 422,
            details: {
                terminal_identity_policy: {
                    reason_code: 'TERMINAL_NOT_REGISTERED'
                }
            }
        });
        const repository = {
            findMembershipForAccount: jest.fn().mockResolvedValue(membership),
            createBusinessAuditLog: jest.fn().mockResolvedValue(null)
        };
        const validateTerminalPolicy = jest.fn().mockRejectedValue(terminalError);
        const useCase = buildStartDgfyPosSessionUseCase({
            repository,
            createTenantSessionForDgfyAccount: jest.fn().mockResolvedValue({
                user_id: 8,
                role: 'cashier',
                is_master_admin: false,
                permissions: ['pos:view'],
                company: { id: 'tenant-pos', token: 'secret-pos-token' }
            }),
            validateTerminalPolicy
        });

        const result = await useCase({
            account,
            tenantId: 'tenant-pos',
            body: { terminal_id: 'counter-99' },
            metadata: { request_id: 'req-pos-terminal-denied' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(validateTerminalPolicy).toHaveBeenCalledWith({
            tenantId: 'tenant-pos',
            terminalId: 'COUNTER-99',
            tenantUserId: 8,
            userRole: 'cashier',
            isMasterAdmin: false,
            permissions: ['pos:view']
        });
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'pos_unlock_attempted',
            result: 'success',
            request_id: 'req-pos-terminal-denied'
        }));
        expect(repository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'pos_unlock_failed',
            result: 'failure',
            reason: 'terminal_id "COUNTER-99" is not an active registry terminal.',
            request_id: 'req-pos-terminal-denied',
            metadata: expect.objectContaining({
                terminal_id: 'COUNTER-99',
                reason_code: 'TERMINAL_NOT_REGISTERED'
            })
        }));
    });
});
