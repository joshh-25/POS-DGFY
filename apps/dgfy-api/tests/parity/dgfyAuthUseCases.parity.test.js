import { jest } from '@jest/globals';
import * as backendUseCases from '../../src/modules/dgfy/usecases/dgfyAuthUseCases.js';
import * as dgfyApiUseCases from '../../../apps/dgfy-api/src/modules/dgfyAuth/usecases/dgfyAuthUseCases.js';
import { DGFY_LEGAL_TERM_VERSIONS as BACKEND_LEGAL_TERM_VERSIONS } from '../../src/modules/shared/utils/dgfyLegalTerms.js';
import { DGFY_LEGAL_TERM_VERSIONS as DGFY_API_LEGAL_TERM_VERSIONS } from '../../../apps/dgfy-api/src/modules/dgfyAuth/utils/dgfyLegalTerms.js';

// apps/dgfy-api/src/modules/dgfyAuth is a DELIBERATE, BOUNDED DUPLICATION of
// this file's auth-only use cases (see apps/dgfy-api's module README for why
// a shared workspace package was tried and rejected). This suite runs the
// same behavioral assertions against both copies so a change to one that
// isn't mirrored in the other fails CI instead of silently drifting.
// Whenever this test needs updating, update both copies together.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_ci_only_32_chars!';

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
    update: jest.fn().mockResolvedValue(null),
    ...overrides
});

const implementations = [
    { label: 'backend', useCases: backendUseCases, legalVersions: BACKEND_LEGAL_TERM_VERSIONS },
    { label: 'apps/dgfy-api', useCases: dgfyApiUseCases, legalVersions: DGFY_API_LEGAL_TERM_VERSIONS }
];

