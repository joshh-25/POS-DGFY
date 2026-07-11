import { jest } from '@jest/globals';
import {
    buildCreateTenantSessionUseCase,
    buildActivateBusinessSessionUseCase
} from '../../../src/modules/businesses/usecases/tenantSessionUseCases.js';

/**
 * Unit tests for tenantSessionUseCases.js (Task 6), covering API-04
 * enforcement: tenant session creation/activation requires BOTH landlord
 * membership AND tenant-local assignment (or owner "authorized scope"
 * evidence) before a session context is built. All three collaborator
 * repositories (businessRepository, businessDatabaseRegistry,
 * accountStaffAssignmentRepository) are mocked — this suite exercises the
 * use case's own branching/error-code logic, not real persistence (real
 * per-tenant persistence is covered by
 * ../../integration/tenancy/tenantSessionRoutes.test.js's gated real-MySQL
 * suite).
 */

const makeOwnerMembership = (overrides = {}) => ({
    id: 1,
    account_id: 'acct-owner',
    business_id: 'biz-1',
    role: 'owner',
    status: 'active',
    ...overrides
});

const makeStaffMembership = (overrides = {}) => ({
    id: 2,
    account_id: 'acct-staff',
    business_id: 'biz-1',
    role: 'member',
    status: 'active',
    ...overrides
});

const makeRegistryEntry = (overrides = {}) => ({
    id: 1,
    business_id: 'biz-1',
    stable_opaque_suffix: 'abc123',
    database_name: 'dgfy_business_abc123',
    status: 'active',
    ...overrides
});

const makeAssignment = (overrides = {}) => ({
    id: 1,
    dgfy_account_id: 'acct-staff',
    staff_account_id: 10,
    role: 'staff',
    status: 'active',
    ...overrides
});

const baseBusinessRepository = (overrides = {}) => ({
    getMembership: jest.fn().mockResolvedValue(makeOwnerMembership()),
    ...overrides
});

const baseBusinessDatabaseRegistry = (overrides = {}) => ({
    findByBusinessId: jest.fn().mockResolvedValue(makeRegistryEntry()),
    ...overrides
});

const baseAccountStaffAssignmentRepository = (overrides = {}) => ({
    findActiveAssignment: jest.fn().mockResolvedValue(null),
    ...overrides
});

