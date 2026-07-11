import { jest } from '@jest/globals';
import {
    buildCreateTenantSessionUseCase,
    buildActivateBusinessSessionUseCase
} from '../../../../src/modules/businesses/usecases/tenantSessionUseCases.js';

/**
 * Fast, fully-mocked unit tests for tenantSessionUseCases.js's WR-04 fix:
 * resolveTenantSession() must map a thrown/rejected tenant-database
 * connection error from accountStaffAssignmentRepository.findActiveAssignment()
 * to a 503 SERVICE_UNAVAILABLE ApplicationResult, rather than letting it
 * propagate as an unhandled rejection. No real database is used — all three
 * collaborator repositories are mocked (mirrors this codebase's own
 * ../../../integration/tenancy/tenantSessionUseCases.test.js mocking style,
 * which despite living under tests/integration/ also uses only mocks — no
 * real MySQL — and is not gated behind a RUN_*_INTEGRATION env flag).
 */

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

const baseBusinessRepository = (overrides = {}) => ({
    findById: jest.fn().mockResolvedValue({ id: 'biz-1', business_handle: 'acme-store' }),
    getMembership: jest.fn().mockResolvedValue(makeStaffMembership()),
    ...overrides
});

const baseBusinessDatabaseRegistry = (overrides = {}) => ({
    findByBusinessId: jest.fn().mockResolvedValue(makeRegistryEntry()),
    ...overrides
});

describe('resolveTenantSession connection-failure handling (WR-04)', () => {
    it('buildCreateTenantSessionUseCase returns 503 when the tenant-DB assignment lookup throws', async () => {
        const businessRepository = baseBusinessRepository();
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry();
        const accountStaffAssignmentRepository = {
            findActiveAssignment: jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
        };

        const useCase = buildCreateTenantSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-staff' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.statusCode).toBe(503);
    });

    it('buildActivateBusinessSessionUseCase returns 503 when the tenant-DB assignment lookup throws', async () => {
        const businessRepository = baseBusinessRepository();
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry();
        const accountStaffAssignmentRepository = {
            findActiveAssignment: jest.fn().mockRejectedValue(new Error('ER_BAD_DB_ERROR'))
        };

        const useCase = buildActivateBusinessSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-staff' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.statusCode).toBe(503);
    });

    it('does not attempt the tenant-DB assignment lookup for an owner (bypass), so the throw never happens', async () => {
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeStaffMembership({ role: 'owner' }))
        });
        const businessDatabaseRegistry = baseBusinessDatabaseRegistry();
        const accountStaffAssignmentRepository = {
            findActiveAssignment: jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))
        };

        const useCase = buildCreateTenantSessionUseCase({
            businessRepository,
            businessDatabaseRegistry,
            accountStaffAssignmentRepository
        });

        const result = await useCase({ businessId: 'biz-1', accountId: 'acct-owner' });

        expect(result.isSuccess).toBe(true);
        expect(accountStaffAssignmentRepository.findActiveAssignment).not.toHaveBeenCalled();
    });
});
