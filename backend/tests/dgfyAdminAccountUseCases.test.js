import { jest } from '@jest/globals';
import {
    buildGetAdminDgfyAccountUseCase,
    buildDeleteAdminDgfyAccountUseCase,
    buildListAdminDgfyAccountsUseCase,
    buildReactivateAdminDgfyAccountUseCase,
    buildSuspendAdminDgfyAccountUseCase,
    buildUpdateAdminDgfyAccountProfileUseCase
} from '../src/modules/dgfy/usecases/dgfyAdminAccountUseCases.js';
import { buildLoginDgfyAccountUseCase } from '../src/modules/dgfy/usecases/dgfyAuthUseCases.js';

const createAccount = (overrides = {}) => ({
    id: 'dgfy-account-1',
    first_name: 'Ada',
    middle_name: null,
    last_name: 'Lovelace',
    username: 'Ada',
    email: 'ada@example.test',
    phone: '+639123456789',
    password_hash: 'hashed-password',
    is_active: true,
    email_verified_at: new Date('2026-05-21T00:00:00.000Z'),
    phone_verified_at: new Date('2026-05-21T00:00:00.000Z'),
    last_login_at: null,
    deleted_at: null,
    deleted_by: null,
    deletion_reason: null,
    created_at: new Date('2026-05-21T00:00:00.000Z'),
    updated_at: new Date('2026-05-21T00:00:00.000Z'),
    tenantMemberships: [],
    ...overrides
});

const createRepository = (account = createAccount()) => ({
    listAdminAccounts: jest.fn().mockResolvedValue({
        rows: [account],
        count: 1,
        page: 1,
        limit: 25
    }),
    getAdminAccountSummary: jest.fn().mockResolvedValue({
        total: 1,
        active: account.is_active ? 1 : 0,
        suspended: account.is_active ? 0 : 1,
        deleted: account.deleted_at ? 1 : 0,
        verified_email: account.email_verified_at ? 1 : 0,
        unverified_email: account.email_verified_at ? 0 : 1
    }),
    findAccountForAdmin: jest.fn().mockResolvedValue(account),
    listAdminAuditLogs: jest.fn().mockResolvedValue([]),
    findByPhone: jest.fn().mockResolvedValue(null),
    updateAdminProfile: jest.fn().mockImplementation(async (_account, payload) => createAccount({ ...account, ...payload })),
    updateAdminLifecycle: jest.fn().mockImplementation(async (_account, isActive) => createAccount({ ...account, is_active: isActive })),
    deleteAdminAccount: jest.fn().mockImplementation(async (_account, payload) => createAccount({ ...account, ...payload })),
    createAdminAuditLog: jest.fn().mockResolvedValue({ audit_log_id: 1 }),
    transaction: jest.fn(async (callback) => callback('tx'))
});

