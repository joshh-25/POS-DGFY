import { jest } from '@jest/globals';
import {
    ComplianceModeStateRepository,
    ComplianceStateNotFoundError,
    DuplicateComplianceModeStateError
} from '../../../../src/modules/compliance/repositories/complianceModeStateRepository.js';
import { buildSubmitComplianceEvidenceUseCase } from '../../../../src/modules/compliance/usecases/complianceUseCases.js';

// Exercises 08-09-PLAN.md Task 2's CR-01/FSC-01 gap-closure at the
// repository level (mirrors tests/unit/modules/inventory/
// inventoryMovementUseCases.test.js's mocked-tenantConnector convention —
// no live MySQL): upsertState() must write atomically via findOrCreate()
// (not a plain findOne()-then-create() TOCTOU race), and a duck-typed
// unique-constraint violation must surface as DuplicateComplianceModeStateError
// rather than falling through to a misleading
// TenantDatabaseUnavailableError('unreachable') 503. Also pins the
// usecase-level 409 CONFLICT mapping for buildSubmitComplianceEvidenceUseCase.

const makeStateRow = (overrides = {}) => {
    const row = {
        id: 1,
        business_id: 'biz-1',
        branch_id: null,
        state: 'non_compliant_active',
        compliance_profile: null,
        active_policy_pack_version: null,
        verification_status: null,
        verified_by_actor_type: null,
        verified_at: null,
        created_at: new Date('2026-07-12T00:00:00Z'),
        updated_at: new Date('2026-07-12T00:00:00Z'),
        ...overrides
    };
    row.get = ({ plain } = {}) => (plain ? { ...row } : row);
    row.update = jest.fn(async (patch) => {
        Object.assign(row, patch);
        return row;
    });
    return row;
};

/**
 * @param {{findOrCreateImpl?, findOneImpl?, transactionImpl?}} [overrides]
 */
function makeModels({ findOrCreateImpl, findOneImpl, transactionImpl } = {}) {
    const ComplianceModeState = {
        findOrCreate: jest.fn(findOrCreateImpl || (async () => [makeStateRow(), true])),
        findOne: jest.fn(findOneImpl || (async () => null)),
        create: jest.fn(async (data) => makeStateRow(data)),
        update: jest.fn(async () => [1]),
        sequelize: {
            transaction: jest.fn(transactionImpl || (async (callback) => callback({
                LOCK: { UPDATE: 'UPDATE' }
            })))
        }
    };
    return { ComplianceModeState };
}

const makeTenantConnector = (models) => ({ getModels: jest.fn(() => models) });

const makeRegistryRepository = (overrides = {}) => ({
    findByBusinessId: jest.fn(async () => ({
        database_name: 'dgfy_business_test',
        status: 'active',
        verified_at: new Date('2026-07-01T00:00:00Z')
    })),
    ...overrides
});

/** Simulates Sequelize's own thrown shape for a unique-index violation. */
class FakeSequelizeUniqueConstraintError extends Error {
    constructor() {
        super('Validation error');
        this.name = 'SequelizeUniqueConstraintError';
    }
}

