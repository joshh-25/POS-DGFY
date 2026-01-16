import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import StockMovement from '../models/StockMovement.js';
import Item from '../models/Item.js';
import User from '../models/User.js';
import FIFOBatch from '../models/FIFOBatch.js';
import BatchTransaction from '../models/BatchTransaction.js';

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
      { model: Item, as: 'item', attributes: ['name', 'sku_code', 'unit_of_measure'] },
      { model: User, as: 'userResponsible', attributes: ['username'] },
      { model: FIFOBatch, as: 'batch', attributes: ['batch_id', 'expiry_date', 'received_date'] }
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

/**
 * Create a manual stock movement with FIFO batch handling
 * 
 * For deductions (production_consumption, calculated_loss):
 * - Default: Consume from oldest batch first (FIFO)
 * - Optional: Specify batch_id to deduct from a specific batch
 * 
 * For additions (return):
 * - Creates a new FIFO batch if item is FIFO-enabled
 * - Uses expiry_date if provided, otherwise calculates from shelf_life_days
 */
export const createStockMovement = async (movementData, userId) => {
  const { item_id, quantity, movement_type, batch_id, expiry_date } = movementData;

  const item = await Item.findByPk(item_id);
  if (!item) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  const currentStock = parseFloat(item.current_stock);
  let newStock = currentStock;
  let createdBatchId = null;
  let movementExpiryDate = expiry_date || null;

  // Handle stock additions (purchase_receipt, return)
  if (movement_type === 'purchase_receipt' || movement_type === 'return') {
    newStock = currentStock + parseFloat(quantity);

    // Create FIFO batch for additions if item is FIFO-enabled
    if (item.fifo_enabled) {
      const receivedDate = new Date();

      // Calculate expiry if not provided
      if (!movementExpiryDate && item.shelf_life_days) {
        const expiryDateObj = new Date(receivedDate);
        expiryDateObj.setDate(expiryDateObj.getDate() + item.shelf_life_days);
        movementExpiryDate = expiryDateObj.toISOString().split('T')[0];
      }

      const batch = await FIFOBatch.create({
        item_id: item.item_id,
        quantity: parseFloat(quantity),
        cost_per_unit: item.cost_per_unit,
        received_date: receivedDate,
        expiry_date: movementExpiryDate,
        po_number: `MANUAL-${Date.now()}` // Manual adjustment reference
      });
      createdBatchId = batch.batch_id;
    }
  }
  // Handle stock deductions (production_consumption, calculated_loss)
  else if (movement_type === 'production_consumption' || movement_type === 'calculated_loss') {
    newStock = currentStock - parseFloat(quantity);
    if (newStock < 0) {
      const error = new Error('Insufficient stock');
      error.statusCode = 400;
      throw error;
    }

    // Process FIFO consumption if enabled
    if (item.fifo_enabled) {
      let remaining = parseFloat(quantity);

      // If specific batch_id provided, deduct from that batch only
      if (batch_id) {
        const targetBatch = await FIFOBatch.findByPk(batch_id);
        if (!targetBatch) {
          const error = new Error('Specified batch not found');
          error.statusCode = 404;
          throw error;
        }

        const available = parseFloat(targetBatch.quantity) - parseFloat(targetBatch.quantity_consumed);
        if (available < remaining) {
          const error = new Error(`Insufficient quantity in batch ${batch_id}. Available: ${available}`);
          error.statusCode = 400;
          throw error;
        }

        await targetBatch.update({
          quantity_consumed: parseFloat(targetBatch.quantity_consumed) + remaining
        });
        createdBatchId = batch_id;
        movementExpiryDate = targetBatch.expiry_date;
      }
      // Default FIFO: consume from oldest batches first
      else {
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

          // Track first batch for movement record
          if (createdBatchId === null) {
            createdBatchId = batch.batch_id;
            movementExpiryDate = batch.expiry_date;
          }

          await batch.update({
            quantity_consumed: parseFloat(batch.quantity_consumed) + consume
          });

          remaining -= consume;
        }

        if (remaining > 0) {
          const error = new Error(`Unable to fulfill entire quantity from FIFO batches. Shortfall: ${remaining}`);
          error.statusCode = 400;
          throw error;
        }
      }
    }
  }

  // Update item stock
  await item.update({ current_stock: newStock });

  // Create stock movement record
  const movement = await StockMovement.create({
    item_id: item.item_id,
    movement_type,
    quantity: movement_type === 'production_consumption' || movement_type === 'calculated_loss'
      ? -Math.abs(parseFloat(quantity))
      : Math.abs(parseFloat(quantity)),
    reference_id: movementData.reference_id || null,
    reference_type: movementData.reference_type || 'MANUAL',
    user_responsible: userId,
    notes: movementData.notes || null,
    loss_reason: movementData.loss_reason || null,
    batch_id: createdBatchId,
    expiry_date: movementExpiryDate
  });

  return movement;
};

