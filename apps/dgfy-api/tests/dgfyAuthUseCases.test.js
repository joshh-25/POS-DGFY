import { jest } from '@jest/globals';
import {
    buildPreflightDgfyAccountRegistrationUseCase,
    buildRegisterDgfyAccountUseCase,
    buildLoginDgfyAccountUseCase,
    buildGetDgfyMeUseCase,
    buildUpdateDgfyProfileUseCase,
    buildChangeDgfyPasswordUseCase,
    buildRequestDgfyEmailVerificationUseCase,
    buildVerifyDgfyEmailUseCase,
    buildRequestDgfyPasswordResetUseCase,
    buildCompleteDgfyPasswordResetUseCase,
    buildCreateDgfyHandoffUseCase,
    buildExchangeDgfyHandoffUseCase
} from '../src/modules/dgfyAuth/usecases/dgfyAuthUseCases.js';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/dgfyAuth/utils/dgfyLegalTerms.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const validLegalAckBody = () => ({
    accepted_terms: true,
    terms_version: DGFY_LEGAL_TERM_VERSIONS.accountTerms,
    privacy_version: DGFY_LEGAL_TERM_VERSIONS.privacy,
    marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
});

const makeAccount = (overrides = {}) => ({
    id: 'acct-1',
    first_name: 'Jane',
    last_name: 'Doe',
    username: 'Jane',
    email: 'jane@example.com',
    phone: '+639171234567',
    password_hash: 'hashed',
    is_active: true,
    email_verified_at: null,
    ...overrides
});

