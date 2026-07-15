import { jest } from '@jest/globals';
import { StageEventRepository } from '../../../../src/modules/fulfillment/repositories/stageEventRepository.js';
import { CourierAssignmentRepository } from '../../../../src/modules/fulfillment/repositories/courierAssignmentRepository.js';
import { AvailmentReadRepository } from '../../../../src/modules/fulfillment/repositories/availmentReadRepository.js';

// Mirrors tests/unit/modules/inventory/inventoryMovementUseCases.test.js's
// mock-Sequelize style: makeModels() returns Model stubs with
// create/bulkCreate/findAll/findOne/update jest.fn()s; makeTenantConnector
// wraps them behind getModels(); makeRegistryRepository returns an
// active+verified registry row by default.

const makeStageEventRow = (overrides = {}) => {
    const row = {
        id: 1,
        business_id: 'biz-1',
        availment_id: 10,
        fulfillment_mode: 'delivery',
        fulfillment_status: 'placed',
        fulfillment_stage: null,
        reason: null,
        is_forced: false,
        actor_staff_account_id: null,
        actor_account_id: null,
        created_at: new Date('2026-07-14T00:00:00Z'),
        ...overrides
    };
    row.get = ({ plain } = {}) => (plain ? { ...row } : row);
    return row;
};

const makeCourierRow = (overrides = {}) => {
    const row = {
        id: 5,
        business_id: 'biz-1',
        availment_id: 10,
        courier_name: 'Juan Dela Cruz',
        courier_contact: '09171234567',
        payout_amount: 100,
        payout_status: 'owed',
        paid_at: null,
        is_active: true,
        superseded_at: null,
        assigned_by_staff_account_id: 3,
        created_at: new Date('2026-07-14T00:00:00Z'),
        updated_at: new Date('2026-07-14T00:00:00Z'),
        ...overrides
    };
    row.get = ({ plain } = {}) => (plain ? { ...row } : row);
    return row;
};

const makeAvailmentRow = (overrides = {}) => {
    const row = {
        id: 20,
        business_id: 'biz-1',
        branch_id: null,
        fulfillment_mode: 'pickup',
        fulfillment_status: 'placed',
        fulfillment_stage: null,
        status: 'finalized',
        customer_account_id: null,
        total_amount: 250,
        created_at: new Date('2026-07-14T00:00:00Z'),
        updated_at: new Date('2026-07-14T00:00:00Z'),
        ...overrides
    };
    row.get = ({ plain } = {}) => (plain ? { ...row } : row);
    return row;
};

function makeAvailmentModel({ findAllImpl, findOneImpl, updateImpl } = {}) {
    return {
        findAll: jest.fn(findAllImpl || (async () => [makeAvailmentRow()])),
        findOne: jest.fn(findOneImpl || (async () => makeAvailmentRow())),
        update: jest.fn(updateImpl || (async () => [1]))
    };
}

function makeStageEventModel({ createImpl, bulkCreateImpl } = {}) {
    return {
        create: jest.fn(createImpl || (async (data) => makeStageEventRow({ ...data, id: 1 }))),
        bulkCreate: jest.fn(bulkCreateImpl || (async (rows) => rows.map((row, index) => makeStageEventRow({ ...row, id: 100 + index })))),
        findAll: jest.fn(async () => [makeStageEventRow()]),
        findOne: jest.fn(async () => makeStageEventRow())
    };
}

