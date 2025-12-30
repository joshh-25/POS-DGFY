import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import JobOrder from '../models/JobOrder.js';
import JOIngredient from '../models/JOIngredient.js';
import Item from '../models/Item.js';
import User from '../models/User.js';
import FIFOBatch from '../models/FIFOBatch.js';
import StockMovement from '../models/StockMovement.js';
import BatchTransaction from '../models/BatchTransaction.js';

export const getJobOrders = async (queryParams) => {
  const { page = 1, limit = 20, status } = queryParams;
  const offset = (page - 1) * limit;
  const where = {};
  if (status) where.status = status;

  const { count, rows } = await JobOrder.findAndCountAll({
    where,
    include: [
      { model: Item, as: 'product', attributes: ['name', 'sku_code'] },
      { model: User, as: 'responsibleUser', attributes: ['username'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['created_date', 'DESC']]
  });

  return {
    job_orders: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  };
};

export const getJobOrderById = async (joId) => {
  const jo = await JobOrder.findByPk(joId, {
    include: [
      { model: Item, as: 'product' },
      { model: User, as: 'responsibleUser', attributes: ['username'] },
      {
        model: JOIngredient,
        as: 'ingredients',
        include: [{ model: Item, as: 'item' }]
      }
    ]
  });

  if (!jo) {
    const error = new Error('Job order not found');
    error.statusCode = 404;
    throw error;
  }

  return jo;
};

export const createJobOrder = async (joData, userId) => {
  const { ingredients, ...joMainData } = joData;

  // Only generate JO number if not a draft
  const isDraft = joData.status === 'draft' || !joData.status;
  const joNumber = isDraft ? null : `JO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  const jo = await JobOrder.create({
    ...joMainData,
    jo_number: joNumber,
    responsible_user: userId,
    created_by: userId,
    updated_by: userId,
    status: isDraft ? 'draft' : 'in_progress'
  });

  if (ingredients && ingredients.length > 0) {
    await Promise.all(
      ingredients.map(ing => JOIngredient.create({
        jo_id: jo.jo_id,
        ...ing
      }))
    );
  }

  return jo;
};

export const finalizeJobOrder = async (joId, userId) => {
  const jo = await JobOrder.findByPk(joId, {
    include: [
      { model: Item, as: 'product' },
      { model: JOIngredient, as: 'ingredients' }
    ]
  });

  if (!jo) {
    const error = new Error('Job order not found');
    error.statusCode = 404;
    throw error;
  }

  if (jo.status !== 'draft') {
    const error = new Error('Only draft job orders can be finalized');
    error.statusCode = 400;
    throw error;
  }

  // Validate required fields
  if (!jo.product_id) {
    const error = new Error('Product is required to finalize job order');
    error.statusCode = 422;
    throw error;
  }

  if (!jo.quantity_to_produce || jo.quantity_to_produce <= 0) {
    const error = new Error('Quantity to produce must be greater than 0');
    error.statusCode = 422;
    throw error;
  }

  // Generate JO number
  const joNumber = `JO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  // Update status to in_progress and add JO number
  await jo.update({
    status: 'in_progress',
    jo_number: joNumber,
    updated_by: userId
  });

  return jo;
};

export const completeJobOrder = async (joId, userId) => {
  const jo = await JobOrder.findByPk(joId, {
    include: [
      { model: Item, as: 'product' },
      {
        model: JOIngredient,
        as: 'ingredients',
        include: [{ model: Item, as: 'item' }]
      }
    ]
  });

  if (!jo) {
    const error = new Error('Job order not found');
    error.statusCode = 404;
    throw error;
  }

  if (jo.status === 'completed') {
    const error = new Error('Job order already completed');
    error.statusCode = 400;
    throw error;
  }

  // Process ingredients (FIFO consumption)
  for (const ingredient of jo.ingredients) {
    const item = ingredient.item;
    const quantityRequired = parseFloat(ingredient.quantity_required);
    const stockBefore = parseFloat(item.current_stock);

    if (stockBefore < quantityRequired) {
      const error = new Error(`Insufficient stock for ${item.name}`);
      error.statusCode = 400;
      throw error;
    }

    // FIFO consumption
    if (item.fifo_enabled) {
      let remaining = quantityRequired;
      const batches = await FIFOBatch.findAll({
        where: {
          item_id: item.item_id,
          [Op.and]: [
            sequelize.where(
              sequelize.col('quantity'),
              Op.gt,
              sequelize.col('quantity_consumed')
            )
          ]
        },
        order: [['received_date', 'ASC']]
      });

      for (const batch of batches) {
        if (remaining <= 0) break;
        const available = parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed);
        const consume = Math.min(remaining, available);
        
        await batch.update({
          quantity_consumed: parseFloat(batch.quantity_consumed) + consume
        });

        await BatchTransaction.create({
          movement_id: null, // Will be set after movement creation
          batch_id: batch.batch_id,
          quantity_consumed: consume,
          remaining_after: available - consume,
          cost_per_unit: batch.cost_per_unit
        });

        remaining -= consume;
      }
    }

    // Update stock
    const stockAfter = stockBefore - quantityRequired;
    await item.update({ current_stock: stockAfter });

    // Update ingredient record
    await ingredient.update({
      quantity_consumed: quantityRequired,
      stock_before: stockBefore,
      stock_after: stockAfter
    });

    // Create stock movement
    const movement = await StockMovement.create({
      item_id: item.item_id,
      movement_type: 'production_consumption',
      quantity: -quantityRequired,
      reference_id: jo.jo_number,
      reference_type: 'JO',
      user_responsible: userId
    });

    // Update batch transactions with movement_id
    if (item.fifo_enabled) {
      await BatchTransaction.update(
        { movement_id: movement.movement_id },
        { where: { movement_id: null, batch_id: { [Op.in]: batches.map(b => b.batch_id) } } }
      );
    }
  }

  // Add finished product to stock
  const product = jo.product;
  const quantityProduced = parseFloat(jo.quantity_to_produce);
  await product.update({
    current_stock: parseFloat(product.current_stock) + quantityProduced
  });

  // Create stock movement for finished product
  await StockMovement.create({
    item_id: product.item_id,
    movement_type: 'purchase_receipt',
    quantity: quantityProduced,
    reference_id: jo.jo_number,
    reference_type: 'JO',
    user_responsible: userId
  });

  // Update JO status
  await jo.update({
    status: 'completed',
    completion_date: new Date()
  });

  return jo;
};

