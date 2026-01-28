import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import JobOrder from '../models/JobOrder.js';
import JOIngredient from '../models/JOIngredient.js';
import Item from '../models/Item.js';
import User from '../models/User.js';
import FIFOBatch from '../models/FIFOBatch.js';
import StockMovement from '../models/StockMovement.js';
import BatchTransaction from '../models/BatchTransaction.js';
import { createStockMovement } from './stockMovementService.js';

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

export const completeJobOrder = async (joId, userId, expiryDateOverride = null, notes = null, quantityProduced = null) => {
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

  // Determine quantity to process in this transaction
  const currentQuantityProduced = parseFloat(jo.quantity_produced || 0);
  const totalQuantityToProduce = parseFloat(jo.quantity_to_produce);
  const remainingQuantity = totalQuantityToProduce - currentQuantityProduced;

  // If quantityProduced is not provided, assume full remaining quantity (legacy behavior)
  const qtyToProcess = quantityProduced ? parseFloat(quantityProduced) : remainingQuantity;

  // Validation
  if (qtyToProcess <= 0) {
    const error = new Error('Quantity to produce must be greater than 0');
    error.statusCode = 400;
    throw error;
  }

  if (qtyToProcess > remainingQuantity) {
    const error = new Error(`Cannot produce ${qtyToProcess}. Only ${remainingQuantity} remaining.`);
    error.statusCode = 400;
    throw error;
  }

  // Check if this is the final completion (allow for tiny float differences)
  const isFinalCompletion = Math.abs(qtyToProcess - remainingQuantity) < 0.001;

  // Calculate ratio for ingredient consumption
  // Avoid division by zero if totalQuantityToProduce is somehow 0 (should correspond to validation in create)
  const consumptionRatio = totalQuantityToProduce > 0 ? (qtyToProcess / totalQuantityToProduce) : 1;

  // Process ingredients (FIFO consumption)
  for (const ingredient of jo.ingredients) {
    const item = ingredient.item;
    const totalRequired = parseFloat(ingredient.quantity_required);

    // Calculate quantity to consume for this chunk
    let quantityToConsume;
    if (isFinalCompletion) {
      // For final completion, consume exactly what is left of the requirement to avoid rounding errors
      quantityToConsume = totalRequired - parseFloat(ingredient.quantity_consumed || 0);
    } else {
      quantityToConsume = totalRequired * consumptionRatio;
    }

    // Ensure we don't consume negative amounts (safety check)
    quantityToConsume = Math.max(0, quantityToConsume);

    const stockBefore = parseFloat(item.current_stock);

    if (stockBefore < quantityToConsume) {
      const error = new Error(`Insufficient stock for ${item.name}. Required: ${quantityToConsume.toFixed(2)} ${item.unit_of_measure}, Available: ${stockBefore.toFixed(2)} ${item.unit_of_measure}`);
      error.statusCode = 400;
      throw error;
    }

    // Use centralized service for consumption
    const movement = await createStockMovement({
      item_id: item.item_id,
      quantity: quantityToConsume,
      movement_type: 'production_consumption',
      reference_id: jo.jo_number,
      reference_type: 'JO',
      notes: `Partial production: ${qtyToProcess} units`,
      // batch_id could be passed if specific batch was selected, but for auto-FIFO we leave it null.
      // Ideally JO completion could allow manual batch selection, but for now we default to FIFO.
    }, userId);

    // Update stock (re-read from item as service updated it, or calculate)
    const stockAfter = stockBefore - quantityToConsume;

    // Update ingredient record with batch reference and INCREMENT consumption
    await ingredient.update({
      quantity_consumed: parseFloat(ingredient.quantity_consumed || 0) + quantityToConsume,
      stock_before: ingredient.stock_before === null ? stockBefore : ingredient.stock_before,
      stock_after: stockAfter,
      batch_id: movement.batch_id || ingredient.batch_id // Track primary batch used
    });
  }

  // Add finished product to stock via Service
  const product = jo.product;

  // Create production output movement
  // Use createStockMovement with 'production_output' which handles positive addition
  const productionMovement = await createStockMovement({
    item_id: product.item_id,
    quantity: qtyToProcess,
    movement_type: 'production_output',
    reference_id: jo.jo_number,
    reference_type: 'JO',
    notes: notes || null,
    expiry_date: expiryDateOverride || null, // Service handles fallback to shelf life
    cost_per_unit: product.cost_per_unit, // Product cost (should be calculated from ingredients, but current logic uses static cost)
    po_number: jo.jo_number // Use JO number as "PO Number" for batch
  }, userId);

  // Update JO status, quantity_produced, and save notes
  const newQuantityProduced = currentQuantityProduced + qtyToProcess;
  const newStatus = isFinalCompletion ? 'completed' : 'partial';

  await jo.update({
    status: newStatus,
    quantity_produced: newQuantityProduced,
    completion_date: isFinalCompletion ? new Date() : null, // Only set completion date when fully finished? Or update last activity? Usually completion_date implies "Finished".
    completed_by: isFinalCompletion ? userId : null,
    notes: notes ? (jo.notes ? `${jo.notes}\n${notes}` : notes) : jo.notes // Append notes
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
