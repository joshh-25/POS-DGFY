import { jest } from '@jest/globals';
import {
    buildAcceptDgfyInvitationUseCase,
    buildGetDgfyMeUseCase,
    buildLoginDgfyAccountUseCase,
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
            create: jest.fn().mockImplementation(async (payload) => createAccount(payload))
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
    });

    it('logs in an active DGFY account', async () => {
        const account = createAccount();
        const repository = {
            findByEmail: jest.fn().mockResolvedValue(account),
            findById: jest.fn().mockResolvedValue(account),
            updateLastLogin: jest.fn().mockResolvedValue(null)
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
