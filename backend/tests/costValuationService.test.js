import dbStore from '../src/utils/dbStore.js';
import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import {
  getWeightedInventoryValueOverview,
  getItemsCostMetrics,
  getItemCostMetricsByLocation,
  invalidateItemCostMetricsCache
} from '../src/modules/inventory/services/costValuationService.js';

describe('costValuationService', () => {
  let getSpy;
  let getStoreSpy;

  const sequelizeStub = {
    fn: jest.fn((name, value) => ({ name, value })),
    literal: jest.fn((sql) => ({ sql })),
    where: jest.fn((...args) => ({ args })),
    col: jest.fn((name) => ({ name }))
  };

  beforeEach(() => {
    jest.clearAllMocks();
    invalidateItemCostMetricsCache({ tenantId: 'system' });
    getSpy = jest.spyOn(dbStore, 'get');
    getStoreSpy = jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize: sequelizeStub });
  });

  afterEach(() => {
    getSpy.mockRestore();
    getStoreSpy.mockRestore();
  });

  it('computes global weighted metrics from open FIFO balances', async () => {
    const FIFOBatch = {
      findAll: jest.fn().mockResolvedValue([
        { item_id: 11, batch_qty: '12', batch_value: '108' }
      ])
    };

    getSpy.mockImplementation((name) => {
      if (name === 'FIFOBatch') return FIFOBatch;
      return {};
    });

    const result = await getItemsCostMetrics({
      items: [{ item_id: 11, current_stock: 15, cost_per_unit: 10, fifo_enabled: true }]
    });

    expect(result.get(11)).toEqual({
      global: {
        available_qty: 12,
        weighted_avg_cost: 9,
        inventory_value: 108,
        source: 'fifo_batches',
        diagnostics: {
          ledger_qty: 15,
          batch_qty: 12,
          drift_qty: 3,
          has_drift: true,
          tolerance: 0.0001
        }
      }
    });
  });

  it('deduplicates item ids before aggregate queries', async () => {
    const FIFOBatch = {
      findAll: jest.fn().mockResolvedValue([])
    };

    getSpy.mockImplementation((name) => {
      if (name === 'FIFOBatch') return FIFOBatch;
      return {};
    });

    await getItemsCostMetrics({
      items: [
        { item_id: 11, current_stock: 5, cost_per_unit: 2 },
        { item_id: 11, current_stock: 5, cost_per_unit: 2 }
      ]
    });

    const whereArgs = FIFOBatch.findAll.mock.calls[0][0].where;
    expect(whereArgs.item_id[Op.in]).toEqual([11]);
  });

  it('falls back to item cost for scoped metrics when no open batches exist', async () => {
    const FIFOBatch = {
      findAll: jest.fn().mockResolvedValue([])
    };
    const ItemLocationStock = {
      findAll: jest.fn().mockResolvedValue([
        { item_id: 22, quantity_on_hand: '5' }
      ])
    };

    getSpy.mockImplementation((name) => {
      if (name === 'FIFOBatch') return FIFOBatch;
      if (name === 'ItemLocationStock') return ItemLocationStock;
      return {};
    });

    // fifo_enabled: false — a count_ledger item never has batch rows by
    // design, so batch_qty: 0 here is normal, not drift (see bug 6 fix).
    const result = await getItemsCostMetrics({
      items: [{ item_id: 22, current_stock: 9, cost_per_unit: 4, fifo_enabled: false }],
      locationId: 3
    });

    expect(result.get(22)).toEqual({
      global: {
        available_qty: 9,
        weighted_avg_cost: 4,
        inventory_value: 36,
        source: 'item_cost_fallback',
        diagnostics: {
          ledger_qty: 9,
          batch_qty: 0,
          drift_qty: 9,
          has_drift: false,
          tolerance: 0.0001
        }
      },
      scoped: {
        location_id: 3,
        available_qty: 5,
        weighted_avg_cost: 4,
        inventory_value: 20,
        source: 'item_cost_fallback',
        diagnostics: {
          ledger_qty: 5,
          batch_qty: 0,
          drift_qty: 5,
          has_drift: false,
          tolerance: 0.0001
        }
      }
    });
  });

  it('flags real drift for a FIFO-enabled item whose open batches are fully depleted', async () => {
    const FIFOBatch = {
      findAll: jest.fn().mockResolvedValue([])
    };
    const ItemLocationStock = {
      findAll: jest.fn().mockResolvedValue([])
    };

    getSpy.mockImplementation((name) => {
      if (name === 'FIFOBatch') return FIFOBatch;
      if (name === 'ItemLocationStock') return ItemLocationStock;
      return {};
    });

    // A FIFO-tracked item with ledger stock but zero open batches is a real
    // integrity problem — unlike a count_ledger item, it should have batches.
    const result = await getItemsCostMetrics({
      items: [{ item_id: 23, current_stock: 6, cost_per_unit: 4, fifo_enabled: true }]
    });

    expect(result.get(23).global.diagnostics).toEqual({
      ledger_qty: 6,
      batch_qty: 0,
      drift_qty: 6,
      has_drift: true,
      tolerance: 0.0001
    });
  });

  it('returns by-location metrics and handles missing rollup rows safely', async () => {
    const ItemLocationStock = {
      findAll: jest.fn().mockResolvedValue(undefined)
    };
    const FIFOBatch = {
      findAll: jest.fn().mockResolvedValue(undefined)
    };

    getSpy.mockImplementation((name) => {
      if (name === 'ItemLocationStock') return ItemLocationStock;
      if (name === 'FIFOBatch') return FIFOBatch;
      return {};
    });

    await expect(
      getItemCostMetricsByLocation({
        item: { item_id: 33, cost_per_unit: 7 }
      })
    ).resolves.toEqual([]);
  });

  it('excludes pure services from inventory valuation overview queries', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([
        { item_id: 22, current_stock: 4, cost_per_unit: 15, category: 'product', mode_item_preset: null }
      ])
    };
    const FIFOBatch = {
      findAll: jest.fn().mockResolvedValue([])
    };

    getSpy.mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'FIFOBatch') return FIFOBatch;
      return {};
    });

    const result = await getWeightedInventoryValueOverview();

    expect(result.legacy_total_inventory_value).toBe(60);
    expect(Item.findAll).toHaveBeenCalledWith(expect.objectContaining({
      attributes: expect.arrayContaining(['category', 'mode_item_preset'])
    }));
    expect(Item.findAll.mock.calls[0][0].where[Op.and]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        [Op.or]: expect.arrayContaining([
          { category: { [Op.ne]: 'service' } },
          { category: null }
        ])
      }),
      expect.objectContaining({
        [Op.or]: expect.arrayContaining([
          { mode_item_preset: { [Op.ne]: 'service' } },
          { mode_item_preset: null }
        ])
      })
    ]));
  });

  it('invalidates cached valuation metrics for matching items', async () => {
    const FIFOBatch = {
      findAll: jest.fn().mockResolvedValue([])
    };
    getStoreSpy.mockReturnValue({ sequelize: sequelizeStub, tenantId: 'tenant-a' });

    getSpy.mockImplementation((name) => {
      if (name === 'FIFOBatch') return FIFOBatch;
      return {};
    });

    await getItemsCostMetrics({
      items: [{ item_id: 99, current_stock: 1, cost_per_unit: 3 }]
    });
    expect(FIFOBatch.findAll).toHaveBeenCalledTimes(1);

    await getItemsCostMetrics({
      items: [{ item_id: 99, current_stock: 1, cost_per_unit: 3 }]
    });
    expect(FIFOBatch.findAll).toHaveBeenCalledTimes(1);

    invalidateItemCostMetricsCache({ itemIds: [99] });

    await getItemsCostMetrics({
      items: [{ item_id: 99, current_stock: 1, cost_per_unit: 3 }]
    });
    expect(FIFOBatch.findAll).toHaveBeenCalledTimes(2);
  });
});
