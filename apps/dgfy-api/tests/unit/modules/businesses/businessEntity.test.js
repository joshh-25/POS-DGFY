import { jest } from '@jest/globals';
import {
    BusinessEntity,
    BusinessMembershipEntity,
    createBusinessEntity,
    createBusinessMembershipEntity
} from '../../../../src/modules/businesses/entities/businessEntity.js';
import { BusinessRepository } from '../../../../src/modules/businesses/repositories/businessRepository.js';
import {
    BusinessDatabaseRegistryRepository
} from '../../../../src/modules/businesses/repositories/businessDatabaseRegistryRepository.js';

/**
 * Task 1 (04-06-PLAN.md): entity translation + shared-transaction registry
 * creation coverage.
 *
 * Test 1/2: model/plain input -> BusinessEntity/BusinessMembershipEntity,
 * preserving id/business_handle/legal_name/display_name/status/created_at/
 * updated_at (business) and id/account_id/business_id/role/status/
 * created_at/updated_at (membership).
 * Test 3: BusinessRepository.toPlainBusiness()/toPlainMembership() return the
 * same public response keys after translating through the entity helpers.
 * Test 4 (registry metadata shape) lives in businessUseCases.test.js
 * (buildCreateBusinessUseCase describe block), since that's the use case
 * that actually creates registry metadata on business creation.
 * Test 5: an injected registry write failure rolls back the business row and
 * owner membership row from the same landlord transaction — proven here via
 * a fake, transaction-aware sequelize double (no real MySQL required).
 */

describe('BusinessEntity', () => {
    it('preserves business fields from a plain model-shaped object', () => {
        const entity = createBusinessEntity({
            id: 'biz-1',
            business_handle: 'acme-store',
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
            unexpected_extra_field: 'should not leak into toPlain()'
        });

        expect(entity).toBeInstanceOf(BusinessEntity);
        expect(entity.toPlain()).toEqual({
            id: 'biz-1',
            business_handle: 'acme-store',
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z'
        });
    });

    it('isActive() reflects status', () => {
        expect(createBusinessEntity({ status: 'active' }).isActive()).toBe(true);
        expect(createBusinessEntity({ status: 'suspended' }).isActive()).toBe(false);
    });
});

describe('BusinessMembershipEntity', () => {
    it('preserves membership fields from a plain model-shaped object', () => {
        const entity = createBusinessMembershipEntity({
            id: 1,
            account_id: 'acct-1',
            business_id: 'biz-1',
            role: 'owner',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z'
        });

        expect(entity).toBeInstanceOf(BusinessMembershipEntity);
        expect(entity.toPlain()).toEqual({
            id: 1,
            account_id: 'acct-1',
            business_id: 'biz-1',
            role: 'owner',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z'
        });
    });

    it('isOwner()/isActive() reflect role and status', () => {
        expect(createBusinessMembershipEntity({ role: 'owner', status: 'active' }).isOwner()).toBe(true);
        expect(createBusinessMembershipEntity({ role: 'member', status: 'active' }).isOwner()).toBe(false);
        expect(createBusinessMembershipEntity({ status: 'active' }).isActive()).toBe(true);
        expect(createBusinessMembershipEntity({ status: 'suspended' }).isActive()).toBe(false);
    });
});

describe('BusinessRepository entity translation (API-05)', () => {
    function makeRepository() {
        return new BusinessRepository({
            businessModel: { sequelize: {} },
            businessMembershipModel: {}
        });
    }

    it('toPlainBusiness returns the same public response keys as before entity translation', () => {
        const repository = makeRepository();
        const modelLike = {
            get: () => ({
                id: 'biz-1',
                business_handle: 'acme-store',
                legal_name: 'Acme Inc.',
                display_name: 'Acme Store',
                status: 'active',
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-02T00:00:00.000Z'
            })
        };

        expect(repository.toPlainBusiness(modelLike)).toEqual({
            id: 'biz-1',
            business_handle: 'acme-store',
            legal_name: 'Acme Inc.',
            display_name: 'Acme Store',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z'
        });
    });

    it('toPlainMembership returns the same public response keys as before entity translation', () => {
        const repository = makeRepository();
        const modelLike = {
            get: () => ({
                id: 1,
                account_id: 'acct-1',
                business_id: 'biz-1',
                role: 'owner',
                status: 'active',
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-02T00:00:00.000Z'
            })
        };

        expect(repository.toPlainMembership(modelLike)).toEqual({
            id: 1,
            account_id: 'acct-1',
            business_id: 'biz-1',
            role: 'owner',
            status: 'active',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z'
        });
    });

    it('returns null for a null model (both helpers)', () => {
        const repository = makeRepository();
        expect(repository.toPlainBusiness(null)).toBeNull();
        expect(repository.toPlainMembership(null)).toBeNull();
    });
});

