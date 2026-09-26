import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';
import { getItemsCostMetrics, getWeightedInventoryValueOverview } from '../modules/inventory/services/costValuationService.js';
import { buildStockHealthWhere, STOCK_HEALTH_STATUS, getStockHealthStatus } from '../modules/inventory/services/inventoryHealthService.js';
import { buildStockBearingItemWhere } from '../modules/shared/utils/stockBearingPolicy.js';

export const getDashboardStats = async () => {
  const Item = dbStore.get('Item');
  const PurchaseOrder = dbStore.get('PurchaseOrder');
  const JobOrder = dbStore.get('JobOrder');
  const DispatchOrder = dbStore.get('DispatchOrder');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  // Run all queries in parallel instead of sequentially
  const [
    totalItems,
    lowStockItems,
    healthyStockItems,
    overStockItems,
    outOfStockItems,
    pendingPOs,
    activeJOs,
    pendingDispatchOrders,
    weightedOverview,
    itemsMissingCost,
    itemsWithZeroStock
  ] = await Promise.all([
    Item.count({ where: buildVisibleWhere({ status: 'active' }) }),

    Item.count({
      where: buildStockBearingItemWhere(buildVisibleWhere({
        status: 'active',
        [Op.and]: [buildStockHealthWhere({
          status: STOCK_HEALTH_STATUS.LOW_STOCK,
          sequelize
        })]
      }))
    }),

    Item.count({
      where: buildStockBearingItemWhere(buildVisibleWhere({
        status: 'active',
        [Op.and]: [buildStockHealthWhere({
          status: STOCK_HEALTH_STATUS.HEALTHY,
          sequelize
        })]
      }))
    }),

    Item.count({
      where: buildStockBearingItemWhere(buildVisibleWhere({
        status: 'active',
        [Op.and]: [buildStockHealthWhere({
          status: STOCK_HEALTH_STATUS.OVERSTOCK,
          sequelize
        })]
      }))
    }),

    Item.count({
      where: buildStockBearingItemWhere(buildVisibleWhere({
        status: 'active',
        [Op.and]: [buildStockHealthWhere({
          status: STOCK_HEALTH_STATUS.OUT_OF_STOCK,
          sequelize
        })]
      }))
    }),

    PurchaseOrder.count({ where: { status: 'pending' } }),
    JobOrder.count({ where: { status: 'in_progress' } }),
    DispatchOrder.count({ where: { status: ['draft', 'confirmed', 'partial'], archived_at: null } }),

    getWeightedInventoryValueOverview(),

    // Data quality: items missing cost_per_unit
    Item.count({
      where: buildStockBearingItemWhere(buildVisibleWhere({
        status: 'active',
        [Op.or]: [{ cost_per_unit: null }, { cost_per_unit: 0 }]
      }))
    }),

    // Data quality: items with zero stock
    Item.count({
      where: buildStockBearingItemWhere(buildVisibleWhere({
        status: 'active',
        current_stock: 0
      }))
    })
  ]);

  const weightedTotalValue = Number(weightedOverview?.weighted_total_inventory_value || 0);
  const weightedAverageCostPerUnit = Number(weightedOverview?.weighted_average_cost_per_unit || 0);
  const weightedTotalAvailableQty = Number(weightedOverview?.weighted_total_available_qty || 0);
  const legacyTotalValue = Number(weightedOverview?.legacy_total_inventory_value || 0);

  // Return camelCase field names to match frontend expectations
  return {
    totalItems,
    lowStockCount: lowStockItems,
    healthyCount: healthyStockItems,
    overStockCount: overStockItems,
    outOfStockCount: outOfStockItems,
    totalValue: weightedTotalValue,
    legacyTotalValue,
    weightedTotalValue,
    weightedAverageCostPerUnit,
    weightedTotalAvailableQty,
    inventoryValueDelta: Math.round((weightedTotalValue - legacyTotalValue) * 10000) / 10000,
    // Keep these for backward compatibility
    pending_purchase_orders: pendingPOs,
    active_job_orders: activeJOs,
    pending_dispatch_orders: pendingDispatchOrders,
    // Data quality metrics
    dataQuality: {
      items_missing_cost: itemsMissingCost,
      items_with_zero_stock: itemsWithZeroStock,
      items_with_cost_data: totalItems - itemsMissingCost
    }
  };
};

export const getLowStockItems = async () => {
  const Item = dbStore.get('Item');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  const items = await Item.findAll({
    where: buildStockBearingItemWhere(buildVisibleWhere({
      status: 'active',
      [Op.and]: [buildStockHealthWhere({
        statuses: [STOCK_HEALTH_STATUS.LOW_STOCK, STOCK_HEALTH_STATUS.OUT_OF_STOCK],
        sequelize
      })]
    })),
    order: [['current_stock', 'ASC']],
    limit: 20
  });

  return items.map(item => ({
    item_id: item.item_id,
    sku_code: item.sku_code,
    name: item.name,
    current_stock: item.current_stock,
    min_threshold: item.min_threshold,
    max_capacity: item.max_capacity,
    category: item.category,
    stock_status: getStockHealthStatus({
      currentStock: item.current_stock,
      minThreshold: item.min_threshold,
      maxCapacity: item.max_capacity
    })
  }));
};

