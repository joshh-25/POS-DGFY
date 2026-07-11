import { jest } from '@jest/globals';
import {
    buildCreateBusinessUseCase,
    buildListUserBusinessesUseCase,
    buildGetBusinessUseCase,
    buildUpdateBusinessUseCase,
    buildOnboardStaffViaInvitationUseCase,
    buildOnboardStaffDirectUseCase,
    buildAcceptInvitationUseCase,
    buildListBusinessMembersUseCase
} from '../../../../src/modules/businesses/usecases/businessUseCases.js';

const makeBusiness = (overrides = {}) => ({
    id: 'biz-1',
    business_handle: 'acme-store',
    legal_name: 'Acme Inc.',
    display_name: 'Acme Store',
    status: 'active',
    ...overrides
});

const makeMembership = (overrides = {}) => ({
    id: 1,
    account_id: 'acct-1',
    business_id: 'biz-1',
    role: 'owner',
    status: 'active',
    ...overrides
});

const baseRepository = (overrides = {}) => ({
    findByHandle: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(makeBusiness()),
    findAccountBusinesses: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ business: makeBusiness(), membership: makeMembership() }),
    createWithOwnerAndRegistry: jest.fn().mockResolvedValue({
        business: makeBusiness(),
        membership: makeMembership(),
        tenantRegistry: null
    }),
    update: jest.fn().mockResolvedValue(makeBusiness()),
    getMembership: jest.fn().mockResolvedValue(makeMembership()),
    listMembers: jest.fn().mockResolvedValue([makeMembership()]),
    findInvitationByEmail: jest.fn().mockResolvedValue(null),
    findStaffAccountByEmail: jest.fn().mockResolvedValue(null),
    createInvitation: jest.fn().mockResolvedValue({
        token: 'inv-token-1',
        business_id: 'biz-1',
        email: 'staff@example.com',
        expires_at: new Date(Date.now() + 100000)
    }),
    createStaffAccount: jest.fn().mockResolvedValue({
        business_id: 'biz-1',
        email: 'staff@example.com',
        name: 'Staff Person'
    }),
    findInvitationByToken: jest.fn().mockResolvedValue(null),
    markInvitationAccepted: jest.fn().mockResolvedValue(null),
    createAssignment: jest.fn().mockResolvedValue({
        business_id: 'biz-1',
        email: 'staff@example.com',
        token: 'inv-token-1'
    }),
    ...overrides
});