describe('buildCreateTenantSessionUseCase (API-04 enforcement)', () => {
    it('succeeds for an owner without requiring a tenant-local assignment (owner bypass)', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeOwnerMembership())
        });
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry();
        const accountStaffAssignmentRepository = baseAccountStaffAssignmentRepository();

        const useCase = buildCreateTenantSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-owner' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.business_id).toBe('biz-1');
        expect(result.data.tenant_database).toBe('dgfy_business_abc123');
        expect(result.data.dgfy_account_id).toBe('acct-owner');
        expect(result.data.active_assignment).toBeNull();
        // Owner bypass: assignment lookup is never called for owners.
        expect(accountStaffAssignmentRepository.findActiveAssignment).not.toHaveBeenCalled();
    });

    it('succeeds for a staff member with membership AND a tenant-local assignment', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeStaffMembership())
        });
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry();
        const accountStaffAssignmentRepository = baseAccountStaffAssignmentRepository({
            findActiveAssignment: jest.fn().mockResolvedValue(makeAssignment())
        });

        const useCase = buildCreateTenantSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-staff' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.active_assignment).toEqual(makeAssignment());
        expect(accountStaffAssignmentRepository.findActiveAssignment).toHaveBeenCalledWith(
            'dgfy_business_abc123',
            'acct-staff'
        );
    });

    it('rejects with NO_MEMBERSHIP (HTTP 403) when the account has no landlord membership', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(null)
        });
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry();
        const accountStaffAssignmentRepository = baseAccountStaffAssignmentRepository();

        const useCase = buildCreateTenantSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-outsider' });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.error.details.error_code).toBe('NO_MEMBERSHIP');
        // Rejection happens before tenant database resolution or assignment checks.
        expect(businessDatabaseRegistry.findByBusinessId).not.toHaveBeenCalled();
        expect(accountStaffAssignmentRepository.findActiveAssignment).not.toHaveBeenCalled();
    });

    it('rejects with NO_MEMBERSHIP when membership exists but is not active (e.g. removed)', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeStaffMembership({ status: 'removed' }))
        });
        const useCase = buildCreateTenantSessionUseCase({
            businessRepository,
            businessDatabaseRegistry: baseBusinessDatabaseRegistry(),
            accountStaffAssignmentRepository: baseAccountStaffAssignmentRepository()
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-staff' });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.error.details.error_code).toBe('NO_MEMBERSHIP');
    });

    it('rejects with NO_TENANT_DATABASE (HTTP 404) when no registry entry exists for the business', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeStaffMembership())
        });
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry({
            findByBusinessId: jest.fn().mockResolvedValue(null)
        });
        const accountStaffAssignmentRepository = baseAccountStaffAssignmentRepository();

        const useCase = buildCreateTenantSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-staff' });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(404);
        expect(result.error.details.error_code).toBe('NO_TENANT_DATABASE');
        // Assignment lookup never happens without a resolved tenant database.
        expect(accountStaffAssignmentRepository.findActiveAssignment).not.toHaveBeenCalled();
    });

    it('rejects with NO_TENANT_ASSIGNMENT (HTTP 403) for a staff member with membership but no assignment', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeStaffMembership())
        });
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry();
        const accountStaffAssignmentRepository = baseAccountStaffAssignmentRepository({
            findActiveAssignment: jest.fn().mockResolvedValue(null)
        });

        const useCase = buildCreateTenantSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-staff' });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.error.details.error_code).toBe('NO_TENANT_ASSIGNMENT');
    });

    it('rejects a missing businessId/accountId with a 400 validation error', async () => {
        const useCase = buildCreateTenantSessionUseCase({
            businessRepository: baseBusinessRepository(),
            businessDatabaseRegistry: baseBusinessDatabaseRegistry(),
            accountStaffAssignmentRepository: baseAccountStaffAssignmentRepository()
        });

        const result = await useCase({});

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(400);
    });

    it('degrades gracefully (503) when no businessDatabaseRegistry is configured', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeOwnerMembership())
        });
        const useCase = buildCreateTenantSessionUseCase({
            businessRepository,
            businessDatabaseRegistry: null,
            accountStaffAssignmentRepository: baseAccountStaffAssignmentRepository()
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-owner' });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(503);
    });
});

describe('buildActivateBusinessSessionUseCase (D-14: mid-session switch, same validation as creation)', () => {
    it('succeeds when switching to a business the owner is a member of', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeOwnerMembership({ business_id: 'biz-2' }))
        });
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry({
            findByBusinessId: jest.fn().mockResolvedValue(makeRegistryEntry({
                business_id: 'biz-2',
                database_name: 'dgfy_business_def456'
            }))
        });

        const useCase = buildActivateBusinessSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository: baseAccountStaffAssignmentRepository()
        });

        const result = await useCase({ businessId: 'biz-2', accountId: 'acct-owner' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.business_id).toBe('biz-2');
        expect(result.data.tenant_database).toBe('dgfy_business_def456');
    });

    it('rejects switching to a business the account is not a member of (HTTP 403)', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(null)
        });

        const useCase = buildActivateBusinessSessionUseCase({
            businessRepository,
            businessDatabaseRegistry: baseBusinessDatabaseRegistry(),
            accountStaffAssignmentRepository: baseAccountStaffAssignmentRepository()
        });

        const result = await useCase({ businessId: 'biz-9', accountId: 'acct-outsider' });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.error.details.error_code).toBe('NO_MEMBERSHIP');
    });

    it('rejects switching without a tenant-local assignment for a non-owner (HTTP 403)', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeStaffMembership({ business_id: 'biz-3' }))
        });
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry({
            findByBusinessId: jest.fn().mockResolvedValue(makeRegistryEntry({ business_id: 'biz-3' }))
        });
        const accountStaffAssignmentRepository = baseAccountStaffAssignmentRepository({
            findActiveAssignment: jest.fn().mockResolvedValue(null)
        });

        const useCase = buildActivateBusinessSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository
        });

        const result = await useCase({ businessId: 'biz-3', accountId: 'acct-staff' });

        expect(result.isSuccess).toBe(false);
        expect(result.statusCode).toBe(403);
        expect(result.error.details.error_code).toBe('NO_TENANT_ASSIGNMENT');
    });
});