describe('BusinessDatabaseRegistryRepository.findOrCreateForBusiness / updateStatus / toSafeMetadata', () => {
    /**
     * Minimal fake Sequelize-shaped model: findOne/create backed by an
     * in-memory array, `create()`'s returned "instance" exposes `.get()`
     * and `.update()` like a real Sequelize model instance would.
     */
    function makeFakeRegistryModel() {
        const rows = [];
        return {
            rows,
            findOne: jest.fn(async ({ where }) => rows.find((r) => r.business_id === where.business_id) || null),
            create: jest.fn(async (attrs) => {
                const row = {
                    id: rows.length + 1,
                    verified_at: null,
                    created_at: new Date('2026-01-01T00:00:00.000Z'),
                    updated_at: new Date('2026-01-01T00:00:00.000Z'),
                    ...attrs
                };
                row.get = () => row;
                row.update = jest.fn(async (patch) => Object.assign(row, patch));
                rows.push(row);
                return row;
            })
        };
    }

    it('creates deterministic dgfy_business_* registry metadata in provisioning status with no credentials', async () => {
        const model = makeFakeRegistryModel();
        const repository = new BusinessDatabaseRegistryRepository({ businessDatabaseRegistryModel: model });

        const record = await repository.findOrCreateForBusiness({ businessId: 'biz-1', businessHandle: 'acme-store' });

        expect(record.database_name).toMatch(/^dgfy_business_[a-f0-9]+$/);
        expect(record.status).toBe('provisioning');
        expect(record).not.toHaveProperty('host');
        expect(record).not.toHaveProperty('user');
        expect(record).not.toHaveProperty('password');
        expect(record).not.toHaveProperty('credentials');
        expect(record).not.toHaveProperty('dsn');
    });

    it('is deterministic — the same businessId + businessHandle always produce the same database_name', async () => {
        const modelA = makeFakeRegistryModel();
        const repositoryA = new BusinessDatabaseRegistryRepository({ businessDatabaseRegistryModel: modelA });
        const modelB = makeFakeRegistryModel();
        const repositoryB = new BusinessDatabaseRegistryRepository({ businessDatabaseRegistryModel: modelB });

        const recordA = await repositoryA.findOrCreateForBusiness({ businessId: 'biz-1', businessHandle: 'acme-store' });
        const recordB = await repositoryB.findOrCreateForBusiness({ businessId: 'biz-1', businessHandle: 'acme-store' });

        expect(recordA.database_name).toBe(recordB.database_name);
    });

    it('is idempotent — returns the existing row instead of creating a duplicate', async () => {
        const model = makeFakeRegistryModel();
        const repository = new BusinessDatabaseRegistryRepository({ businessDatabaseRegistryModel: model });

        const first = await repository.findOrCreateForBusiness({ businessId: 'biz-1', businessHandle: 'acme-store' });
        const second = await repository.findOrCreateForBusiness({ businessId: 'biz-1', businessHandle: 'acme-store' });

        expect(second.database_name).toBe(first.database_name);
        expect(model.create).toHaveBeenCalledTimes(1);
    });

    it('updateStatus transitions provisioning -> active with a verified_at timestamp', async () => {
        const model = makeFakeRegistryModel();
        const repository = new BusinessDatabaseRegistryRepository({ businessDatabaseRegistryModel: model });
        await repository.findOrCreateForBusiness({ businessId: 'biz-1', businessHandle: 'acme-store' });

        const verifiedAt = new Date('2026-02-01T00:00:00.000Z');
        const updated = await repository.updateStatus({ businessId: 'biz-1', status: 'active', verifiedAt });

        expect(updated.status).toBe('active');
        expect(updated.verified_at).toBe(verifiedAt);
    });

    it('toSafeMetadata exposes only business_id/database_name/stable_opaque_suffix/status/verified_at/created_at/updated_at', () => {
        const model = makeFakeRegistryModel();
        const repository = new BusinessDatabaseRegistryRepository({ businessDatabaseRegistryModel: model });

        const safe = repository.toSafeMetadata({
            id: 99,
            business_id: 'biz-1',
            database_name: 'dgfy_business_abc',
            stable_opaque_suffix: 'abc',
            status: 'provisioning',
            verified_at: null,
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            updated_at: new Date('2026-01-01T00:00:00.000Z'),
            host: 'should-not-appear',
            password: 'should-not-appear',
            dsn: 'should-not-appear'
        });

        expect(Object.keys(safe).sort()).toEqual([
            'business_id', 'created_at', 'database_name', 'stable_opaque_suffix', 'status', 'updated_at', 'verified_at'
        ]);
        expect(safe).not.toHaveProperty('id');
        expect(safe).not.toHaveProperty('host');
        expect(safe).not.toHaveProperty('password');
        expect(safe).not.toHaveProperty('dsn');
    });
});