describe.each(implementations)('DGFY auth use case parity — $label', ({ useCases, legalVersions }) => {
    const validLegalAckBody = () => ({
        accepted_terms: true,
        terms_version: legalVersions.accountTerms,
        privacy_version: legalVersions.privacy,
        marketplace_terms_version: legalVersions.marketplaceTerms
    });

    it('preflight reports available when no conflicts exist', async () => {
        const repository = { findByEmail: jest.fn().mockResolvedValue(null), findByPhone: jest.fn().mockResolvedValue(null) };
        const useCase = useCases.buildPreflightDgfyAccountRegistrationUseCase({ repository });
        const result = await useCase({ body: { email: 'jane@example.com', phone: '+639171234567' } });
        expect(result.success).toBe(true);
        expect(result.data.payload.data.available).toBe(true);
    });

    it('registers successfully with valid OTP and legal acknowledgement', async () => {
        const repository = {
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            transaction: jest.fn(async (cb) => cb('txn')),
            create: jest.fn().mockResolvedValue(makeAccount()),
            recordLegalAcknowledgement: jest.fn().mockResolvedValue({})
        };
        const useCase = useCases.buildRegisterDgfyAccountUseCase({
            repository,
            hashPassword: jest.fn().mockResolvedValue('hashed'),
            verifyEmailOtp: jest.fn().mockResolvedValue({ verified: true })
        });
        const result = await useCase({
            body: {
                first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', phone: '+639171234567',
                password: 'password123', email_otp_code: '123456', ...validLegalAckBody()
            }
        });
        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(201);
        expect(result.data.payload.data.token).toEqual(expect.any(String));
    });

    it('rejects registration with a stale legal acknowledgement version', async () => {
        const useCase = useCases.buildRegisterDgfyAccountUseCase({
            repository: { findByEmail: jest.fn(), findByPhone: jest.fn() },
            hashPassword: jest.fn(),
            verifyEmailOtp: jest.fn()
        });
        const result = await useCase({
            body: {
                first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', phone: '+639171234567',
                password: 'password123', accepted_terms: true, terms_version: 'stale', privacy_version: 'stale',
                marketplace_terms_version: 'stale'
            }
        });
        expect(result.success).toBe(false);
        expect(result.error.details.error_code).toBe('TERMS_ACKNOWLEDGEMENT_REQUIRED');
    });

    it('login rejects an inactive account with 403', async () => {
        const repository = { findByEmail: jest.fn().mockResolvedValue(makeAccount({ is_active: false })) };
        const useCase = useCases.buildLoginDgfyAccountUseCase({ repository, comparePassword: jest.fn() });
        const result = await useCase({ body: { email: 'jane@example.com', password: 'password123' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
    });

    it('login succeeds with valid credentials and returns a token', async () => {
        const account = makeAccount();
        const repository = {
            findByEmail: jest.fn().mockResolvedValue(account),
            updateLastLogin: jest.fn().mockResolvedValue(null),
            findById: jest.fn().mockResolvedValue(account)
        };
        const useCase = useCases.buildLoginDgfyAccountUseCase({ repository, comparePassword: jest.fn().mockResolvedValue(true) });
        const result = await useCase({ body: { email: 'jane@example.com', password: 'password123' } });
        expect(result.success).toBe(true);
        expect(result.data.payload.data.token).toEqual(expect.any(String));
    });

    it('getDgfyMe maps memberships when the repository supports listMemberships', async () => {
        const repository = {
            listMemberships: jest.fn().mockResolvedValue([
                { id: 1, tenant_id: 't1', role: 'staff', status: 'accepted', source: 'invite', tenant: { id: 't1', name: 'Acme', company_token: 'tok', status: 'active', plan: 'pro' } }
            ])
        };
        const useCase = useCases.buildGetDgfyMeUseCase({ repository });
        const result = await useCase({ account: makeAccount() });
        expect(result.success).toBe(true);
        expect(result.data.payload.data.memberships).toHaveLength(1);
    });

    it('password reset returns a generic 202 message for an unknown account (anti-enumeration)', async () => {
        const repository = { findByEmail: jest.fn().mockResolvedValue(null) };
        const useCase = useCases.buildRequestDgfyPasswordResetUseCase({ repository, requestEmailOtp: jest.fn() });
        const result = await useCase({ body: { email: 'unknown@example.com' } });
        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(202);
    });

    it('handoff exchange rejects replay of an already-consumed token', async () => {
        const account = makeAccount();
        let storedHandoff = null;
        const repository = {
            createHandoff: jest.fn(async ({ jti, dgfyAccountId, expiresAt }) => {
                storedHandoff = { jti, dgfyAccountId, expiresAt, consumed: false };
            }),
            consumeHandoff: jest.fn(async ({ jti, dgfyAccountId }) => {
                if (!storedHandoff || storedHandoff.jti !== jti || storedHandoff.dgfyAccountId !== dgfyAccountId || storedHandoff.consumed) {
                    return null;
                }
                storedHandoff.consumed = true;
                return storedHandoff;
            }),
            findById: jest.fn().mockResolvedValue(account)
        };
        const createUseCase = useCases.buildCreateDgfyHandoffUseCase({ repository });
        const createResult = await createUseCase({ account });
        const handoffToken = createResult.data.payload.data.handoff_token;

        const exchangeUseCase = useCases.buildExchangeDgfyHandoffUseCase({ repository });
        const first = await exchangeUseCase({ body: { handoff_token: handoffToken } });
        expect(first.success).toBe(true);

        const second = await exchangeUseCase({ body: { handoff_token: handoffToken } });
        expect(second.success).toBe(false);
        expect(second.error.statusCode).toBe(401);
    });
});

// Documented, intentional non-parity: apps/dgfy-api's repository has no
// tenant-membership concept, so its buildGetDgfyMeUseCase copy falls back to
// an empty list instead of calling repository.listMemberships() directly.
// backend's repository always provides listMemberships in production, so
// this case doesn't apply there — it's not covered by the describe.each above.
describe('DGFY auth use case parity — documented divergence', () => {
    it('apps/dgfy-api returns an empty membership list when the repository has no listMemberships', async () => {
        const useCase = dgfyApiUseCases.buildGetDgfyMeUseCase({ repository: {} });
        const result = await useCase({ account: makeAccount() });
        expect(result.success).toBe(true);
        expect(result.data.payload.data.memberships).toEqual([]);
    });
});
