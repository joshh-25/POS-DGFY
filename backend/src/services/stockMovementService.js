import { Op } from 'sequelize';
import StockMovement from '../models/StockMovement.js';
import Item from '../models/Item.js';
import User from '../models/User.js';

export const getStockMovements = async (queryParams) => {
  const {
    page = 1,
    limit = 20,
    item_id,
    movement_type,
    startDate,
    endDate
  } = queryParams;

  const offset = (page - 1) * limit;
  const where = {};

  if (item_id) where.item_id = item_id;
  if (movement_type) where.movement_type = movement_type;
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[Op.gte] = new Date(startDate);
    if (endDate) where.timestamp[Op.lte] = new Date(endDate);
  }

  const { count, rows } = await StockMovement.findAndCountAll({
    where,
    include: [
      { model: Item, as: 'item', attributes: ['name', 'sku_code'] },
      { model: User, as: 'userResponsible', attributes: ['username'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['timestamp', 'DESC']]
  });

  return {
    movements: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  };
};

export const createStockMovement = async (movementData, userId) => {
  const { item_id, quantity, movement_type } = movementData;
  
  const item = await Item.findByPk(item_id);
  if (!item) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  // Update item stock based on movement type
  const currentStock = parseFloat(item.current_stock);
  let newStock = currentStock;

  if (movement_type === 'purchase_receipt' || movement_type === 'return') {
    newStock = currentStock + parseFloat(quantity);
  } else if (movement_type === 'production_consumption' || movement_type === 'calculated_loss') {
    newStock = currentStock - parseFloat(quantity);
    if (newStock < 0) {
      const error = new Error('Insufficient stock');
      error.statusCode = 400;
      throw error;
    }
  }

  await item.update({ current_stock: newStock });

  const movement = await StockMovement.create({
    ...movementData,
    user_responsible: userId
  });

  return movement;
};