/**
 * Get available FIFO batches for an item
 * Used by frontend for batch selection in manual adjustments
 */
export const getItemBatches = async (itemId) => {
  const batches = await FIFOBatch.findAll({
    where: {
      item_id: itemId,
      [Op.and]: [
        sequelize.where(
          sequelize.col('quantity'),
          Op.gt,
          sequelize.col('quantity_consumed')
        )
      ]
    },
    order: [['received_date', 'ASC']],
    attributes: [
      'batch_id',
      'quantity',
      'quantity_consumed',
      'cost_per_unit',
      'received_date',
      'expiry_date',
      'po_number',
      [sequelize.literal('quantity - quantity_consumed'), 'available_quantity']
    ]
  });

  return batches;
};

/**
 * Get a single stock movement by ID with full details
 */
export const getMovementById = async (movementId) => {
  const movement = await StockMovement.findByPk(movementId, {
    include: [
      { model: Item, as: 'item', attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'category', 'current_stock'] },
      { model: User, as: 'userResponsible', attributes: ['user_id', 'username', 'full_name'] },
      { model: FIFOBatch, as: 'batch', attributes: ['batch_id', 'expiry_date', 'received_date', 'quantity', 'quantity_consumed', 'cost_per_unit'] }
    ]
  });

  if (!movement) {
    const error = new Error('Movement not found');
    error.statusCode = 404;
    throw error;
  }

  return movement;
};

/**
 * Get stock movement statistics for dashboard and summary views
 * 
 * @param {Object} params - Query parameters
 * @param {string} params.startDate - Start date for filtering
 * @param {string} params.endDate - End date for filtering  
 * @param {number} params.item_id - Filter by specific item
 * @returns {Object} Statistics summary
 */
export const getMovementStats = async (params = {}) => {
  const { startDate, endDate, item_id } = params;

  const where = {};
  if (item_id) where.item_id = item_id;
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[Op.gte] = new Date(startDate);
    if (endDate) where.timestamp[Op.lte] = new Date(endDate);
  }

  // Get aggregated stats by movement type
  const stats = await StockMovement.findAll({
    where,
    attributes: [
      'movement_type',
      [sequelize.fn('COUNT', sequelize.col('movement_id')), 'count'],
      [sequelize.fn('SUM', sequelize.literal('ABS(quantity)')), 'total_quantity']
    ],
    group: ['movement_type'],
    raw: true
  });

  // Get total count
  const totalCount = await StockMovement.count({ where });

  // Calculate totals
  let totalIn = 0;
  let totalOut = 0;
  const byType = {};

  stats.forEach(stat => {
    const count = parseInt(stat.count) || 0;
    const quantity = parseFloat(stat.total_quantity) || 0;

    byType[stat.movement_type] = { count, quantity };

    if (stat.movement_type === 'purchase_receipt' || stat.movement_type === 'return') {
      totalIn += quantity;
    } else {
      totalOut += quantity;
    }
  });

  // Get recent trend (last 7 days movement count)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const recentCount = await StockMovement.count({
    where: {
      ...where,
      timestamp: { [Op.gte]: weekAgo }
    }
  });

  // Get top items by movement count
  const topItems = await StockMovement.findAll({
    where,
    attributes: [
      'item_id',
      [sequelize.fn('COUNT', sequelize.col('movement_id')), 'movement_count']
    ],
    include: [
      { model: Item, as: 'item', attributes: ['name', 'sku_code'] }
    ],
    group: ['item_id', 'item.item_id', 'item.name', 'item.sku_code'],
    order: [[sequelize.literal('movement_count'), 'DESC']],
    limit: 5
  });

  return {
    totalCount,
    totalIn,
    totalOut,
    netChange: totalIn - totalOut,
    byType,
    recentCount,
    topItems: topItems.map(t => ({
      item_id: t.item_id,
      name: t.item?.name,
      sku_code: t.item?.sku_code,
      count: parseInt(t.dataValues.movement_count)
    }))
  };
};

