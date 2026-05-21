import { jest } from '@jest/globals';
import {
    buildAcceptDgfyInvitationUseCase,
    buildChangeDgfyPasswordUseCase,
    buildCompleteDgfyPasswordResetUseCase,
    buildCreateDgfyHandoffUseCase,
    buildExchangeDgfyHandoffUseCase,
    buildGetDgfyMeUseCase,
    buildLoginDgfyAccountUseCase,
    buildRequestDgfyPasswordResetUseCase,
    buildRequestDgfyEmailVerificationUseCase,
    buildUpdateDgfyProfileUseCase,
    buildVerifyDgfyEmailUseCase,
    buildRegisterDgfyAccountUseCase
} from '../src/modules/dgfy/usecases/dgfyAuthUseCases.js';

const createAccount = (overrides = {}) => ({
    id: 'dgfy-1',
    first_name: 'Ada',
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
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation(async (payload) => createAccount(payload)),
            mirrorPendingInvitationsForAccount: jest.fn().mockResolvedValue([])
        };
        const useCase = buildRegisterDgfyAccountUseCase({
            repository,
            hashPassword: jest.fn().mockResolvedValue('hashed-password')
        });

        const result = await useCase({
            body: {
                first_name: 'Ada',
                last_name: 'Lovelace',
                email: 'ADA@EXAMPLE.TEST',
                phone: '+63 912 345 6789',
                password: 'password123',
                confirm_password: 'password123'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(201);
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
            first_name: 'Ada',
            last_name: 'Lovelace',
            username: 'Ada',
            email: 'ada@example.test',
            phone: '+63 912 345 6789'
        }));
        expect(result.data.payload.data.token).toBeTruthy();
        expect(repository.mirrorPendingInvitationsForAccount).toHaveBeenCalled();
    });

    it('logs in an active DGFY account', async () => {
        const account = createAccount();
        const repository = {
            findByEmail: jest.fn().mockResolvedValue(account),
            findById: jest.fn().mockResolvedValue(account),
            updateLastLogin: jest.fn().mockResolvedValue(null),
            mirrorPendingInvitationsForAccount: jest.fn().mockResolvedValue([])
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
                mirrorPendingInvitationsForAccount: jest.fn().mockResolvedValue([])
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
                last_name: 'Hopper',
                phone: '+639987654321'
            }
        });

        expect(result.success).toBe(true);
        expect(repository.updateProfile).toHaveBeenCalledWith(account, expect.objectContaining({
            first_name: 'Grace',
            last_name: 'Hopper',
            username: 'Grace',
            phone: '+639987654321',
            phone_verified_at: null
        }));
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
