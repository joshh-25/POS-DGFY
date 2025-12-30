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
  const pendingPOs = await PurchaseOrder.count({ where: { status: 'pending' } });
  const activeJOs = await JobOrder.count({ where: { status: 'in_progress' } });

  // Calculate total inventory value
  const items = await Item.findAll({
    where: { status: 'active' },
    attributes: ['current_stock', 'cost_per_unit']
  });

  const totalValue = items.reduce((sum, item) => {
    const stock = parseFloat(item.current_stock) || 0;
    const cost = parseFloat(item.cost_per_unit) || 0;
    return sum + (stock * cost);
  }, 0);

  return {
    total_items: totalItems,
    low_stock_items: lowStockItems,
    pending_purchase_orders: pendingPOs,
    active_job_orders: activeJOs,
    total_inventory_value: totalValue
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
    max_capacity: item.max_capacity
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
    movement_id: m.movement_id,
    item_name: m.item?.name,
    movement_type: m.movement_type,
    quantity: m.quantity,
    timestamp: m.timestamp,
    user_responsible: m.userResponsible?.username
  }));
};

