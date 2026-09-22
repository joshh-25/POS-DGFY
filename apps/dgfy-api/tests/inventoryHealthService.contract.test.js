import { Op } from 'sequelize';
import {
  buildStockHealthWhere,
  buildStockHealthSqlCase,
  classifyExpiry,
  getStockHealthCounts,
  getStockHealthStatus,
  STOCK_HEALTH_STATUS
} from '../src/modules/inventory/services/inventoryHealthService.js';

describe('inventory health contract', () => {
  const sequelize = {
    col: (name) => ({ column: name }),
    where: (column, operator, value) => ({ column, operator, value })
  };

  it('classifies stock with exclusive out-of-stock precedence', () => {
    expect(getStockHealthStatus({ currentStock: 0, minThreshold: 5, maxCapacity: 20 }))
      .toBe(STOCK_HEALTH_STATUS.OUT_OF_STOCK);
    expect(getStockHealthStatus({ currentStock: 4, minThreshold: 5, maxCapacity: 20 }))
      .toBe(STOCK_HEALTH_STATUS.LOW_STOCK);
    expect(getStockHealthStatus({ currentStock: 10, minThreshold: 5, maxCapacity: 20 }))
      .toBe(STOCK_HEALTH_STATUS.HEALTHY);
    expect(getStockHealthStatus({ currentStock: 21, minThreshold: 5, maxCapacity: 20 }))
      .toBe(STOCK_HEALTH_STATUS.OVERSTOCK);
    expect(getStockHealthStatus({ currentStock: 10 }))
      .toBe(STOCK_HEALTH_STATUS.UNCONFIGURED);
  });

  it('summarizes the same statuses used by downstream readers', () => {
    expect(getStockHealthCounts([
      { current_stock: 0, min_threshold: 2, max_capacity: 10 },
      { current_stock: 1, min_threshold: 2, max_capacity: 10 },
      { current_stock: 5, min_threshold: 2, max_capacity: 10 },
      { current_stock: 11, min_threshold: 2, max_capacity: 10 },
      { current_stock: 5 }
    ])).toEqual({
      low_stock: 1,
      out_of_stock: 1,
      healthy: 1,
      overstock: 1,
      unconfigured: 1
    });
  });

  it('builds one predicate for a single status and one OR for an attention queue', () => {
    const lowWhere = buildStockHealthWhere({
      status: STOCK_HEALTH_STATUS.LOW_STOCK,
      sequelize
    });
    expect(lowWhere[Op.and]).toHaveLength(3);

    const attentionWhere = buildStockHealthWhere({
      statuses: [STOCK_HEALTH_STATUS.LOW_STOCK, STOCK_HEALTH_STATUS.OUT_OF_STOCK],
      sequelize,
      stockColumn: 'quantity_on_hand',
      minColumn: 'item.min_threshold',
      maxColumn: 'item.max_capacity'
    });
    expect(attentionWhere[Op.or]).toHaveLength(2);
  });

  it('uses the shared expiry buckets for alerts and reports', () => {
    expect(classifyExpiry({ daysUntilExpiry: -1, criticalDays: 7, warningDays: 14, upcomingDays: 30 }))
      .toBe('expired');
    expect(classifyExpiry({ daysUntilExpiry: 7, criticalDays: 7, warningDays: 14, upcomingDays: 30 }))
      .toBe('critical');
    expect(classifyExpiry({ daysUntilExpiry: 14, criticalDays: 7, warningDays: 14, upcomingDays: 30 }))
      .toBe('warning');
    expect(classifyExpiry({ daysUntilExpiry: 30, criticalDays: 7, warningDays: 14, upcomingDays: 30 }))
      .toBe('upcoming');
    expect(classifyExpiry({ daysUntilExpiry: 31, criticalDays: 7, warningDays: 14, upcomingDays: 30 }))
      .toBeNull();
  });

  it('can preserve a legacy report label without duplicating health conditions', () => {
    const expression = buildStockHealthSqlCase({
      stockExpression: 'COALESCE(MAX(stock.quantity_on_hand), 0)',
      minExpression: 'i.min_threshold',
      maxExpression: 'i.max_capacity',
      labels: { healthy: 'in_stock', overstock: 'in_stock', unconfigured: 'in_stock' }
    });

    expect(expression).toContain("THEN 'out_of_stock'");
    expect(expression).toContain("THEN 'low_stock'");
    expect(expression).toContain("THEN 'in_stock'");
    expect(expression).toContain('i.max_capacity');
  });
});