describe('ComplianceModeStateRepository.upsertState — CR-01/FSC-01 atomic write', () => {
    it('writes the first row via findOrCreate() — not a plain findOne-then-create sequence', async () => {
        const models = makeModels();
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await repository.upsertState('biz-1', null, { state: 'compliant_pending' });

        expect(models.ComplianceModeState.findOrCreate).toHaveBeenCalledTimes(1);
        expect(models.ComplianceModeState.findOrCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { business_id: 'biz-1', branch_id: null }
            })
        );
        // The old TOCTOU-prone path (a bare findOne() immediately followed by
        // a conditional create()) must not be used any more.
        expect(models.ComplianceModeState.findOne).not.toHaveBeenCalled();
        expect(models.ComplianceModeState.create).not.toHaveBeenCalled();
    });

    it('keys findOrCreate on business_id + branch_id for the branch_id === null case (business-wide scope)', async () => {
        const models = makeModels();
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await repository.upsertState('biz-1', null, {});

        const [[callArgs]] = models.ComplianceModeState.findOrCreate.mock.calls;
        expect(callArgs.where).toEqual({ business_id: 'biz-1', branch_id: null });
    });

    it('keys findOrCreate on business_id + branch_id for a real branch_id', async () => {
        const models = makeModels();
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await repository.upsertState('biz-1', 7, {});

        const [[callArgs]] = models.ComplianceModeState.findOrCreate.mock.calls;
        expect(callArgs.where).toEqual({ business_id: 'biz-1', branch_id: 7 });
    });

    it('never writes branch_scope_key (DB-generated, not a writable attribute)', async () => {
        const models = makeModels();
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await repository.upsertState('biz-1', null, { state: 'compliant_pending', compliance_profile: { a: 1 } });

        const [[callArgs]] = models.ComplianceModeState.findOrCreate.mock.calls;
        expect(callArgs.defaults).not.toHaveProperty('branch_scope_key');
        expect(callArgs.where).not.toHaveProperty('branch_scope_key');
    });

    it('rethrows a findOrCreate unique-constraint violation as DuplicateComplianceModeStateError (NOT TenantDatabaseUnavailableError)', async () => {
        const models = makeModels({
            findOrCreateImpl: async () => {
                throw new FakeSequelizeUniqueConstraintError();
            }
        });
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await expect(repository.upsertState('biz-1', null, { state: 'compliant_pending' }))
            .rejects.toBeInstanceOf(DuplicateComplianceModeStateError);
    });

    it('rethrows a follow-up record.update() unique-constraint violation as DuplicateComplianceModeStateError', async () => {
        const row = makeStateRow();
        row.update = jest.fn(async () => {
            throw new FakeSequelizeUniqueConstraintError();
        });
        const models = makeModels({
            findOrCreateImpl: async () => [row, false]
        });
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await expect(repository.upsertState('biz-1', null, { state: 'compliant_active' }))
            .rejects.toBeInstanceOf(DuplicateComplianceModeStateError);
    });

    it('does not double-wrap DuplicateComplianceModeStateError as TenantDatabaseUnavailableError via withModel()', async () => {
        const models = makeModels({
            findOrCreateImpl: async () => {
                throw new FakeSequelizeUniqueConstraintError();
            }
        });
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        try {
            await repository.upsertState('biz-1', null, {});
            throw new Error('expected upsertState to reject');
        } catch (error) {
            expect(error.name).toBe('DuplicateComplianceModeStateError');
            expect(error.name).not.toBe('TenantDatabaseUnavailableError');
        }
    });
});

describe('ComplianceModeStateRepository.getForBusinessBranch — regression guard (untouched read path)', () => {
    it('returns the toPlain shape for an existing row', async () => {
        const row = makeStateRow({ id: 5, state: 'compliant_active', branch_id: null });
        const models = makeModels({ findOneImpl: async () => row });
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.getForBusinessBranch('biz-1', null);

        expect(result).toEqual(expect.objectContaining({
            id: 5,
            business_id: 'biz-1',
            branch_id: null,
            state: 'compliant_active'
        }));
        expect(models.ComplianceModeState.findOne).toHaveBeenCalledWith({
            where: { business_id: 'biz-1', branch_id: null }
        });
    });

    it('returns null when no row exists yet', async () => {
        const models = makeModels({ findOneImpl: async () => null });
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.getForBusinessBranch('biz-1', null);
        expect(result).toBeNull();
    });
});