describe('buildPreflightDgfyAccountRegistrationUseCase', () => {
    it('reports available when no conflicts exist', async () => {
        const repository = { findByEmail: jest.fn().mockResolvedValue(null), findByPhone: jest.fn().mockResolvedValue(null) };
        const useCase = buildPreflightDgfyAccountRegistrationUseCase({ repository });
        const result = await useCase({ body: { email: 'jane@example.com', phone: '+639171234567' } });
        expect(result.success).toBe(true);
        expect(result.data.payload.data.available).toBe(true);
    });

    it('fails with 409 on email conflict', async () => {
        const repository = { findByEmail: jest.fn().mockResolvedValue(makeAccount()), findByPhone: jest.fn() };
        const useCase = buildPreflightDgfyAccountRegistrationUseCase({ repository });
        const result = await useCase({ body: { email: 'jane@example.com', phone: '+639171234567' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
    });
});

describe('buildRegisterDgfyAccountUseCase', () => {
    const baseRepository = () => ({
        findByEmail: jest.fn().mockResolvedValue(null),
        findByPhone: jest.fn().mockResolvedValue(null),
        transaction: jest.fn(async (cb) => cb('txn')),
        create: jest.fn().mockResolvedValue(makeAccount()),
        recordLegalAcknowledgement: jest.fn().mockResolvedValue({})
    });

    it('registers successfully when OTP and legal ack are valid', async () => {
        const repository = baseRepository();
        const useCase = buildRegisterDgfyAccountUseCase({
            repository,
            hashPassword: jest.fn().mockResolvedValue('hashed'),
            verifyEmailOtp: jest.fn().mockResolvedValue({ verified: true })
        });

        const result = await useCase({
            body: {
                first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', phone: '+639171234567',
                password: 'password123', email_otp_code: '123456', ...validLegalAckBody()
            },
            metadata: { ip_address: '127.0.0.1' }
        });

        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(201);
        expect(result.data.payload.data.token).toEqual(expect.any(String));
    });

    it('rejects invalid or expired OTP', async () => {
        const repository = baseRepository();
        const verifyEmailOtp = jest.fn().mockRejectedValue(new Error('OTP is invalid or expired.'));
        const useCase = buildRegisterDgfyAccountUseCase({ repository, hashPassword: jest.fn(), verifyEmailOtp });
        const result = await useCase({
            body: {
                first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', phone: '+639171234567',
                password: 'password123', email_otp_code: 'wrong', ...validLegalAckBody()
            }
        });
        expect(result.success).toBe(false);
    });
});

describe('buildLoginDgfyAccountUseCase', () => {
    it('logs in with valid credentials', async () => {
        const account = makeAccount();
        const repository = {
            findByEmail: jest.fn().mockResolvedValue(account),
            updateLastLogin: jest.fn().mockResolvedValue(null),
            findById: jest.fn().mockResolvedValue(account)
        };
        const useCase = buildLoginDgfyAccountUseCase({ repository, comparePassword: jest.fn().mockResolvedValue(true) });
        const result = await useCase({ body: { email: 'jane@example.com', password: 'password123' } });
        expect(result.success).toBe(true);
    });

    it('rejects an invalid password', async () => {
        const repository = { findByEmail: jest.fn().mockResolvedValue(makeAccount()) };
        const useCase = buildLoginDgfyAccountUseCase({ repository, comparePassword: jest.fn().mockResolvedValue(false) });
        const result = await useCase({ body: { email: 'jane@example.com', password: 'wrong' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(401);
    });
});

describe('buildGetDgfyMeUseCase', () => {
    it('returns an empty membership list from this service\'s slim repository', async () => {
        const useCase = buildGetDgfyMeUseCase({ repository: {} });
        const result = await useCase({ account: makeAccount() });
        expect(result.success).toBe(true);
        expect(result.data.payload.data.memberships).toEqual([]);
    });
});

describe('buildUpdateDgfyProfileUseCase / buildChangeDgfyPasswordUseCase', () => {
    it('updates profile fields', async () => {
        const account = makeAccount();
        const repository = {
            findByPhone: jest.fn().mockResolvedValue(null),
            updateProfile: jest.fn().mockResolvedValue({ ...account, first_name: 'Janet' })
        };
        const useCase = buildUpdateDgfyProfileUseCase({ repository });
        const result = await useCase({ account, body: { first_name: 'Janet', last_name: 'Doe', phone: account.phone } });
        expect(result.success).toBe(true);
    });

    it('rejects an invalid current password', async () => {
        const account = makeAccount();
        const useCase = buildChangeDgfyPasswordUseCase({ repository: {}, comparePassword: jest.fn().mockResolvedValue(false), hashPassword: jest.fn() });
        const result = await useCase({ account, body: { current_password: 'wrong', new_password: 'newpassword123' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(401);
    });
});

describe('email verification / password reset / handoff', () => {
    it('requests email verification OTP when unverified', async () => {
        const requestEmailOtp = jest.fn().mockResolvedValue({ sent: true });
        const useCase = buildRequestDgfyEmailVerificationUseCase({ requestEmailOtp });
        const result = await useCase({ account: makeAccount() });
        expect(result.data.statusCode).toBe(202);
    });

    it('verifies email with a valid OTP', async () => {
        const repository = { markEmailVerified: jest.fn().mockResolvedValue(makeAccount({ email_verified_at: new Date() })) };
        const useCase = buildVerifyDgfyEmailUseCase({ repository, verifyEmailOtp: jest.fn().mockResolvedValue({ verified: true }) });
        const result = await useCase({ account: makeAccount(), body: { code: '123456' } });
        expect(result.success).toBe(true);
    });

    it('password reset returns a generic message for an unknown account', async () => {
        const repository = { findByEmail: jest.fn().mockResolvedValue(null) };
        const useCase = buildRequestDgfyPasswordResetUseCase({ repository, requestEmailOtp: jest.fn() });
        const result = await useCase({ body: { email: 'unknown@example.com' } });
        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(202);
    });

    it('completes a password reset with a valid OTP', async () => {
        const repository = {
            findByEmail: jest.fn().mockResolvedValue(makeAccount()),
            updatePassword: jest.fn().mockResolvedValue(null)
        };
        const useCase = buildCompleteDgfyPasswordResetUseCase({
            repository, verifyEmailOtp: jest.fn().mockResolvedValue({ verified: true }), hashPassword: jest.fn().mockResolvedValue('new-hash')
        });
        const result = await useCase({ body: { email: 'jane@example.com', code: '123456', password: 'newpassword123' } });
        expect(result.success).toBe(true);
    });

    it('creates and exchanges a handoff token exactly once', async () => {
        const account = makeAccount();
        let storedHandoff = null;
        const repository = {
            createHandoff: jest.fn(async ({ jti, dgfyAccountId, expiresAt }) => {
                storedHandoff = { jti, dgfyAccountId, expiresAt, consumed: false };
            }),
            consumeHandoff: jest.fn(async ({ jti, dgfyAccountId }) => {
                if (!storedHandoff || storedHandoff.jti !== jti || storedHandoff.dgfyAccountId !== dgfyAccountId || storedHandoff.consumed) return null;
                storedHandoff.consumed = true;
                return storedHandoff;
            }),
            findById: jest.fn().mockResolvedValue(account)
        };
        const createResult = await buildCreateDgfyHandoffUseCase({ repository })({ account });
        const handoffToken = createResult.data.payload.data.handoff_token;
        const exchangeUseCase = buildExchangeDgfyHandoffUseCase({ repository });
        const first = await exchangeUseCase({ body: { handoff_token: handoffToken } });
        expect(first.success).toBe(true);
        const second = await exchangeUseCase({ body: { handoff_token: handoffToken } });
        expect(second.success).toBe(false);
    });
});