describe('dgfyAdminAccountUseCases', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_ci_only_32_chars!';
    });

    it('lists admin DGFY accounts with pagination and summary', async () => {
        const repository = createRepository(createAccount({
            tenantMemberships: [{
                id: 10,
                tenant_id: 'tenant-1',
                tenant_user_id: 1,
                role: 'admin',
                status: 'accepted',
                source: 'founder',
                tenant: { id: 'tenant-1', name: 'Ada Foods', company_token: 'token-ada', status: 'active', plan: 'premium' }
            }]
        }));
        const useCase = buildListAdminDgfyAccountsUseCase({ repository });

        const result = await useCase({ query: { search: 'ada', status: 'active' } });

        expect(result.success).toBe(true);
        expect(repository.listAdminAccounts).toHaveBeenCalledWith({ search: 'ada', status: 'active' });
        expect(result.data.payload.data.accounts[0]).toEqual(expect.objectContaining({
            id: 'dgfy-account-1',
            membership_count: 1,
            lifecycle_status: 'active'
        }));
        expect(result.data.payload.data.summary.total).toBe(1);
    });

    it('returns account detail with memberships and audit rows', async () => {
        const repository = createRepository(createAccount());
        repository.listAdminAuditLogs.mockResolvedValue([{
            audit_log_id: 7,
            action: 'suspend',
            actor_username: 'platform-admin',
            reason: 'Risk review',
            created_at: new Date('2026-06-01T00:00:00.000Z')
        }]);
        const useCase = buildGetAdminDgfyAccountUseCase({ repository });

        const result = await useCase({ accountId: 'dgfy-account-1' });

        expect(result.success).toBe(true);
        expect(repository.findAccountForAdmin).toHaveBeenCalledWith('dgfy-account-1', {});
        expect(repository.listAdminAuditLogs).toHaveBeenCalledWith('dgfy-account-1', { limit: 25 });
        expect(result.data.payload.data.audit_logs[0]).toEqual(expect.objectContaining({
            audit_log_id: 7,
            action: 'suspend'
        }));
    });

    it('updates name and phone, clears phone verification, and writes a profile audit log', async () => {
        const account = createAccount();
        const repository = createRepository(account);
        const useCase = buildUpdateAdminDgfyAccountProfileUseCase({ repository });

        const result = await useCase({
            accountId: account.id,
            body: {
                first_name: 'Grace',
                middle_name: 'Brewster',
                last_name: 'Hopper',
                phone: '+639987654321'
            },
            actor: { username: 'owner-admin' },
            metadata: { request_id: 'req-profile' }
        });

        expect(result.success).toBe(true);
        expect(repository.updateAdminProfile).toHaveBeenCalledWith(account, expect.objectContaining({
            first_name: 'Grace',
            middle_name: 'Brewster',
            last_name: 'Hopper',
            username: 'Grace',
            phone: '+639987654321',
            phone_verified_at: null
        }), { transaction: 'tx' });
        expect(repository.createAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            dgfy_account_id: account.id,
            action: 'profile_update',
            actor_username: 'owner-admin',
            request_id: 'req-profile',
            before_snapshot: expect.objectContaining({ phone: '+639123456789' }),
            after_snapshot: expect.objectContaining({ phone: '+639987654321' })
        }), { transaction: 'tx' });
    });

    it('rejects admin profile email updates', async () => {
        const repository = createRepository(createAccount());
        const useCase = buildUpdateAdminDgfyAccountProfileUseCase({ repository });

        const result = await useCase({
            accountId: 'dgfy-account-1',
            body: { email: 'new@example.test' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(400);
        expect(repository.updateAdminProfile).not.toHaveBeenCalled();
    });

    it('rejects duplicate or invalid profile phone updates', async () => {
        const repository = createRepository(createAccount());
        const useCase = buildUpdateAdminDgfyAccountProfileUseCase({ repository });

        const invalid = await useCase({
            accountId: 'dgfy-account-1',
            body: { phone: 'abc', first_name: 'Ada', last_name: 'Lovelace' }
        });
        expect(invalid.success).toBe(false);
        expect(invalid.error.statusCode).toBe(400);

        repository.findByPhone.mockResolvedValue(createAccount({ id: 'other-account' }));
        const duplicate = await useCase({
            accountId: 'dgfy-account-1',
            body: { phone: '+639987654321', first_name: 'Ada', last_name: 'Lovelace' }
        });
        expect(duplicate.success).toBe(false);
        expect(duplicate.error.statusCode).toBe(409);
    });

    it('suspends and reactivates with required reason and audit logs', async () => {
        const account = createAccount();
        const repository = createRepository(account);
        const suspendUseCase = buildSuspendAdminDgfyAccountUseCase({ repository });
        const reactivateUseCase = buildReactivateAdminDgfyAccountUseCase({ repository });

        const missingReason = await suspendUseCase({ accountId: account.id, body: { reason: '  ' } });
        expect(missingReason.success).toBe(false);
        expect(missingReason.error.statusCode).toBe(400);

        const suspended = await suspendUseCase({
            accountId: account.id,
            body: { reason: 'Fraud review' },
            actor: { username: 'ops-admin' }
        });
        expect(suspended.success).toBe(true);
        expect(repository.updateAdminLifecycle).toHaveBeenCalledWith(account, false, { transaction: 'tx' });
        expect(repository.createAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: 'suspend',
            reason: 'Fraud review',
            actor_username: 'ops-admin'
        }), { transaction: 'tx' });

        repository.findAccountForAdmin.mockResolvedValue(createAccount({ is_active: false }));
        const reactivated = await reactivateUseCase({
            accountId: account.id,
            body: { reason: 'Review cleared' },
            actor: { username: 'ops-admin' }
        });
        expect(reactivated.success).toBe(true);
        expect(repository.updateAdminLifecycle).toHaveBeenLastCalledWith(expect.objectContaining({ is_active: false }), true, { transaction: 'tx' });
    });

    it('deletes by deidentifying credentials, requiring reason and email confirmation, and writing audit', async () => {
        const account = createAccount();
        const repository = createRepository(account);
        let reloadedAccount = account;
        repository.findAccountForAdmin.mockImplementation(async () => reloadedAccount);
        repository.deleteAdminAccount.mockImplementation(async (_account, payload) => {
            reloadedAccount = createAccount({ ...account, ...payload });
            return reloadedAccount;
        });
        const useCase = buildDeleteAdminDgfyAccountUseCase({ repository });

        const missingConfirmation = await useCase({
            accountId: account.id,
            body: { reason: 'Requested account reset', confirm_email: 'wrong@example.test' }
        });
        expect(missingConfirmation.success).toBe(false);
        expect(missingConfirmation.error.statusCode).toBe(400);

        const result = await useCase({
            accountId: account.id,
            body: { reason: 'Requested account reset', confirm_email: account.email },
            actor: { username: 'privacy-admin' },
            metadata: { request_id: 'req-delete' }
        });

        expect(result.success).toBe(true);
        expect(repository.deleteAdminAccount).toHaveBeenCalledWith(account, expect.objectContaining({
            first_name: 'Deleted',
            last_name: 'Account',
            is_active: false,
            email_verified_at: null,
            phone_verified_at: null,
            last_login_at: null,
            deleted_by: 'privacy-admin',
            deletion_reason: 'Requested account reset'
        }), { transaction: 'tx' });
        const deletePayload = repository.deleteAdminAccount.mock.calls[0][1];
        expect(deletePayload.email).not.toBe(account.email);
        expect(deletePayload.email).toMatch(/^deleted\+/);
        expect(deletePayload.phone).not.toBe(account.phone);
        expect(deletePayload.username).not.toBe(account.username);
        expect(deletePayload.password_hash).not.toBe(account.password_hash);
        expect(repository.createAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            dgfy_account_id: account.id,
            action: 'delete',
            reason: 'Requested account reset',
            actor_username: 'privacy-admin',
            request_id: 'req-delete',
            before_snapshot: expect.objectContaining({ email: account.email, phone: account.phone }),
            after_snapshot: expect.objectContaining({
                lifecycle_status: 'deleted',
                deleted_by: 'privacy-admin'
            })
        }), { transaction: 'tx' });
        expect(result.data.payload.data.account).toEqual(expect.objectContaining({
            lifecycle_status: 'deleted',
            is_active: false
        }));
    });

    it('rejects profile and lifecycle mutations after account deletion', async () => {
        const account = createAccount({ deleted_at: new Date('2026-06-05T00:00:00.000Z'), is_active: false });
        const repository = createRepository(account);

        const profileResult = await buildUpdateAdminDgfyAccountProfileUseCase({ repository })({
            accountId: account.id,
            body: { first_name: 'Ada', last_name: 'Lovelace', phone: account.phone }
        });
        expect(profileResult.success).toBe(false);
        expect(profileResult.error.statusCode).toBe(409);

        const reactivateResult = await buildReactivateAdminDgfyAccountUseCase({ repository })({
            accountId: account.id,
            body: { reason: 'Restore account' }
        });
        expect(reactivateResult.success).toBe(false);
        expect(reactivateResult.error.statusCode).toBe(409);
    });

    it('suspended accounts are rejected by DGFY login use case', async () => {
        const account = createAccount({ is_active: false });
        const useCase = buildLoginDgfyAccountUseCase({
            repository: {
                findByEmail: jest.fn().mockResolvedValue(account)
            },
            comparePassword: jest.fn().mockResolvedValue(true)
        });

        const result = await useCase({
            body: { email: account.email, password: 'password123' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.message).toBe('DGFY account is inactive.');
    });
});
