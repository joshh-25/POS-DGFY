import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { createStockMovement, voidParkedSaleGoodsIssue } from '../src/services/stockMovementService.js';
import { returnStockForVoidedSale } from '../src/modules/inventory/commands/stockCommandService.js';

describe('stockMovementService service-mode guard', () => {
  let getSpy;

  beforeEach(() => {
    getSpy = jest.spyOn(dbStore, 'get');
  });

  afterEach(() => {
    getSpy.mockRestore();
  });

  it('rejects manual stock movements for pure service rows', async () => {
    const serviceItem = {
      item_id: 501,
      name: 'Barber Cut',
      category: 'product',
      mode_item_preset: 'service',
      current_stock: 0
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(serviceItem)
    };

    getSpy.mockImplementation((name) => {
      if (name === 'Item') return Item;
      return {};
    });

    await expect(createStockMovement({
      item_id: 501,
      movement_type: 'adjustment',
      quantity: 1
    }, 7, { LOCK: { UPDATE: 'UPDATE' } })).rejects.toMatchObject({
      statusCode: 422,
      message: 'Pure service items are stock-exempt and cannot have stock movements.'
    });
  });

  it('allows an online fulfillment movement to read an inactive historical item row', async () => {
    const historicalItem = {
      item_id: 502,
      name: 'Deleted Menu Item',
      category: 'product',
      mode_item_preset: 'service',
      status: 'inactive',
      deleted_at: new Date(),
      current_stock: 0
    };
    const Item = {
      findOne: jest.fn().mockResolvedValue(historicalItem)
    };

    getSpy.mockImplementation((name) => {
      if (name === 'Item') return Item;
      return {};
    });

    await expect(createStockMovement({
      item_id: 502,
      quantity: 1,
      movement_type: 'goods_issue',
      reference_type: 'POS',
      reference_id: 'ONLINE:902:1'
    }, 7, { LOCK: { UPDATE: 'UPDATE' } }, {
      allowInactiveHistoricalItem: true
    })).rejects.toMatchObject({
      statusCode: 422,
      message: 'Pure service items are stock-exempt and cannot have stock movements.'
    });

    expect(Item.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { item_id: 502 }
    }));
  });

  const buildStockMovementModels = ({ item }) => {
    const Item = {
      findOne: jest.fn().mockResolvedValue(item)
    };
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const models = {
      Item,
      SystemSetting: { findOne: jest.fn().mockResolvedValue(null) },
      TenantLocation: { findAll: jest.fn().mockResolvedValue([]) },
      User: { findByPk: jest.fn().mockResolvedValue(null) },
      UserLocationGrant: { findAll: jest.fn().mockResolvedValue([]) },
      ItemLocationStock: { findOne: jest.fn().mockResolvedValue(null) },
      FIFOBatch: { findAll: jest.fn(), findByPk: jest.fn() },
      BatchTransaction: { create: jest.fn() },
      StockMovement: { create: jest.fn().mockResolvedValue({ movement_id: 900 }) }
    };

    getSpy.mockImplementation((name) => models[name]);
    return { Item, transaction };
  };

  const makeHistoricalStockItem = (overrides = {}) => ({
    item_id: 503,
    name: 'Deleted Menu Item',
    category: 'product',
    product_type: 'finished_goods',
    mode_item_preset: 'retail',
    status: 'inactive',
    deleted_at: new Date(),
    current_stock: 5,
    fifo_enabled: false,
    unit_of_measure: 'piece',
    cost_per_unit: 10,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides
  });

  it('allows an online goods issue for a soft-deleted stock-bearing item only', async () => {
    const { Item, transaction } = buildStockMovementModels({ item: makeHistoricalStockItem() });

    await expect(createStockMovement({
      item_id: 503,
      quantity: 1,
      movement_type: 'goods_issue',
      reference_type: 'POS',
      reference_id: 'ONLINE:903:1'
    }, 7, transaction, { allowInactiveHistoricalItem: true })).resolves.toMatchObject({
      movement_id: 900
    });

    expect(Item.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { item_id: 503 }
    }));
  });

  it('rejects a hard-deleted item even for an online fulfillment movement', async () => {
    const { Item, transaction } = buildStockMovementModels({ item: null });

    await expect(createStockMovement({
      item_id: 504,
      quantity: 1,
      movement_type: 'goods_issue',
      reference_type: 'POS',
      reference_id: 'ONLINE:904:1'
    }, 7, transaction, { allowInactiveHistoricalItem: true })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Item not found'
    });

    expect(Item.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { item_id: 504 }
    }));
  });

  it('rejects an unrelated inactive item even when the historical policy flag is supplied', async () => {
    const { Item, transaction } = buildStockMovementModels({ item: null });

    await expect(createStockMovement({
      item_id: 505,
      quantity: 1,
      movement_type: 'goods_issue',
      reference_type: 'POS',
      reference_id: 'MANUAL:505'
    }, 7, transaction, { allowInactiveHistoricalItem: true })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Item not found'
    });

    expect(Item.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        item_id: 505,
        deleted_at: null
      })
    }));
  });

  it('restores a POS void sale to its soft-deleted stock-bearing item', async () => {
    const archivedItem = makeHistoricalStockItem({ item_id: 506, current_stock: 2 });
    const { Item, transaction } = buildStockMovementModels({ item: archivedItem });

    await expect(returnStockForVoidedSale({
      item_id: 506,
      quantity: 2,
      movement_type: 'return',
      reference_type: 'POS',
      reference_id: '1606'
    }, 7, transaction)).resolves.toMatchObject({ movement_id: 900 });

    expect(Item.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { item_id: 506 }
    }));
    expect(archivedItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ current_stock: 4 }),
      expect.any(Object)
    );
  });

  it('reverses a parked-sale movement for an archived item using the supported archived-item policy', async () => {
    const archivedItem = makeHistoricalStockItem({ item_id: 507, current_stock: 2 });
    const originalMovement = {
      movement_id: 901,
      item_id: 507,
      movement_type: 'goods_issue',
      quantity: -1,
      reference_type: 'POS_PARKED_SALE',
      reference_id: 'PARKED:77:1:1',
      location_id: null,
      batch_id: null,
      batchTransactions: [],
      update: jest.fn().mockResolvedValue(undefined)
    };
    const createdReversal = { movement_id: 902 };
    const Item = { findOne: jest.fn().mockResolvedValue(archivedItem) };
    const StockMovement = {
      findAll: jest.fn().mockResolvedValue([originalMovement]),
      findByPk: jest.fn().mockResolvedValue(originalMovement),
      create: jest.fn().mockResolvedValue(createdReversal)
    };
    const models = {
      Item,
      StockMovement,
      FIFOBatch: { findByPk: jest.fn() },
      BatchTransaction: {},
      ItemLocationStock: { findOne: jest.fn(), create: jest.fn(), findAll: jest.fn().mockResolvedValue([]) }
    };
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    getSpy.mockImplementation((name) => models[name] || {});

    await expect(voidParkedSaleGoodsIssue({
      parkedSaleId: 77,
      userId: 7,
      reason: 'Approved parked sale cancellation',
      transaction
    })).resolves.toEqual([expect.objectContaining({
      original_movement_id: 901,
      reversal_movement_id: 902,
      item_id: 507
    })]);

    expect(Item.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { item_id: 507 } }));
    expect(archivedItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ current_stock: 3 }),
      expect.any(Object)
    );
  });
});