function makeCourierModel({ createImpl, updateImpl } = {}) {
    return {
        create: jest.fn(createImpl || (async (data) => makeCourierRow({ ...data, id: 5 }))),
        update: jest.fn(updateImpl || (async () => [1])),
        findAll: jest.fn(async () => [makeCourierRow()]),
        findOne: jest.fn(async () => makeCourierRow())
    };
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

describe('StageEventRepository — append-only surface', () => {
    it('exposes only create/bulkCreate/findAll/findOne (no update/delete/destroy)', () => {
        const models = { AvailmentStageEvent: makeStageEventModel() };
        const repository = new StageEventRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        expect(typeof repository.create).toBe('function');
        expect(typeof repository.bulkCreate).toBe('function');
        expect(typeof repository.findAll).toBe('function');
        expect(typeof repository.findOne).toBe('function');
        expect(repository.update).toBeUndefined();
        expect(repository.delete).toBeUndefined();
        expect(repository.destroy).toBeUndefined();
    });

    it('create() inserts a stage-event row and returns its plain shape', async () => {
        const models = { AvailmentStageEvent: makeStageEventModel() };
        const repository = new StageEventRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.create('biz-1', {
            availmentId: 10,
            fulfillmentMode: 'delivery',
            fulfillmentStatus: 'placed'
        });

        expect(models.AvailmentStageEvent.create).toHaveBeenCalledWith(expect.objectContaining({
            business_id: 'biz-1',
            availment_id: 10,
            fulfillment_mode: 'delivery',
            fulfillment_status: 'placed'
        }), {});
        expect(result.id).toBe(1);
        expect(result.fulfillment_status).toBe('placed');
    });

    it('create() passes an injected { transaction } straight through to Model.create', async () => {
        const models = { AvailmentStageEvent: makeStageEventModel() };
        const repository = new StageEventRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });
        const fakeTransaction = { id: 'txn-1' };

        await repository.create('biz-1', {
            availmentId: 10,
            fulfillmentMode: 'delivery',
            fulfillmentStatus: 'placed'
        }, { transaction: fakeTransaction });

        expect(models.AvailmentStageEvent.create).toHaveBeenCalledWith(
            expect.any(Object),
            { transaction: fakeTransaction }
        );
    });

    it('bulkCreate() inserts many rows and passes an injected transaction through', async () => {
        const models = { AvailmentStageEvent: makeStageEventModel() };
        const repository = new StageEventRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });
        const fakeTransaction = { id: 'txn-2' };

        const rows = await repository.bulkCreate('biz-1', [
            { availmentId: 10, fulfillmentMode: 'dine_in', fulfillmentStatus: 'placed' },
            { availmentId: 10, fulfillmentMode: 'dine_in', fulfillmentStatus: 'confirmed' }
        ], { transaction: fakeTransaction });

        expect(models.AvailmentStageEvent.bulkCreate).toHaveBeenCalledWith(
            expect.any(Array),
            { transaction: fakeTransaction }
        );
        expect(rows).toHaveLength(2);
    });

    it('surfaces a missing tenant database registry row as TenantDatabaseUnavailableError', async () => {
        const models = { AvailmentStageEvent: makeStageEventModel() };
        const repository = new StageEventRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository({
                findByBusinessId: jest.fn(async () => null)
            })
        });

        await expect(repository.create('biz-1', {
            availmentId: 10,
            fulfillmentMode: 'delivery',
            fulfillmentStatus: 'placed'
        })).rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError', reason: 'missing' });
    });

    it('surfaces an unverified tenant database registry row as TenantDatabaseUnavailableError', async () => {
        const models = { AvailmentStageEvent: makeStageEventModel() };
        const repository = new StageEventRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository({
                findByBusinessId: jest.fn(async () => ({
                    database_name: 'dgfy_business_test',
                    status: 'active',
                    verified_at: null
                }))
            })
        });

        await expect(repository.create('biz-1', {
            availmentId: 10,
            fulfillmentMode: 'delivery',
            fulfillmentStatus: 'placed'
        })).rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError', reason: 'unverified' });
    });
});

describe('CourierAssignmentRepository — payout mutable, identity append-only', () => {
    it('exposes create/updatePayout/markSuperseded/findAll/findActiveForAvailment', () => {
        const models = { CourierAssignment: makeCourierModel() };
        const repository = new CourierAssignmentRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        expect(typeof repository.create).toBe('function');
        expect(typeof repository.updatePayout).toBe('function');
        expect(typeof repository.markSuperseded).toBe('function');
        expect(typeof repository.findAll).toBe('function');
        expect(typeof repository.findActiveForAvailment).toBe('function');
    });

    it('create() inserts a new active courier_assignments row', async () => {
        const models = { CourierAssignment: makeCourierModel() };
        const repository = new CourierAssignmentRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.create('biz-1', {
            availmentId: 10,
            courierName: 'Juan Dela Cruz',
            courierContact: '09171234567',
            payoutAmount: 100,
            assignedByStaffAccountId: 3
        });

        expect(models.CourierAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
            business_id: 'biz-1',
            availment_id: 10,
            courier_name: 'Juan Dela Cruz'
        }));
        expect(result.id).toBe(5);
    });

    it('updatePayout() issues a real Model.update for payout_status/paid_at', async () => {
        const models = { CourierAssignment: makeCourierModel() };
        const repository = new CourierAssignmentRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });
        const paidAt = new Date('2026-07-14T12:00:00Z');

        const affectedRows = await repository.updatePayout('biz-1', 5, { payoutStatus: 'paid', paidAt });

        expect(models.CourierAssignment.update).toHaveBeenCalledWith(
            { payout_status: 'paid', paid_at: paidAt },
            expect.objectContaining({ where: { id: 5, business_id: 'biz-1' } })
        );
        expect(affectedRows).toBe(1);
    });

    it('markSuperseded() sets is_active=false and superseded_at via a real Model.update', async () => {
        const models = { CourierAssignment: makeCourierModel() };
        const repository = new CourierAssignmentRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await repository.markSuperseded('biz-1', 5);

        expect(models.CourierAssignment.update).toHaveBeenCalledWith(
            expect.objectContaining({ is_active: false, superseded_at: expect.any(Date) }),
            expect.objectContaining({ where: { id: 5, business_id: 'biz-1' } })
        );
    });

    it('surfaces a missing tenant database registry row as TenantDatabaseUnavailableError', async () => {
        const models = { CourierAssignment: makeCourierModel() };
        const repository = new CourierAssignmentRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository({
                findByBusinessId: jest.fn(async () => null)
            })
        });

        await expect(repository.create('biz-1', {
            availmentId: 10,
            courierName: 'Juan Dela Cruz'
        })).rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError', reason: 'missing' });
    });
});

