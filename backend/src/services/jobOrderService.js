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
  const { page = 1, limit = 20, status, archived = 'false' } = queryParams;
  const offset = (page - 1) * limit;
  const where = {};

  // Filter archived JOs
  if (archived === 'true') {
    where.archived_at = { [Op.not]: null };
  } else {
    where.archived_at = null;
  }

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
        include: [
          { model: Item, as: 'item' },
          { model: FIFOBatch, as: 'batch' }
        ]
      }
    ]
  });

  if (!jo) {
    const error = new Error('Job order not found');
    error.statusCode = 404;
    throw error;
  }

  if (jo.status === 'completed') {
    const movements = await StockMovement.findAll({
      where: {
        reference_id: jo.jo_number,
        reference_type: 'JO',
        movement_type: 'production_consumption'
      },
      include: [{
        model: BatchTransaction,
        as: 'batchTransactions',
        include: [{ model: FIFOBatch, as: 'batch' }]
      }]
    });

    const movementsByItem = {};
    movements.forEach(m => {
      movementsByItem[m.item_id] = m.batchTransactions || [];
    });

    jo.ingredients.forEach(ing => {
      ing.dataValues.batchTransactions = movementsByItem[ing.item_id] || [];
    });
  }

  return jo;
};

export const createJobOrder = async (joData, userId) => {
  const { ingredients, ...joMainData } = joData;

  // Only generate JO number if not a draft
  const isDraft = joData.status === 'draft' || !joData.status;
  const joNumber = isDraft ? null : `JO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  // NEW: Validate stock for non-draft JOs
  if (!isDraft && ingredients && ingredients.length > 0) {
    const insufficientIngredients = [];

    for (const ing of ingredients) {
      // Fetch current stock from database
      const item = await Item.findByPk(ing.item_id, {
        attributes: ['item_id', 'name', 'current_stock', 'unit_of_measure']
      });

      if (!item) {
        const error = new Error(`Ingredient not found: ${ing.item_id}`);
        error.statusCode = 404;
        throw error;
      }

      const currentStock = parseFloat(item.current_stock);
      const requiredQty = parseFloat(ing.quantity_required);

      if (currentStock < requiredQty) {
        insufficientIngredients.push({
          item_name: item.name,
          required: requiredQty,
          available: currentStock,
          unit: item.unit_of_measure,
          shortage: requiredQty - currentStock
        });
      }
    }

    // If any ingredients have insufficient stock, reject the creation
    if (insufficientIngredients.length > 0) {
      const error = new Error('Cannot create job order: Insufficient stock for ingredients');
      error.statusCode = 400;
      error.insufficientIngredients = insufficientIngredients;
      throw error;
    }
  }

  const jo = await JobOrder.create({
    ...joMainData,
    jo_number: joNumber,
    responsible_user: userId,
    status: isDraft ? 'draft' : 'in_progress'
  });

  if (ingredients && ingredients.length > 0) {
    await Promise.all(
      ingredients.map(ing => JOIngredient.create({
        jo_id: jo.jo_id,
        item_id: ing.item_id,
        quantity_required: ing.quantity_required,
        quantity_consumed: ing.quantity_consumed || null,
        stock_before: ing.stock_before || null,
        stock_after: ing.stock_after || null
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

  // NEW: Validate stock before finalizing draft
  const insufficientIngredients = [];

  // Reload ingredients with item details
  const joWithIngredients = await JobOrder.findByPk(joId, {
    include: [
      {
        model: JOIngredient,
        as: 'ingredients',
        include: [{
          model: Item,
          as: 'item',
          attributes: ['item_id', 'name', 'current_stock', 'unit_of_measure']
        }]
      }
    ]
  });

  for (const ingredient of joWithIngredients.ingredients) {
    const item = ingredient.item;
    const currentStock = parseFloat(item.current_stock);
    const requiredQty = parseFloat(ingredient.quantity_required);

    if (currentStock < requiredQty) {
      insufficientIngredients.push({
        item_name: item.name,
        required: requiredQty,
        available: currentStock,
        unit: item.unit_of_measure,
        shortage: requiredQty - currentStock
      });
    }
  }

  if (insufficientIngredients.length > 0) {
    const error = new Error('Cannot finalize job order: Insufficient stock for ingredients');
    error.statusCode = 400;
    error.insufficientIngredients = insufficientIngredients;
    throw error;
  }

  // Generate JO number
  const joNumber = `JO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  // Update status to in_progress and add JO number
  await jo.update({
    status: 'in_progress',
    jo_number: joNumber
  });

  return jo;
};

