import { jest } from '@jest/globals';
import {
    InventoryMovementRepository,
    InsufficientStockError,
    InventoryProductNotFoundError
} from '../../../../src/modules/inventory/repositories/inventoryMovementRepository.js';
import { recordSaleEffect, recordBookingEffect } from '../../../../src/modules/inventory/usecases/inventoryEffectContracts.js';

// This file exercises Task 1's own <behavior> block directly at the
// repository level (recordMovementWithStockSync's append-only insert +
// transactional stock sync + the reserved effect-contract shapes) —
// modules/inventory/usecases/inventoryMovementUseCases.js (the
// recordRestock/recordLoss/recordAdjustment/listMovements usecase builders)
// is Task 2's file, not Task 1's, so there is nothing usecase-level to import
// yet at this point in the plan. See 08-04-SUMMARY.md's Decisions Made for
// this naming note.

const makeMovementRow = (overrides = {}) => {
    const row = {
        id: 99,
        business_id: 'biz-1',
        product_id: 10,
        movement_type: 'restock',
        quantity: 5,
        reference_type: null,
        reference_id: null,
        actor_account_id: null,
        actor_staff_account_id: null,
        before_snapshot: null,
        after_snapshot: null,
        created_at: new Date('2026-07-12T00:00:00Z'),
        ...overrides
    };
    row.get = ({ plain } = {}) => (plain ? { ...row } : row);
    return row;
};

const makeProductRow = (overrides = {}) => ({
    id: 10,
    business_id: 'biz-1',
    inventory_mode: 'basic_inventory',
    stock_count: 20,
    ...overrides
});