describe('AvailmentReadRepository — FUL-01 read path (D-08) + FUL-02 single-availment load/sync', () => {
    it('exposes findIncomingAvailments/findById/updateFulfillmentState (no generic create/destroy)', () => {
        const models = { Availment: makeAvailmentModel() };
        const repository = new AvailmentReadRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        expect(typeof repository.findIncomingAvailments).toBe('function');
        expect(typeof repository.findById).toBe('function');
        expect(typeof repository.updateFulfillmentState).toBe('function');
        expect(repository.create).toBeUndefined();
        expect(repository.destroy).toBeUndefined();
    });

    it('builds a where clause scoped to online in-progress statuses/modes with no filters', async () => {
        const models = { Availment: makeAvailmentModel() };
        const repository = new AvailmentReadRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await repository.findIncomingAvailments('biz-1');

        const callArgs = models.Availment.findAll.mock.calls[0][0];
        expect(callArgs.where.business_id).toBe('biz-1');
        expect(callArgs.where.fulfillment_mode[Object.getOwnPropertySymbols(callArgs.where.fulfillment_mode)[0]]).toEqual(['pickup', 'delivery']);
        expect(callArgs.where.fulfillment_status[Object.getOwnPropertySymbols(callArgs.where.fulfillment_status)[0]]).toEqual(['placed', 'confirmed', 'preparing']);
        expect(callArgs.where.branch_id).toBeUndefined();
    });

    it('narrows to a single mode when fulfillmentMode is provided', async () => {
        const models = { Availment: makeAvailmentModel() };
        const repository = new AvailmentReadRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await repository.findIncomingAvailments('biz-1', { fulfillmentMode: 'delivery' });

        const callArgs = models.Availment.findAll.mock.calls[0][0];
        expect(callArgs.where.fulfillment_mode).toBe('delivery');
    });

    it('narrows to a single branch when branchId is provided', async () => {
        const models = { Availment: makeAvailmentModel() };
        const repository = new AvailmentReadRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await repository.findIncomingAvailments('biz-1', { branchId: 7 });

        const callArgs = models.Availment.findAll.mock.calls[0][0];
        expect(callArgs.where.branch_id).toBe(7);
    });

    it('returns only the mocked online in-progress rows', async () => {
        const models = { Availment: makeAvailmentModel({ findAllImpl: async () => [makeAvailmentRow({ id: 21, fulfillment_mode: 'delivery', fulfillment_status: 'confirmed' })] }) };
        const repository = new AvailmentReadRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const rows = await repository.findIncomingAvailments('biz-1');

        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(21);
        expect(rows[0].fulfillment_mode).toBe('delivery');
    });

    it('findById loads a single availment by id, unfiltered by D-08 in-progress scope (e.g. a completed row)', async () => {
        const models = { Availment: makeAvailmentModel({ findOneImpl: async () => makeAvailmentRow({ id: 20, fulfillment_status: 'completed' }) }) };
        const repository = new AvailmentReadRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const row = await repository.findById('biz-1', 20);

        expect(models.Availment.findOne).toHaveBeenCalledWith({ where: { id: 20, business_id: 'biz-1' } });
        expect(row.fulfillment_status).toBe('completed');
    });

    it('updateFulfillmentState issues a real Model.update scoped to only fulfillment_status/fulfillment_stage', async () => {
        const models = { Availment: makeAvailmentModel() };
        const repository = new AvailmentReadRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await repository.updateFulfillmentState('biz-1', 20, { fulfillmentStatus: 'confirmed', fulfillmentStage: 'confirmed' });

        expect(models.Availment.update).toHaveBeenCalledWith(
            { fulfillment_status: 'confirmed', fulfillment_stage: 'confirmed' },
            expect.objectContaining({ where: { id: 20, business_id: 'biz-1' } })
        );
    });

    it('updateFulfillmentState passes an injected transaction straight through', async () => {
        const models = { Availment: makeAvailmentModel() };
        const repository = new AvailmentReadRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });
        const fakeTransaction = { id: 'txn-3' };

        await repository.updateFulfillmentState('biz-1', 20, { fulfillmentStatus: 'confirmed' }, { transaction: fakeTransaction });

        expect(models.Availment.update).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({ transaction: fakeTransaction })
        );
    });

    it('surfaces a missing tenant database registry row as TenantDatabaseUnavailableError', async () => {
        const models = { Availment: makeAvailmentModel() };
        const repository = new AvailmentReadRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository({
                findByBusinessId: jest.fn(async () => null)
            })
        });

        await expect(repository.findIncomingAvailments('biz-1')).rejects.toMatchObject({
            name: 'TenantDatabaseUnavailableError',
            reason: 'missing'
        });
    });
});