/**
 * Void (Reverse) a stock movement
 * Creates a counter-movement to reverse the effect of the original movement
 */
export const voidMovement = async (movementId, userId, reason) => {
  const transaction = await sequelize.transaction();

  try {
    const originalMovement = await StockMovement.findByPk(movementId, {
      include: [{ model: Item, as: 'item' }],
      transaction
    });

    if (!originalMovement) {
      const error = new Error('Movement not found');
      error.statusCode = 404;
      throw error;
    }

    if (originalMovement.reference_type === 'VOID' || originalMovement.notes?.includes('Voided by')) {
      const error = new Error('Movement is already voided');
      error.statusCode = 400;
      throw error;
    }

    const { quantity, movement_type, item_id, batch_id } = originalMovement;
    const reverseQuantity = -parseFloat(quantity); // Reverse the sign

    // Determine reverse movement type
    let reverseType = 'adjustment'; // Default fallback
    if (movement_type === 'purchase_receipt') reverseType = 'return';
    else if (movement_type === 'return') reverseType = 'purchase_receipt';
    else if (movement_type === 'production_consumption') reverseType = 'return'; // Returning to stock
    else if (movement_type === 'calculated_loss') reverseType = 'adjustment';
    else if (movement_type === 'transfer') reverseType = 'transfer';

    // Update item stock
    const item = await Item.findByPk(item_id, { transaction });
    const newStock = parseFloat(item.current_stock) + reverseQuantity;
    await item.update({ current_stock: newStock }, { transaction });

    // Handle FIFO batch reversal if applicable
    if (batch_id && reverseQuantity > 0) { // Returning stock to batch
      const batch = await FIFOBatch.findByPk(batch_id, { transaction });
      if (batch) {
        // If we represent consumption, we decrease consumed quantity (effectively adding back)
        // Check if original was consumption
        if (quantity < 0) {
          await batch.update({
            quantity_consumed: Math.max(0, parseFloat(batch.quantity_consumed) + quantity) // quantity is negative, so this subtracts
          }, { transaction });
        }
      }
    }

    // Create the voiding movement (counter-entry)
    const voidWithholding = await StockMovement.create({
      item_id,
      movement_type: reverseType,
      quantity: reverseQuantity,
      reference_id: originalMovement.movement_id.toString(),
      reference_type: 'MANUAL',
      user_responsible: userId,
      notes: `Void of movement #${movementId}: ${reason}`,
      batch_id: batch_id, // Link to same batch if applicable
      timestamp: new Date()
    }, { transaction });

    // Update original movement to indicate it was voided
    await originalMovement.update({
      notes: `${originalMovement.notes || ''} [Voided by user ${userId} on ${new Date().toISOString()}]`
    }, { transaction });

    await transaction.commit();
    return voidWithholding;

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Bulk create stock movements
 * Executes multiple movement creations within a single transaction
 */
export const createBulkMovements = async (movements, userId) => {
  const transaction = await sequelize.transaction();
  const results = [];

  try {
    for (const movementData of movements) {
      const result = await createStockMovement(movementData, userId);
      results.push(result);
    }

    await transaction.commit();
    return results;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Export movements for CSV
 * Returns flattened data matching the filter criteria
 */
export const exportMovements = async (queryParams) => {
  // Reuse getStockMovements logic but with higher limit
  const { movements } = await getStockMovements({ ...queryParams, limit: 10000 });

  return movements.map(m => ({
    'Movement ID': m.movement_id,
    'Date': new Date(m.timestamp).toLocaleString(),
    'Item Name': m.item?.name,
    'SKU': m.item?.sku_code,
    'Type': m.movement_type,
    'Quantity': m.quantity,
    'Current Stock': m.item?.current_stock,
    'Reference': m.reference_id || 'N/A',
    'Batch ID': m.batch_id || 'N/A',
    'User': m.userResponsible?.username || 'System',
    'Notes': m.notes || ''
  }));
};
