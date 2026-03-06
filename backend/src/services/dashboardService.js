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
    inventoryValueResult
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
    pending_dispatch_orders: pendingDispatchOrders
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