describe('BusinessRepository.createWithOwnerAndRegistry (shared landlord transaction, Test 5)', () => {
    /**
     * Fake Sequelize double that mimics the "managed transaction" callback
     * form's commit/rollback semantics without a real database connection:
     * writes tagged with a transaction token are only flushed into the
     * durable store when the callback resolves; if the callback throws, the
     * pending writes are simply never flushed (rollback), and the error
     * propagates to the caller — exactly matching how a real
     * `sequelize.transaction(async (t) => {...})` call behaves.
     */
    function makeFakeTransactionalSequelize() {
        const businessStore = [];
        const membershipStore = [];

        const sequelize = {
            transaction: async (callback) => {
                const pendingBusiness = [];
                const pendingMembership = [];
                const token = { pendingBusiness, pendingMembership };
                const result = await callback(token);
                businessStore.push(...pendingBusiness);
                membershipStore.push(...pendingMembership);
                return result;
            }
        };

        const businessModel = {
            create: jest.fn(async (attrs, { transaction }) => {
                const instance = { id: 'biz-1', ...attrs };
                instance.get = () => instance;
                transaction.pendingBusiness.push(instance);
                return instance;
            })
        };

        const businessMembershipModel = {
            create: jest.fn(async (attrs, { transaction }) => {
                const instance = { id: 1, ...attrs };
                instance.get = () => instance;
                transaction.pendingMembership.push(instance);
                return instance;
            })
        };

        return { sequelize, businessModel, businessMembershipModel, businessStore, membershipStore };
    }

    it('uses one shared transaction object for the business, membership, and registry writes', async () => {
        const { sequelize, businessModel, businessMembershipModel } = makeFakeTransactionalSequelize();
        const repository = new BusinessRepository({ businessModel, businessMembershipModel, sequelize });

        const seenRegistryTransactions = [];
        const registryRepository = {
            findOrCreateForBusiness: jest.fn(async ({ transaction }) => {
                seenRegistryTransactions.push(transaction);
                return { business_id: 'biz-1', database_name: 'dgfy_business_abc', status: 'provisioning' };
            })
        };

        await repository.createWithOwnerAndRegistry({
            payload: { business_handle: 'acme-store', legal_name: 'Acme Inc.', display_name: 'Acme Store' },
            accountId: 'acct-1',
            registryRepository
        });

        const businessTx = businessModel.create.mock.calls[0][1].transaction;
        const membershipTx = businessMembershipModel.create.mock.calls[0][1].transaction;

        expect(membershipTx).toBe(businessTx);
        expect(seenRegistryTransactions[0]).toBe(businessTx);
    });

    it('rolls back the business row and owner membership row when the registry write fails', async () => {
        const {
            sequelize, businessModel, businessMembershipModel, businessStore, membershipStore
        } = makeFakeTransactionalSequelize();
        const repository = new BusinessRepository({ businessModel, businessMembershipModel, sequelize });

        const registryRepository = {
            findOrCreateForBusiness: jest.fn().mockRejectedValue(new Error('registry write failed'))
        };

        await expect(repository.createWithOwnerAndRegistry({
            payload: { business_handle: 'acme-store', legal_name: 'Acme Inc.', display_name: 'Acme Store' },
            accountId: 'acct-1',
            registryRepository
        })).rejects.toThrow('registry write failed');

        expect(businessStore).toHaveLength(0);
        expect(membershipStore).toHaveLength(0);
    });

    it('omitting registryRepository behaves exactly like create() — no registry step attempted', async () => {
        const { sequelize, businessModel, businessMembershipModel, businessStore, membershipStore } = makeFakeTransactionalSequelize();
        const repository = new BusinessRepository({ businessModel, businessMembershipModel, sequelize });

        const result = await repository.createWithOwnerAndRegistry({
            payload: { business_handle: 'acme-store', legal_name: 'Acme Inc.', display_name: 'Acme Store' },
            accountId: 'acct-1',
            registryRepository: null
        });

        expect(result.tenantRegistry).toBeNull();
        expect(businessStore).toHaveLength(1);
        expect(membershipStore).toHaveLength(1);
    });
});