export const getRecentMovements = async (limit = 10) => {
  const StockMovement = dbStore.get('StockMovement');
  const Item = dbStore.get('Item');
  const User = dbStore.get('User');

  const movements = await StockMovement.findAll({
    include: [
      { model: Item, as: 'item', attributes: ['name', 'sku_code'] },
      { model: User, as: 'userResponsible', attributes: ['username'] }
    ],
    order: [['timestamp', 'DESC']],
    limit: parseInt(limit)
  });

  return movements.map(m => ({
    id: m.movement_id,
    item_name: m.item?.name,
    movement_type: m.movement_type,
    quantity: m.quantity,
    created_date: m.timestamp,
    user_responsible: m.userResponsible?.username,
    reference_id: m.reference_id,
    notes: m.notes
  }));
};

export const getInventoryValueBreakdown = async ({ limit = 100, page = 1, sort = 'value_desc' } = {}) => {
  const Item = dbStore.get('Item');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  const parsedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 100;
  const cappedLimit = Math.min(parsedLimit, 200);
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Math.floor(Number(page)) : 1;
  const offset = (safePage - 1) * cappedLimit;

  const valueItemWhere = buildStockBearingItemWhere(buildVisibleWhere({
    status: 'active',
    current_stock: { [Op.gt]: 0 },
    cost_per_unit: { [Op.gt]: 0 }
  }));

  // The inventory cost service is authoritative for the grand total. Keep the
  // legacy item filter for pagination compatibility, but do not recalculate
  // valuation here with a second current_stock * cost_per_unit formula.
  const [weightedOverview, totalMatchingItems] = await Promise.all([
    getWeightedInventoryValueOverview(),
    Item.count({ where: valueItemWhere })
  ]);
  const grandTotal = Number(weightedOverview?.weighted_total_inventory_value || 0);

  // Determine sort order
  const orderMap = {
    value_desc: [[sequelize.literal('current_stock * cost_per_unit'), 'DESC']],
    value_asc: [[sequelize.literal('current_stock * cost_per_unit'), 'ASC']],
    name_asc: [['name', 'ASC']],
    stock_desc: [['current_stock', 'DESC']]
  };
  const orderClause = orderMap[sort] || orderMap.value_desc;

  // Fetch the paginated slice
  const items = await Item.findAll({
    where: valueItemWhere,
    attributes: ['item_id', 'sku_code', 'name', 'category', 'current_stock',
      'unit_of_measure', 'cost_per_unit'],
    order: orderClause,
    limit: cappedLimit,
    offset
  });

  const metricsByItem = await getItemsCostMetrics({ items });

  const rows = items.map(item => {
    const itemId = Number(item.item_id);
    const metrics = metricsByItem.get(itemId)?.global;
    const stock = Number(metrics?.available_qty ?? item.current_stock) || 0;
    const cost = parseFloat(item.cost_per_unit) || 0;
    const value = Math.round(Number(metrics?.inventory_value ?? (stock * cost)) * 100) / 100;
    return {
      item_id: item.item_id,
      sku_code: item.sku_code,
      name: item.name,
      category: item.category,
      current_stock: stock,
      unit: item.unit_of_measure,
      cost_per_unit: cost,
      total_value: value
    };
  });

  // Data quality counts for transparency
  const [totalActive, missingCost, zeroStock] = await Promise.all([
    Item.count({ where: buildStockBearingItemWhere(buildVisibleWhere({ status: 'active' })) }),
    Item.count({
      where: buildStockBearingItemWhere(buildVisibleWhere({
        status: 'active',
        [Op.or]: [{ cost_per_unit: null }, { cost_per_unit: 0 }]
      }))
    }),
    Item.count({
      where: buildStockBearingItemWhere(buildVisibleWhere({
        status: 'active',
        current_stock: 0
      }))
    })
  ]);

  const totalPages = Math.ceil(totalMatchingItems / cappedLimit);

  return {
    items: rows,
    grand_total: Math.round(grandTotal * 100) / 100,
    pagination: {
      page: safePage,
      limit: cappedLimit,
      total_items: totalMatchingItems,
      total_pages: totalPages,
      has_next: safePage < totalPages,
      has_previous: safePage > 1
    },
    data_quality: {
      total_active_items: totalActive,
      items_missing_cost: missingCost,
      items_with_zero_stock: zeroStock,
      items_included_in_total: totalMatchingItems
    }
  };
};