export const completeJobOrder = async (joId, userId, expiryDateOverride = null, notes = null) => {
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
      const error = new Error(`Insufficient stock for ${item.name}. Required: ${quantityRequired} ${item.unit_of_measure}, Available: ${stockBefore} ${item.unit_of_measure}`);
      error.statusCode = 400;
      throw error;
    }

    // Create stock movement FIRST (before FIFO consumption)
    const movement = await StockMovement.create({
      item_id: item.item_id,
      movement_type: 'production_consumption',
      quantity: -quantityRequired,
      reference_id: jo.jo_number,
      reference_type: 'JO',
      user_responsible: userId
    });

    // FIFO consumption
    let primaryBatchId = null; // Track the first batch consumed for this ingredient
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

        // Track the first batch used (for jo_ingredient.batch_id)
        if (primaryBatchId === null) {
          primaryBatchId = batch.batch_id;
        }

        await batch.update({
          quantity_consumed: parseFloat(batch.quantity_consumed) + consume
        });

        // Create BatchTransaction with valid movement_id
        await BatchTransaction.create({
          movement_id: movement.movement_id, // ✅ Use movement_id from above
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

    // Update ingredient record with batch reference
    await ingredient.update({
      quantity_consumed: quantityRequired,
      stock_before: stockBefore,
      stock_after: stockAfter,
      batch_id: primaryBatchId // Store which batch was primarily consumed
    });
  }

  // Add finished product to stock
  const product = jo.product;
  const quantityProduced = parseFloat(jo.quantity_to_produce);
  await product.update({
    current_stock: parseFloat(product.current_stock) + quantityProduced
  });

  // Create FIFO batch for finished product if FIFO enabled
  let productBatchId = null;
  let productExpiryDate = null;
  if (product.fifo_enabled) {
    const productionDate = new Date();

    // Calculate expiry from product's shelf_life_days or use override
    if (expiryDateOverride) {
      productExpiryDate = expiryDateOverride;
    } else if (product.shelf_life_days) {
      const expiryDateObj = new Date(productionDate);
      expiryDateObj.setDate(expiryDateObj.getDate() + product.shelf_life_days);
      productExpiryDate = expiryDateObj.toISOString().split('T')[0];
    }

    const productBatch = await FIFOBatch.create({
      item_id: product.item_id,
      quantity: quantityProduced,
      cost_per_unit: product.cost_per_unit,
      received_date: productionDate,
      expiry_date: productExpiryDate,
      po_number: jo.jo_number, // Use JO number as reference
      notes: notes || null
    });
    productBatchId = productBatch.batch_id;
  }

  // Create stock movement for finished product
  await StockMovement.create({
    item_id: product.item_id,
    movement_type: 'purchase_receipt',
    quantity: quantityProduced,
    reference_id: jo.jo_number,
    reference_type: 'JO',
    user_responsible: userId,
    batch_id: productBatchId,
    expiry_date: productExpiryDate
  });

  // Update JO status and save notes
  await jo.update({
    status: 'completed',
    completion_date: new Date(),
    completed_by: userId,
    notes: notes || jo.notes || null
  });

  // Reload JO with all associations including item details
  const completedJO = await JobOrder.findByPk(jo.jo_id, {
    include: [
      {
        model: JOIngredient,
        as: 'ingredients',
        include: [{
          model: Item,
          as: 'item',
          attributes: ['item_id', 'name', 'unit_of_measure']
        }]
      },
      {
        model: Item,
        as: 'product',
        attributes: ['item_id', 'name', 'unit_of_measure']
      }
    ]
  });

  // Transform ingredients to match frontend expectations
  const ingredientsConsumed = completedJO.ingredients.map(ing => ({
    item_id: ing.item_id,
    item_name: ing.item?.name || 'Unknown',
    unit_of_measure: ing.item?.unit_of_measure || '',
    quantity_required: parseFloat(ing.quantity_required),
    quantity_consumed: parseFloat(ing.quantity_consumed),
    stock_before: parseFloat(ing.stock_before),
    stock_after: parseFloat(ing.stock_after),
    batch_info: ing.batch ? {
      batch_id: ing.batch.batch_id,
      expiry_date: ing.batch.expiry_date,
      po_number: ing.batch.po_number
    } : null
  }));

  // Return enriched data
  return {
    ...completedJO.toJSON(),
    ingredients_consumed: ingredientsConsumed
  };
};

export const archiveJobOrder = async (joId, userId) => {
  const jo = await JobOrder.findByPk(joId);

  if (!jo) {
    const error = new Error('Job Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (jo.archived_at) {
    const error = new Error('Job Order is already archived');
    error.statusCode = 400;
    throw error;
  }

  await jo.update({
    archived_at: new Date(),
    archived_by: userId
  });

  return jo;
};

export const restoreJobOrder = async (joId) => {
  const jo = await JobOrder.findByPk(joId);

  if (!jo) {
    const error = new Error('Job Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (!jo.archived_at) {
    const error = new Error('Job Order is not archived');
    error.statusCode = 400;
    throw error;
  }

  await jo.update({
    archived_at: null,
    archived_by: null
  });

  return jo;
};
