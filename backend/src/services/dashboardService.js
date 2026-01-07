import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Item from '../models/Item.js';
import StockMovement from '../models/StockMovement.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import JobOrder from '../models/JobOrder.js';
import User from '../models/User.js';

export const getDashboardStats = async () => {
  const totalItems = await Item.count({ where: { status: 'active' } });

  const lowStockItems = await Item.count({
    where: {
      status: 'active',
      [Op.and]: [
        sequelize.where(
          sequelize.col('current_stock'),
          Op.lte,
          sequelize.col('min_threshold')
        )
      ]
    }
  });

  // Calculate healthy stock (items with stock between min threshold and max capacity)
  const healthyStockItems = await Item.count({
    where: {
      status: 'active',
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
    }
  });

  // Calculate overstock (items exceeding max capacity)
  const overStockItems = await Item.count({
    where: {
      status: 'active',
      [Op.and]: [
        sequelize.where(
          sequelize.col('current_stock'),
          Op.gt,
          sequelize.col('max_capacity')
        )
      ]
    }
  });

  const pendingPOs = await PurchaseOrder.count({ where: { status: 'pending' } });
  const activeJOs = await JobOrder.count({ where: { status: 'in_progress' } });

  // Calculate total inventory value
  // Optimized to use Database Aggregation to avoid fetching all items
  const inventoryValueResult = await Item.findAll({
    where: { status: 'active' },
    attributes: [
      [sequelize.fn('SUM', sequelize.literal('current_stock * cost_per_unit')), 'total_value']
    ],
    raw: true
  });

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
    active_job_orders: activeJOs
  };
};

export const getLowStockItems = async () => {
  const items = await Item.findAll({
    where: {
      status: 'active',
      [Op.and]: [
        sequelize.where(
          sequelize.col('current_stock'),
          Op.lte,
          sequelize.col('min_threshold')
        )
      ]
    },
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

