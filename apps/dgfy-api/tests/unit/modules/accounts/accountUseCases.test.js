import { jest } from '@jest/globals';
import {
    buildRegisterAccountUseCase,
    buildLoginAccountUseCase,
    buildUpdateAccountProfileUseCase,
    buildGetAccountUseCase,
    buildGetAccountForAuthorizationUseCase
} from '../../../../src/modules/accounts/usecases/accountUseCases.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const makeAccount = (overrides = {}) => ({
    id: 'acct-1',
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+639171234567',
    password_hash: 'hashed-password',
    status: 'active',
    email_verified_at: null,
    phone_verified_at: null,
    last_login_at: null,
    ...overrides
});

const mockAccountEntity = (overrides = {}) => ({
    validateEmailFormat: jest.fn().mockReturnValue(true),
    validatePasswordStrength: jest.fn().mockReturnValue(true),
    ...overrides
});

describe('buildRegisterAccountUseCase', () => {
    const baseRepository = () => ({
        findByEmail: jest.fn().mockResolvedValue(null),
        findByPhone: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(makeAccount())
    });

    it('registers successfully with status active and email_verified_at null (D-01)', async () => {
        const repository = baseRepository();
        const hashPassword = jest.fn().mockResolvedValue('hashed-password');
        const useCase = buildRegisterAccountUseCase({
            repository,
            accountEntity: mockAccountEntity(),
            hashPassword
        });

        const result = await useCase({
            email: 'jane@example.com',
            password: 'password123',
            first_name: 'Jane',
            last_name: 'Doe',
            phone: '+639171234567'
        });

        expect(result.isSuccess).toBe(true);
        expect(hashPassword).toHaveBeenCalledWith('password123');
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
            email: 'jane@example.com',
            password_hash: 'hashed-password',
            status: 'active',
            email_verified_at: null
        }));
        expect(result.data.account.email).toBe('jane@example.com');
        expect(result.data.account.password_hash).toBeUndefined();
        expect(result.data.token).toEqual(expect.any(String));
    });

    it('rejects duplicate email registration', async () => {
        const repository = baseRepository();
        repository.findByEmail.mockResolvedValue(makeAccount());
        const useCase = buildRegisterAccountUseCase({
            repository,
            accountEntity: mockAccountEntity(),
            hashPassword: jest.fn()
        });

        const result = await useCase({ email: 'jane@example.com', password: 'password123' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
    });

    it('rejects duplicate phone registration', async () => {
        const repository = baseRepository();
        repository.findByPhone.mockResolvedValue(makeAccount());
        const useCase = buildRegisterAccountUseCase({
            repository,
            accountEntity: mockAccountEntity(),
            hashPassword: jest.fn()
        });

        const result = await useCase({
            email: 'new@example.com',
            password: 'password123',
            phone: '+639171234567'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details.field).toBe('phone');
    });

    it('rejects invalid email format', async () => {
        const repository = baseRepository();
        const accountEntity = mockAccountEntity({ validateEmailFormat: jest.fn().mockReturnValue(false) });
        const useCase = buildRegisterAccountUseCase({ repository, accountEntity, hashPassword: jest.fn() });

        const result = await useCase({ email: 'not-an-email', password: 'password123' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a weak password', async () => {
        const repository = baseRepository();
        const accountEntity = mockAccountEntity({ validatePasswordStrength: jest.fn().mockReturnValue(false) });
        const useCase = buildRegisterAccountUseCase({ repository, accountEntity, hashPassword: jest.fn() });

        const result = await useCase({ email: 'jane@example.com', password: 'short' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects missing required fields', async () => {
        const repository = baseRepository();
        const useCase = buildRegisterAccountUseCase({
            repository,
            accountEntity: mockAccountEntity(),
            hashPassword: jest.fn()
        });

        const result = await useCase({ email: '', password: '' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.findByEmail).not.toHaveBeenCalled();
    });

    it('translates a SequelizeUniqueConstraintError from create() into a 409 conflict (CR-01)', async () => {
        const repository = baseRepository();
        const uniqueConstraintError = new Error('Duplicate entry');
        uniqueConstraintError.name = 'SequelizeUniqueConstraintError';
        uniqueConstraintError.errors = [{ path: 'email' }];
        repository.create = jest.fn().mockRejectedValue(uniqueConstraintError);
        const useCase = buildRegisterAccountUseCase({
            repository,
            accountEntity: mockAccountEntity(),
            hashPassword: jest.fn().mockResolvedValue('hashed-password')
        });

        const result = await useCase({ email: 'jane@example.com', password: 'password123' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
    });

    it('re-throws an unrecognized error from create() rather than swallowing it (CR-01)', async () => {
        const repository = baseRepository();
        const unexpectedError = new Error('connection reset');
        repository.create = jest.fn().mockRejectedValue(unexpectedError);
        const useCase = buildRegisterAccountUseCase({
            repository,
            accountEntity: mockAccountEntity(),
            hashPassword: jest.fn().mockResolvedValue('hashed-password')
        });

        await expect(useCase({ email: 'jane@example.com', password: 'password123' }))
            .rejects.toThrow('connection reset');
    });

    it('returns 503 when JWT_SECRET is unset, before any repository write (WR-05)', async () => {
        const originalSecret = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;
        try {
            const repository = baseRepository();
            const useCase = buildRegisterAccountUseCase({
                repository,
                accountEntity: mockAccountEntity(),
                hashPassword: jest.fn().mockResolvedValue('hashed-password')
            });

            const result = await useCase({ email: 'jane@example.com', password: 'password123' });

            expect(result.isSuccess).toBe(false);
            expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
            expect(result.error.statusCode).toBe(503);
            expect(repository.create).not.toHaveBeenCalled();
        } finally {
            process.env.JWT_SECRET = originalSecret;
        }
    });
});

describe('buildLoginAccountUseCase', () => {
    it('logs in with valid credentials and returns a token + empty businesses list', async () => {
        const account = makeAccount();
        const repository = {
            findByEmail: jest.fn().mockResolvedValue(account),
            update: jest.fn().mockResolvedValue({ ...account, last_login_at: new Date() }),
            findById: jest.fn().mockResolvedValue({ ...account, last_login_at: new Date() })
        };
        const bcrypt = { compare: jest.fn().mockResolvedValue(true) };
        const useCase = buildLoginAccountUseCase({ repository, bcrypt });

        const result = await useCase({ email: 'jane@example.com', password: 'password123' });

        expect(result.isSuccess).toBe(true);
        expect(bcrypt.compare).toHaveBeenCalledWith('password123', account.password_hash);
        expect(repository.update).toHaveBeenCalledWith(
            account.id,
            expect.objectContaining({ last_login_at: expect.any(Date) })
        );
        expect(result.data.businesses).toEqual([]);
        expect(result.data.token).toEqual(expect.any(String));
    });

    it('rejects a wrong password', async () => {
        const account = makeAccount();
        const repository = { findByEmail: jest.fn().mockResolvedValue(account) };
        const bcrypt = { compare: jest.fn().mockResolvedValue(false) };
        const useCase = buildLoginAccountUseCase({ repository, bcrypt });

        const result = await useCase({ email: 'jane@example.com', password: 'wrong' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHENTICATION_FAILED');
        expect(result.error.statusCode).toBe(401);
    });

    it('rejects a non-existent email without calling bcrypt', async () => {
        const repository = { findByEmail: jest.fn().mockResolvedValue(null) };
        const bcrypt = { compare: jest.fn() };
        const useCase = buildLoginAccountUseCase({ repository, bcrypt });

        const result = await useCase({ email: 'nope@example.com', password: 'password123' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHENTICATION_FAILED');
        expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('returns 503 when JWT_SECRET is unset, after credentials are verified (WR-05)', async () => {
        const originalSecret = process.env.JWT_SECRET;
        delete process.env.JWT_SECRET;
        try {
            const account = makeAccount();
            const repository = {
                findByEmail: jest.fn().mockResolvedValue(account),
                update: jest.fn(),
                findById: jest.fn()
            };
            const bcrypt = { compare: jest.fn().mockResolvedValue(true) };
            const useCase = buildLoginAccountUseCase({ repository, bcrypt });

            const result = await useCase({ email: 'jane@example.com', password: 'password123' });

            expect(result.isSuccess).toBe(false);
            expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
            expect(result.error.statusCode).toBe(503);
            expect(repository.update).not.toHaveBeenCalled();
        } finally {
            process.env.JWT_SECRET = originalSecret;
        }
    });
});

describe('buildUpdateAccountProfileUseCase', () => {
    it('updates profile successfully', async () => {
        const account = makeAccount();
        const repository = {
            findById: jest.fn().mockResolvedValue(account),
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue({ ...account, first_name: 'Janet' })
        };
        const useCase = buildUpdateAccountProfileUseCase({ repository, accountEntity: mockAccountEntity() });

        const result = await useCase({ accountId: account.id, updates: { first_name: 'Janet' } });

        expect(result.isSuccess).toBe(true);
        expect(result.data.account.first_name).toBe('Janet');
        expect(repository.update).toHaveBeenCalledWith(account.id, expect.objectContaining({ first_name: 'Janet' }));
    });

    it('rejects an update to an email already in use', async () => {
        const account = makeAccount();
        const repository = {
            findById: jest.fn().mockResolvedValue(account),
            findByEmail: jest.fn().mockResolvedValue(makeAccount({ id: 'acct-2', email: 'taken@example.com' })),
            findByPhone: jest.fn().mockResolvedValue(null),
            update: jest.fn()
        };
        const useCase = buildUpdateAccountProfileUseCase({ repository, accountEntity: mockAccountEntity() });

        const result = await useCase({ accountId: account.id, updates: { email: 'taken@example.com' } });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects a weak password on update', async () => {
        const account = makeAccount();
        const repository = {
            findById: jest.fn().mockResolvedValue(account),
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            update: jest.fn()
        };
        const accountEntity = mockAccountEntity({ validatePasswordStrength: jest.fn().mockReturnValue(false) });
        const useCase = buildUpdateAccountProfileUseCase({
            repository,
            accountEntity,
            hashPassword: jest.fn()
        });

        const result = await useCase({ accountId: account.id, updates: { password: 'short' } });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('applies a partial update without touching unrelated fields', async () => {
        const account = makeAccount();
        const repository = {
            findById: jest.fn().mockResolvedValue(account),
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue({ ...account, phone: '+639998887777' })
        };
        const useCase = buildUpdateAccountProfileUseCase({ repository, accountEntity: mockAccountEntity() });

        await useCase({ accountId: account.id, updates: { phone: '+639998887777' } });

        const patch = repository.update.mock.calls[0][1];
        expect(patch).toEqual({ phone: '+639998887777' });
    });

    it('returns NOT_FOUND for a missing account', async () => {
        const repository = { findById: jest.fn().mockResolvedValue(null) };
        const useCase = buildUpdateAccountProfileUseCase({ repository, accountEntity: mockAccountEntity() });

        const result = await useCase({ accountId: 'missing', updates: { first_name: 'X' } });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('translates a SequelizeUniqueConstraintError from update() into a 409 conflict (CR-01)', async () => {
        const account = makeAccount();
        const uniqueConstraintError = new Error('Duplicate entry');
        uniqueConstraintError.name = 'SequelizeUniqueConstraintError';
        uniqueConstraintError.errors = [{ path: 'phone' }];
        const repository = {
            findById: jest.fn().mockResolvedValue(account),
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockRejectedValue(uniqueConstraintError)
        };
        // Uses a phone-only update so it does not need current_password
        // (that gate only triggers on email/password changes).
        const useCase = buildUpdateAccountProfileUseCase({ repository, accountEntity: mockAccountEntity() });

        const result = await useCase({ accountId: account.id, updates: { phone: '+639998887777' } });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(result.error.details.field).toBe('phone');
    });

    it('re-throws an unrecognized error from update() rather than swallowing it (CR-01)', async () => {
        const account = makeAccount();
        const unexpectedError = new Error('connection reset');
        const repository = {
            findById: jest.fn().mockResolvedValue(account),
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockRejectedValue(unexpectedError)
        };
        const useCase = buildUpdateAccountProfileUseCase({ repository, accountEntity: mockAccountEntity() });

        await expect(useCase({ accountId: account.id, updates: { phone: '+639998887777' } }))
            .rejects.toThrow('connection reset');
    });

    it('rejects an email change without current_password (WR-03)', async () => {
        const account = makeAccount();
        const repository = {
            findById: jest.fn().mockResolvedValue(account),
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            update: jest.fn()
        };
        const bcrypt = { compare: jest.fn() };
        const useCase = buildUpdateAccountProfileUseCase({ repository, accountEntity: mockAccountEntity(), bcrypt });

        const result = await useCase({ accountId: account.id, updates: { email: 'new@example.com' } });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.statusCode).toBe(400);
        expect(result.error.details.field).toBe('current_password');
        expect(bcrypt.compare).not.toHaveBeenCalled();
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects a password change with an incorrect current_password (WR-03)', async () => {
        const account = makeAccount();
        const repository = {
            findById: jest.fn().mockResolvedValue(account),
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            update: jest.fn()
        };
        const bcrypt = { compare: jest.fn().mockResolvedValue(false) };
        const useCase = buildUpdateAccountProfileUseCase({
            repository,
            accountEntity: mockAccountEntity(),
            hashPassword: jest.fn().mockResolvedValue('new-hash'),
            bcrypt
        });

        const result = await useCase({
            accountId: account.id,
            updates: { password: 'newStrongPass123', current_password: 'wrong-password' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHENTICATION_FAILED');
        expect(result.error.statusCode).toBe(401);
        expect(bcrypt.compare).toHaveBeenCalledWith('wrong-password', account.password_hash);
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('allows a password change with the correct current_password (WR-03)', async () => {
        const account = makeAccount();
        const repository = {
            findById: jest.fn().mockResolvedValue(account),
            findByEmail: jest.fn().mockResolvedValue(null),
            findByPhone: jest.fn().mockResolvedValue(null),
            update: jest.fn().mockResolvedValue({ ...account, password_hash: 'new-hash' })
        };
        const bcrypt = { compare: jest.fn().mockResolvedValue(true) };
        const useCase = buildUpdateAccountProfileUseCase({
            repository,
            accountEntity: mockAccountEntity(),
            hashPassword: jest.fn().mockResolvedValue('new-hash'),
            bcrypt
        });

        const result = await useCase({
            accountId: account.id,
            updates: { password: 'newStrongPass123', current_password: 'correct-password' }
        });

        expect(result.isSuccess).toBe(true);
        expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', account.password_hash);
        expect(repository.update).toHaveBeenCalledWith(account.id, expect.objectContaining({ password_hash: 'new-hash' }));
    });
});

describe('buildGetAccountUseCase', () => {
    it('returns the account entity for a valid id', async () => {
        const account = makeAccount();
        const repository = { findById: jest.fn().mockResolvedValue(account) };
        const useCase = buildGetAccountUseCase({ repository });

        const result = await useCase({ accountId: account.id });

        expect(result.isSuccess).toBe(true);
        expect(result.data.account.id).toBe(account.id);
    });

    it('returns NOT_FOUND for an invalid id', async () => {
        const repository = { findById: jest.fn().mockResolvedValue(null) };
        const useCase = buildGetAccountUseCase({ repository });

        const result = await useCase({ accountId: 'missing' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });
});

describe('buildGetAccountForAuthorizationUseCase', () => {
    it('allows self access', async () => {
        const account = makeAccount();
        const repository = { findById: jest.fn().mockResolvedValue(account) };
        const useCase = buildGetAccountForAuthorizationUseCase({ repository });

        const result = await useCase({ accountId: account.id, requestingAccountId: account.id, role: 'owner' });

        expect(result.isSuccess).toBe(true);
    });

    it('allows admin access to another account', async () => {
        const account = makeAccount();
        const repository = { findById: jest.fn().mockResolvedValue(account) };
        const useCase = buildGetAccountForAuthorizationUseCase({ repository });

        const result = await useCase({ accountId: account.id, requestingAccountId: 'someone-else', role: 'admin' });

        expect(result.isSuccess).toBe(true);
    });

    it('rejects unauthorized access', async () => {
        const account = makeAccount();
        const repository = { findById: jest.fn().mockResolvedValue(account) };
        const useCase = buildGetAccountForAuthorizationUseCase({ repository });

        const result = await useCase({ accountId: account.id, requestingAccountId: 'someone-else', role: 'staff' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(repository.findById).not.toHaveBeenCalled();
    });
});