function makeModels({ product, movementCreateImpl, productUpdateImpl, transactionImpl } = {}) {
    const InventoryMovement = {
        create: jest.fn(movementCreateImpl || (async (data) => makeMovementRow({ ...data, id: 99 }))),
        bulkCreate: jest.fn(async (rows) => rows.map((row, index) => makeMovementRow({ ...row, id: 100 + index }))),
        findAll: jest.fn(async () => [makeMovementRow()]),
        findOne: jest.fn(async () => makeMovementRow()),
        sequelize: {
            transaction: jest.fn(transactionImpl || (async (callback) => callback({})))
        }
    };
    const Product = {
        findByPk: jest.fn(async () => product),
        update: jest.fn(productUpdateImpl || (async () => [1]))
    };
    return { InventoryMovement, Product };
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

describe('InventoryMovementRepository — append-only surface', () => {
    it('exposes only create/bulkCreate/findAll/findOne for movements (no update/delete/destroy)', () => {
        const models = makeModels({ product: makeProductRow() });
        const repository = new InventoryMovementRepository({
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

    it('create() inserts a movement row and returns its plain shape', async () => {
        const models = makeModels({ product: makeProductRow() });
        const repository = new InventoryMovementRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.create('biz-1', {
            productId: 10,
            movementType: 'restock',
            quantity: 5,
            referenceType: 'manual',
            referenceId: 'ref-1'
        });

        expect(models.InventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
            business_id: 'biz-1',
            product_id: 10,
            movement_type: 'restock',
            quantity: 5
        }));
        expect(result.id).toBe(99);
        expect(result.movement_type).toBe('restock');
    });
});

describe('InventoryMovementRepository.recordMovementWithStockSync', () => {
    it('increases stock_count by +N for a restock on a basic_inventory product, inside one transaction', async () => {
        const product = makeProductRow({ stock_count: 20 });
        const models = makeModels({ product });
        const repository = new InventoryMovementRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.recordMovementWithStockSync('biz-1', {
            productId: 10,
            movementType: 'restock',
            quantity: 5
        });

        expect(models.InventoryMovement.sequelize.transaction).toHaveBeenCalledTimes(1);
        expect(models.Product.update).toHaveBeenCalledWith(
            { stock_count: 25 },
            expect.objectContaining({ where: expect.objectContaining({ id: 10, stock_count: 20 }) })
        );
        expect(models.InventoryMovement.create).toHaveBeenCalledWith(
            expect.objectContaining({ movement_type: 'restock', quantity: 5, product_id: 10 }),
            expect.any(Object)
        );
        expect(result.product.stock_count).toBe(25);
        expect(result.movement.movement_type).toBe('restock');
    });

    it('decreases stock_count by N for a loss on a basic_inventory product', async () => {
        const product = makeProductRow({ stock_count: 20 });
        const models = makeModels({ product });
        const repository = new InventoryMovementRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.recordMovementWithStockSync('biz-1', {
            productId: 10,
            movementType: 'loss',
            quantity: -8
        });

        expect(models.Product.update).toHaveBeenCalledWith(
            { stock_count: 12 },
            expect.objectContaining({ where: expect.objectContaining({ id: 10, stock_count: 20 }) })
        );
        expect(result.product.stock_count).toBe(12);
    });

    it('rejects a loss that would drive stock_count negative, without writing a movement row', async () => {
        const product = makeProductRow({ stock_count: 5 });
        const models = makeModels({ product });
        const repository = new InventoryMovementRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await expect(repository.recordMovementWithStockSync('biz-1', {
            productId: 10,
            movementType: 'loss',
            quantity: -8
        })).rejects.toMatchObject({ name: 'InsufficientStockError' });

        expect(models.Product.update).not.toHaveBeenCalled();
        expect(models.InventoryMovement.create).not.toHaveBeenCalled();
    });

    it('surfaces a concurrent-modification race (affectedRows !== 1) as InsufficientStockError', async () => {
        const product = makeProductRow({ stock_count: 20 });
        const models = makeModels({ product, productUpdateImpl: async () => [0] });
        const repository = new InventoryMovementRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await expect(repository.recordMovementWithStockSync('biz-1', {
            productId: 10,
            movementType: 'loss',
            quantity: -5
        })).rejects.toMatchObject({ name: 'InsufficientStockError' });

        expect(models.InventoryMovement.create).not.toHaveBeenCalled();
    });

    it('does not touch stock_count for a non_stock product, but still records the movement', async () => {
        const product = makeProductRow({ inventory_mode: 'non_stock', stock_count: null });
        const models = makeModels({ product });
        const repository = new InventoryMovementRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        const result = await repository.recordMovementWithStockSync('biz-1', {
            productId: 10,
            movementType: 'adjustment',
            quantity: 3
        });

        expect(models.Product.update).not.toHaveBeenCalled();
        expect(models.InventoryMovement.create).toHaveBeenCalled();
        expect(result.product.stock_count).toBeNull();
    });

    it('throws InventoryProductNotFoundError when productId does not resolve to a product', async () => {
        const models = makeModels({ product: null });
        const repository = new InventoryMovementRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository()
        });

        await expect(repository.recordMovementWithStockSync('biz-1', {
            productId: 999,
            movementType: 'restock',
            quantity: 5
        })).rejects.toMatchObject({ name: 'InventoryProductNotFoundError' });
    });

    it('surfaces a missing tenant database registry row as TenantDatabaseUnavailableError', async () => {
        const models = makeModels({ product: makeProductRow() });
        const repository = new InventoryMovementRepository({
            tenantConnector: makeTenantConnector(models),
            businessDatabaseRegistryRepository: makeRegistryRepository({
                findByBusinessId: jest.fn(async () => null)
            })
        });

        await expect(repository.recordMovementWithStockSync('biz-1', {
            productId: 10,
            movementType: 'restock',
            quantity: 5
        })).rejects.toMatchObject({ name: 'TenantDatabaseUnavailableError', reason: 'missing' });
    });
});

describe('inventoryEffectContracts (reserved, unwired — D-06)', () => {
    const validSaleInput = {
        businessId: 'biz-1',
        productId: 10,
        quantity: -2,
        referenceType: 'availment',
        referenceId: 'avail-1'
    };
    const validBookingInput = {
        businessId: 'biz-1',
        productId: 10,
        quantity: -1,
        referenceType: 'booking',
        referenceId: 'book-1'
    };

    it('recordSaleEffect validates its input shape, then throws a reserved (501) DomainError', () => {
        expect.assertions(2);
        try {
            recordSaleEffect(validSaleInput);
        } catch (error) {
            expect(error.statusCode).toBe(501);
            expect(error.details.error_code).toBe('RESERVED_EFFECT_NOT_IMPLEMENTED');
        }
    });

    it('recordSaleEffect rejects a malformed input (missing businessId) before the reserved throw', () => {
        expect.assertions(1);
        try {
            recordSaleEffect({});
        } catch (error) {
            expect(error.code).toBe('VALIDATION_FAILED');
        }
    });

    it('recordBookingEffect validates its input shape, then throws a reserved (501) DomainError', () => {
        expect.assertions(2);
        try {
            recordBookingEffect(validBookingInput);
        } catch (error) {
            expect(error.statusCode).toBe(501);
            expect(error.details.error_code).toBe('RESERVED_EFFECT_NOT_IMPLEMENTED');
        }
    });

    it('recordBookingEffect rejects a malformed input (missing quantity) before the reserved throw', () => {
        expect.assertions(1);
        try {
            recordBookingEffect({ ...validBookingInput, quantity: 0 });
        } catch (error) {
            expect(error.code).toBe('VALIDATION_FAILED');
        }
    });
});