describe('buildCreateBusinessUseCase', () => {
    it('creates a business and auto-assigns the creator as owner (D-10)', async () => {
        const repository = baseRepository();
        const useCase = buildCreateBusinessUseCase({ repository });

        const result = await useCase({
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            business_handle: 'Acme-Store',
            creatorAccountId: 'acct-1'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.createWithOwnerAndRegistry).toHaveBeenCalledWith(expect.objectContaining({
            payload: expect.objectContaining({
                business_handle: 'acme-store',
                legal_name: 'Acme Inc.',
                display_name: 'Acme Store'
            }),
            accountId: 'acct-1'
        }));
        expect(result.data.business).toBeDefined();
        expect(result.data.membership.role).toBe('owner');
    });

    it('rejects a duplicate business_handle with HTTP 409', async () => {
        const repository = baseRepository({ findByHandle: jest.fn().mockResolvedValue(makeBusiness()) });
        const useCase = buildCreateBusinessUseCase({ repository });

        const result = await useCase({
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            business_handle: 'acme-store',
            creatorAccountId: 'acct-1'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(repository.createWithOwnerAndRegistry).not.toHaveBeenCalled();
    });

    it('includes safe tenant_registry metadata in the response when a registry repository is injected (API-03)', async () => {
        const tenantRegistry = {
            business_id: 'biz-1',
            database_name: 'dgfy_business_abc123',
            stable_opaque_suffix: 'abc123',
            status: 'provisioning',
            verified_at: null
        };
        const repository = baseRepository({
            createWithOwnerAndRegistry: jest.fn().mockResolvedValue({
                business: makeBusiness(),
                membership: makeMembership(),
                tenantRegistry
            })
        });
        const businessDatabaseRegistryRepository = {
            toSafeMetadata: jest.fn((record) => ({ ...record }))
        };
        const useCase = buildCreateBusinessUseCase({ repository, businessDatabaseRegistryRepository });

        const result = await useCase({
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            business_handle: 'acme-store',
            creatorAccountId: 'acct-1'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.createWithOwnerAndRegistry).toHaveBeenCalledWith(expect.objectContaining({
            registryRepository: businessDatabaseRegistryRepository
        }));
        expect(businessDatabaseRegistryRepository.toSafeMetadata).toHaveBeenCalledWith(tenantRegistry);
        expect(result.data.tenant_registry).toEqual(expect.objectContaining({
            database_name: 'dgfy_business_abc123',
            status: 'provisioning'
        }));
        expect(result.data.tenant_registry).not.toHaveProperty('host');
        expect(result.data.tenant_registry).not.toHaveProperty('password');
    });

    it('omits tenant_registry from the response when no registry repository is injected', async () => {
        const repository = baseRepository();
        const useCase = buildCreateBusinessUseCase({ repository });

        const result = await useCase({
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            business_handle: 'acme-store',
            creatorAccountId: 'acct-1'
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data).not.toHaveProperty('tenant_registry');
    });

    it('rejects missing required fields', async () => {
        const repository = baseRepository();
        const useCase = buildCreateBusinessUseCase({ repository });

        const result = await useCase({ legal_name: '', display_name: '', business_handle: '' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.findByHandle).not.toHaveBeenCalled();
    });

    it('rejects a malformed business_handle', async () => {
        const repository = baseRepository();
        const useCase = buildCreateBusinessUseCase({ repository });

        const result = await useCase({
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            business_handle: 'a b!',
            creatorAccountId: 'acct-1'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('translates a SequelizeUniqueConstraintError from createWithOwnerAndRegistry() into a 409 conflict (CR-01)', async () => {
        const uniqueConstraintError = new Error('Duplicate entry');
        uniqueConstraintError.name = 'SequelizeUniqueConstraintError';
        const repository = baseRepository({
            createWithOwnerAndRegistry: jest.fn().mockRejectedValue(uniqueConstraintError)
        });
        const useCase = buildCreateBusinessUseCase({ repository });

        const result = await useCase({
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            business_handle: 'acme-store',
            creatorAccountId: 'acct-1'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(result.error.details.field).toBe('business_handle');
    });

    it('re-throws an unrecognized error from createWithOwnerAndRegistry() rather than swallowing it (CR-01)', async () => {
        const unexpectedError = new Error('connection reset');
        const repository = baseRepository({
            createWithOwnerAndRegistry: jest.fn().mockRejectedValue(unexpectedError)
        });
        const useCase = buildCreateBusinessUseCase({ repository });

        await expect(useCase({
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            business_handle: 'acme-store',
            creatorAccountId: 'acct-1'
        })).rejects.toThrow('connection reset');
    });
});

describe('buildListUserBusinessesUseCase', () => {
    it('returns an empty list when the account has no businesses', async () => {
        const repository = baseRepository();
        const useCase = buildListUserBusinessesUseCase({ repository });

        const result = await useCase({ accountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.businesses).toEqual([]);
    });

    it('returns multiple businesses', async () => {
        const repository = baseRepository({
            findAccountBusinesses: jest.fn().mockResolvedValue([makeBusiness(), makeBusiness({ id: 'biz-2' })])
        });
        const useCase = buildListUserBusinessesUseCase({ repository });

        const result = await useCase({ accountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.businesses).toHaveLength(2);
    });

    it('rejects a missing accountId', async () => {
        const repository = baseRepository();
        const useCase = buildListUserBusinessesUseCase({ repository });

        const result = await useCase({});

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });
});

describe('buildGetBusinessUseCase', () => {
    it('returns the business for a member', async () => {
        const repository = baseRepository();
        const useCase = buildGetBusinessUseCase({ repository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.business.id).toBe('biz-1');
    });

    it('returns NOT_FOUND for a missing business', async () => {
        const repository = baseRepository({ findById: jest.fn().mockResolvedValue(null) });
        const useCase = buildGetBusinessUseCase({ repository });

        const result = await useCase({ businessId: 'missing', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('rejects a non-member with HTTP 403', async () => {
        const repository = baseRepository({ getMembership: jest.fn().mockResolvedValue(null) });
        const useCase = buildGetBusinessUseCase({ repository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'someone-else' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.error.statusCode).toBe(403);
    });
});

describe('buildUpdateBusinessUseCase', () => {
    it('updates a business as the owner', async () => {
        const repository = baseRepository({
            update: jest.fn().mockResolvedValue(makeBusiness({ display_name: 'New Name' }))
        });
        const useCase = buildUpdateBusinessUseCase({ repository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            updates: { display_name: 'New Name' }
        });

        expect(result.isSuccess).toBe(true);
        expect(result.data.business.display_name).toBe('New Name');
        expect(repository.update).toHaveBeenCalledWith('biz-1', { display_name: 'New Name' });
    });

    it('rejects an invalid status value', async () => {
        const repository = baseRepository();
        const useCase = buildUpdateBusinessUseCase({ repository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            updates: { status: 'not-a-status' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects a non-owner with HTTP 403', async () => {
        const repository = baseRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildUpdateBusinessUseCase({ repository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-2',
            updates: { display_name: 'New Name' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('translates a SequelizeUniqueConstraintError from update() into a 409 conflict (CR-01)', async () => {
        const uniqueConstraintError = new Error('Duplicate entry');
        uniqueConstraintError.name = 'SequelizeUniqueConstraintError';
        const repository = baseRepository({ update: jest.fn().mockRejectedValue(uniqueConstraintError) });
        const useCase = buildUpdateBusinessUseCase({ repository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            updates: { display_name: 'New Name' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(result.error.details.field).toBe('business_handle');
    });

    it('re-throws an unrecognized error from update() rather than swallowing it (CR-01)', async () => {
        const unexpectedError = new Error('connection reset');
        const repository = baseRepository({ update: jest.fn().mockRejectedValue(unexpectedError) });
        const useCase = buildUpdateBusinessUseCase({ repository });

        await expect(useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            updates: { display_name: 'New Name' }
        })).rejects.toThrow('connection reset');
    });
});

describe('buildOnboardStaffViaInvitationUseCase', () => {
    it('sends an invitation and returns it with a token', async () => {
        const repository = baseRepository();
        const sendEmail = jest.fn().mockResolvedValue(undefined);
        const useCase = buildOnboardStaffViaInvitationUseCase({ repository, sendEmail });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            email: 'Staff@Example.com',
            name: 'Staff Person'
        });

        expect(result.isSuccess).toBe(true);
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'staff@example.com' }));
        expect(result.data.invitation.token).toEqual(expect.any(String));
    });

    it('rejects a duplicate pending invitation', async () => {
        const repository = baseRepository({
            findInvitationByEmail: jest.fn().mockResolvedValue({ token: 'existing' })
        });
        const useCase = buildOnboardStaffViaInvitationUseCase({ repository, sendEmail: jest.fn() });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', email: 'staff@example.com' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
    });

    it('rejects a non-owner requester with HTTP 403', async () => {
        const repository = baseRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildOnboardStaffViaInvitationUseCase({ repository, sendEmail: jest.fn() });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-2', email: 'staff@example.com' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
    });

    it('returns NOT_FOUND for a missing business', async () => {
        const repository = baseRepository({ findById: jest.fn().mockResolvedValue(null) });
        const useCase = buildOnboardStaffViaInvitationUseCase({ repository, sendEmail: jest.fn() });

        const result = await useCase({ businessId: 'missing', email: 'staff@example.com' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('HTML-escapes an injected business display_name in the invitation email HTML body (WR-01)', async () => {
        const repository = baseRepository({
            findById: jest.fn().mockResolvedValue(makeBusiness({ display_name: '<script>alert(1)</script>' }))
        });
        const sendEmail = jest.fn().mockResolvedValue(undefined);
        const useCase = buildOnboardStaffViaInvitationUseCase({ repository, sendEmail });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            email: 'staff@example.com'
        });

        expect(result.isSuccess).toBe(true);
        const sentEmail = sendEmail.mock.calls[0][0];
        expect(sentEmail.html).not.toContain('<script>alert(1)</script>');
        expect(sentEmail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        // The plain-text field is intentionally left unescaped.
        expect(sentEmail.text).toContain('<script>alert(1)</script>');
    });

    it('rejects a malformed (non-empty but invalid) email (WR-02)', async () => {
        const repository = baseRepository();
        const sendEmail = jest.fn();
        const useCase = buildOnboardStaffViaInvitationUseCase({ repository, sendEmail });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            email: 'not-an-email'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.details.field).toBe('email');
        expect(repository.findInvitationByEmail).not.toHaveBeenCalled();
        expect(sendEmail).not.toHaveBeenCalled();
    });
});

describe('buildOnboardStaffDirectUseCase', () => {
    it('creates a staff account immediately', async () => {
        const repository = baseRepository();
        const useCase = buildOnboardStaffDirectUseCase({ repository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            email: 'staff@example.com',
            name: 'Staff Person',
            initialPassword: 'TempPass123'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.createStaffAccount).toHaveBeenCalledWith(expect.objectContaining({
            businessId: 'biz-1',
            email: 'staff@example.com',
            initialPassword: 'TempPass123'
        }));
        expect(result.data.staffAccount).toBeDefined();
    });

    it('rejects a duplicate staff email', async () => {
        const repository = baseRepository({
            findStaffAccountByEmail: jest.fn().mockResolvedValue({ email: 'staff@example.com' })
        });
        const useCase = buildOnboardStaffDirectUseCase({ repository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', email: 'staff@example.com' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(repository.createStaffAccount).not.toHaveBeenCalled();
    });

    it('rejects a malformed (non-empty but invalid) email (WR-02)', async () => {
        const repository = baseRepository();
        const useCase = buildOnboardStaffDirectUseCase({ repository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            email: 'not-an-email'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.details.field).toBe('email');
        expect(repository.createStaffAccount).not.toHaveBeenCalled();
    });
});

describe('buildAcceptInvitationUseCase', () => {
    it('accepts a valid invitation and creates an assignment', async () => {
        const repository = baseRepository({
            findInvitationByToken: jest.fn().mockResolvedValue({
                token: 'inv-token-1',
                business_id: 'biz-1',
                email: 'staff@example.com',
                name: 'Staff Person',
                accepted_at: null,
                expires_at: new Date(Date.now() + 100000)
            })
        });
        const useCase = buildAcceptInvitationUseCase({ repository });

        const result = await useCase({ invitationToken: 'inv-token-1' });

        expect(result.isSuccess).toBe(true);
        expect(repository.markInvitationAccepted).toHaveBeenCalledWith('inv-token-1');
        expect(result.data.assignment).toBeDefined();
    });

    it('rejects an invalid/unknown token', async () => {
        const repository = baseRepository({ findInvitationByToken: jest.fn().mockResolvedValue(null) });
        const useCase = buildAcceptInvitationUseCase({ repository });

        const result = await useCase({ invitationToken: 'does-not-exist' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('rejects an expired invitation', async () => {
        const repository = baseRepository({
            findInvitationByToken: jest.fn().mockResolvedValue({
                token: 'inv-token-1',
                business_id: 'biz-1',
                email: 'staff@example.com',
                accepted_at: null,
                expires_at: new Date(Date.now() - 1000)
            })
        });
        const useCase = buildAcceptInvitationUseCase({ repository });

        const result = await useCase({ invitationToken: 'inv-token-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects an already-accepted invitation', async () => {
        const repository = baseRepository({
            findInvitationByToken: jest.fn().mockResolvedValue({
                token: 'inv-token-1',
                business_id: 'biz-1',
                email: 'staff@example.com',
                accepted_at: new Date(),
                expires_at: new Date(Date.now() + 100000)
            })
        });
        const useCase = buildAcceptInvitationUseCase({ repository });

        const result = await useCase({ invitationToken: 'inv-token-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
    });
});

describe('buildListBusinessMembersUseCase', () => {
    it('returns all members with roles for a member requester', async () => {
        const repository = baseRepository({
            listMembers: jest.fn().mockResolvedValue([
                makeMembership({ role: 'owner' }),
                makeMembership({ id: 2, account_id: 'acct-2', role: 'member' })
            ])
        });
        const useCase = buildListBusinessMembersUseCase({ repository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.members).toHaveLength(2);
    });

    it('rejects a non-member with HTTP 403', async () => {
        const repository = baseRepository({ getMembership: jest.fn().mockResolvedValue(null) });
        const useCase = buildListBusinessMembersUseCase({ repository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'not-a-member' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
    });
});
