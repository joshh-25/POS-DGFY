import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';

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
    pendingPOs,
    activeJOs,
    pendingDispatchOrders,
    inventoryValueResult,
    itemsMissingCost,
    itemsWithZeroStock
  ] = await Promise.all([
    Item.count({ where: buildVisibleWhere({ status: 'active' }) }),

    Item.count({
      where: buildVisibleWhere({
        status: 'active',
        min_threshold: { [Op.ne]: null },
        [Op.and]: [
          sequelize.where(
            sequelize.col('current_stock'),
            Op.lte,
            sequelize.col('min_threshold')
          )
        ]
      })
    }),

    // Calculate healthy stock (items with stock between min threshold and max capacity)
    Item.count({
      where: buildVisibleWhere({
        status: 'active',
        min_threshold: { [Op.ne]: null },
        [Op.and]: [
          sequelize.where(
            sequelize.col('current_stock'),
            Op.gt,
            sequelize.col('min_threshold')
          ),
          sequelize.where(
            sequelize.col('current_stock'),
            Op.lte,
            sequelize.col('max_capacity')
          )
        ]
      })
    }),

    // Calculate overstock (items exceeding max capacity)
    Item.count({
      where: buildVisibleWhere({
        status: 'active',
        [Op.and]: [
          sequelize.where(
            sequelize.col('current_stock'),
            Op.gt,
            sequelize.col('max_capacity')
          )
        ]
      })
    }),

    PurchaseOrder.count({ where: { status: 'pending' } }),
    JobOrder.count({ where: { status: 'in_progress' } }),
    DispatchOrder.count({ where: { status: ['draft', 'confirmed', 'partial'], archived_at: null } }),

    // Calculate total inventory value using DB aggregation
    Item.findAll({
      where: buildVisibleWhere({ status: 'active' }),
      attributes: [
        [sequelize.fn('SUM', sequelize.literal('current_stock * cost_per_unit')), 'total_value']
      ],
      raw: true
    }),

    // Data quality: items missing cost_per_unit
    Item.count({
      where: buildVisibleWhere({
        status: 'active',
        [Op.or]: [{ cost_per_unit: null }, { cost_per_unit: 0 }]
      })
    }),

    // Data quality: items with zero stock
    Item.count({
      where: buildVisibleWhere({
        status: 'active',
        current_stock: 0
      })
    })
  ]);

  const totalValue = parseFloat(inventoryValueResult[0]?.total_value || 0);

  // Return camelCase field names to match frontend expectations
  return {
    totalItems,
    lowStockCount: lowStockItems,
    healthyCount: healthyStockItems,
    overStockCount: overStockItems,
    totalValue,
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
    where: buildVisibleWhere({
      status: 'active',
      min_threshold: { [Op.ne]: null }, // Only include items with thresholds set
      [Op.and]: [
        sequelize.where(
          sequelize.col('current_stock'),
          Op.lte,
          sequelize.col('min_threshold')
        )
      ]
    }),
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
    category: item.category
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
  const parsedPage = Number.isFinite(Number(page)) && Number(page) > 0 ? Math.floor(Number(page)) : 1;
  const offset = (parsedPage - 1) * cappedLimit;

  const valueItemWhere = buildVisibleWhere({
    status: 'active',
    current_stock: { [Op.gt]: 0 },
    cost_per_unit: { [Op.gt]: 0 }
  });

  // Always compute the accurate grand total from ALL qualifying items (not paginated)
  const [grandTotalResult, totalMatchingItems] = await Promise.all([
    Item.findAll({
      where: valueItemWhere,
      attributes: [
        [sequelize.fn('SUM', sequelize.literal('current_stock * cost_per_unit')), 'total_value']
      ],
      raw: true
    }),
    Item.count({ where: valueItemWhere })
  ]);
  const grandTotal = parseFloat(grandTotalResult[0]?.total_value || 0);

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

  const rows = items.map(item => {
    const stock = parseFloat(item.current_stock) || 0;
    const cost = parseFloat(item.cost_per_unit) || 0;
    const value = Math.round(stock * cost * 100) / 100;
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
    Item.count({ where: buildVisibleWhere({ status: 'active' }) }),
    Item.count({
      where: buildVisibleWhere({
        status: 'active',
        [Op.or]: [{ cost_per_unit: null }, { cost_per_unit: 0 }]
      })
    }),
    Item.count({
      where: buildVisibleWhere({
        status: 'active',
        current_stock: 0
      })
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