describe('ComplianceModeStateRepository.recordVerificationAndState — FSC-01/T-12-07/T-12-08 atomic verify+state write', () => {
    it('writes verification_status/verified_by_actor_type/verified_at AND state in ONE record.update() inside ONE row-locked transaction', async () => {
        const row = makeStateRow();
        const transactionImpl = jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
        const models = makeModels({
            findOneImpl: async () => row,
            transactionImpl
        });
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const verifiedAt = new Date('2026-07-14T00:00:00Z');
        const result = await repository.recordVerificationAndState('biz-1', null, {
            verification_status: 'verified',
            verified_by_actor_type: 'tenant_master_admin',
            verified_at: verifiedAt,
            state: 'compliant_active'
        });

        // Exactly one transaction, opened via sequelize.transaction (row-locked).
        expect(models.ComplianceModeState.sequelize.transaction).toHaveBeenCalledTimes(1);

        // The guard read uses the row lock, mirroring recordVerification()/closeShift().
        expect(models.ComplianceModeState.findOne).toHaveBeenCalledWith({
            where: { business_id: 'biz-1', branch_id: null },
            transaction: expect.anything(),
            lock: 'UPDATE'
        });

        // Exactly one record.update() call, carrying all four fields together.
        expect(row.update).toHaveBeenCalledTimes(1);
        expect(row.update).toHaveBeenCalledWith(
            {
                verification_status: 'verified',
                verified_by_actor_type: 'tenant_master_admin',
                verified_at: verifiedAt,
                state: 'compliant_active'
            },
            { transaction: expect.anything() }
        );

        expect(result).toEqual(expect.objectContaining({
            verification_status: 'verified',
            verified_by_actor_type: 'tenant_master_admin',
            state: 'compliant_active'
        }));
    });

    it('throws ComplianceStateNotFoundError when no row exists yet (does NOT findOrCreate)', async () => {
        const models = makeModels({ findOneImpl: async () => null });
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await expect(repository.recordVerificationAndState('biz-1', null, {
            verification_status: 'revoked',
            verified_by_actor_type: 'tenant_master_admin',
            verified_at: new Date(),
            state: 'non_compliant_active'
        })).rejects.toBeInstanceOf(ComplianceStateNotFoundError);

        expect(models.ComplianceModeState.findOrCreate).not.toHaveBeenCalled();
    });

    it('rethrows a record.update() unique-constraint violation as DuplicateComplianceModeStateError', async () => {
        const row = makeStateRow();
        row.update = jest.fn(async () => {
            throw new FakeSequelizeUniqueConstraintError();
        });
        const models = makeModels({ findOneImpl: async () => row });
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await expect(repository.recordVerificationAndState('biz-1', null, {
            verification_status: 'verified',
            verified_by_actor_type: 'tenant_master_admin',
            verified_at: new Date(),
            state: 'compliant_active'
        })).rejects.toBeInstanceOf(DuplicateComplianceModeStateError);
    });

    it('returns the toPlain() shape', async () => {
        const row = makeStateRow({ id: 9, business_id: 'biz-1', branch_id: null });
        const models = makeModels({ findOneImpl: async () => row });
        const repository = new ComplianceModeStateRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.recordVerificationAndState('biz-1', null, {
            verification_status: 'rejected',
            verified_by_actor_type: 'tenant_master_admin',
            verified_at: new Date('2026-07-14T00:00:00Z'),
            state: 'non_compliant_active'
        });

        expect(result).toEqual({
            id: 9,
            business_id: 'biz-1',
            branch_id: null,
            state: 'non_compliant_active',
            compliance_profile: null,
            active_policy_pack_version: null,
            verification_status: 'rejected',
            verified_by_actor_type: 'tenant_master_admin',
            verified_at: new Date('2026-07-14T00:00:00Z'),
            created_at: row.created_at,
            updated_at: row.updated_at
        });
    });
});

describe('buildSubmitComplianceEvidenceUseCase — CR-01/FSC-01 409 mapping', () => {
    it('resolves to ApplicationResult.failure with a 409 CONFLICT DomainError when upsertState rejects with DuplicateComplianceModeStateError', async () => {
        const repository = {
            getForBusinessBranch: jest.fn().mockResolvedValue(null),
            upsertState: jest.fn().mockRejectedValue(new DuplicateComplianceModeStateError()),
            recordVerification: jest.fn()
        };
        const businessRepository = {
            findById: jest.fn().mockResolvedValue({ id: 'biz-1', status: 'active' }),
            getMembership: jest.fn().mockResolvedValue({ status: 'active', role: 'owner' })
        };

        const submitComplianceEvidence = buildSubmitComplianceEvidenceUseCase({ repository, businessRepository });

        const result = await submitComplianceEvidence({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            complianceProfile: { bir: {} }
        });

        expect(result.success).toBe(false);
        expect(result.statusCode).toBe(409);
        expect(result.error.code).toBe('CONFLICT');
        expect(repository.recordVerification).not.toHaveBeenCalled();
    });
});
