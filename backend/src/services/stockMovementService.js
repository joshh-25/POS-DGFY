import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';

export const getStockMovements = async (queryParams) => {
  const StockMovement = dbStore.get('StockMovement');
  const Item = dbStore.get('Item');
  const User = dbStore.get('User');
  const FIFOBatch = dbStore.get('FIFOBatch');

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
export const createStockMovement = async (movementData, userId, transaction = null) => {
  const Item = dbStore.get('Item');
  const FIFOBatch = dbStore.get('FIFOBatch');
  const StockMovement = dbStore.get('StockMovement');
  const BatchTransaction = dbStore.get('BatchTransaction');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  const { item_id, quantity, movement_type, batch_id, expiry_date } = movementData;
  const options = transaction ? { transaction } : {};

  const item = await Item.findByPk(item_id, options);
  if (!item) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  const currentStock = parseFloat(item.current_stock);
  let newStock = currentStock;
  let createdBatchId = null;
  let movementExpiryDate = expiry_date || null;
  let batchTransactionsData = [];

  // Handle stock additions (purchase_receipt, return, production_output, adjustment)
  if (['purchase_receipt', 'return', 'production_output', 'adjustment'].includes(movement_type)) {
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
        cost_per_unit: movementData.cost_per_unit || item.cost_per_unit,
        received_date: receivedDate,
        expiry_date: movementExpiryDate,
        po_number: movementData.po_number || `MANUAL-${Date.now()}` // Manual adjustment reference or PO Number
      }, options);
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
        const targetBatch = await FIFOBatch.findByPk(batch_id, options);
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
        }, options);
        createdBatchId = batch_id;
        movementExpiryDate = targetBatch.expiry_date;

        batchTransactionsData.push({
          batch_id: batch_id,
          quantity_consumed: remaining,
          remaining_after: available - remaining,
          cost_per_unit: targetBatch.cost_per_unit
        });
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
          order: [['received_date', 'ASC']],
          ...options
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
          }, options);

          batchTransactionsData.push({
            batch_id: batch.batch_id,
            quantity_consumed: consume,
            remaining_after: available - consume,
            cost_per_unit: batch.cost_per_unit
          });

          remaining -= consume;
        }

        if (remaining > 0) {
          // Check if this is a legacy data issue (current_stock exists but no FIFO batches)
          const hasLegacyStock = currentStock > 0 && batches.length === 0;
          if (hasLegacyStock) {
            // Create a legacy batch to represent existing stock before consuming
            console.warn(`[StockMovement] Creating legacy FIFO batch for item ${item.name} (ID: ${item.item_id}) with ${currentStock} ${item.unit_of_measure}`);
            const legacyBatch = await FIFOBatch.create({
              item_id: item.item_id,
              quantity: currentStock,
              cost_per_unit: item.cost_per_unit || 0,
              received_date: new Date(),
              expiry_date: null,
              po_number: 'LEGACY-STOCK',
              notes: 'Auto-created from existing stock during JO completion'
            }, options);

            // Now consume from the legacy batch
            const consume = Math.min(remaining, currentStock);
            await legacyBatch.update({
              quantity_consumed: consume
            }, options);

            if (createdBatchId === null) {
              createdBatchId = legacyBatch.batch_id;
            }

            batchTransactionsData.push({
              batch_id: legacyBatch.batch_id,
              quantity_consumed: consume,
              remaining_after: currentStock - consume,
              cost_per_unit: legacyBatch.cost_per_unit
            });

            remaining -= consume;
          }

          if (remaining > 0) {
            const error = new Error(`Unable to fulfill quantity from FIFO batches for "${item.name}". Required: ${parseFloat(quantity)}, Shortfall: ${remaining.toFixed(2)} ${item.unit_of_measure}. Please ensure sufficient stock batches exist.`);
            error.statusCode = 400;
            throw error;
          }
        }
      }
    }
  }

  // Update item stock
  await item.update({ current_stock: newStock }, options);

  // Create stock movement record
  const movement = await StockMovement.create({
    item_id: item.item_id,
    movement_type,
    quantity: ['production_consumption', 'calculated_loss'].includes(movement_type)
      ? -Math.abs(parseFloat(quantity))
      : Math.abs(parseFloat(quantity)),
    reference_id: movementData.reference_id || null,
    reference_type: movementData.reference_type || 'MANUAL',
    user_responsible: userId,
    notes: movementData.notes || null,
    loss_reason: movementData.loss_reason || null,
    batch_id: createdBatchId,
    expiry_date: movementExpiryDate
  }, options);

  // Create Batch Transactions if any
  if (typeof batchTransactionsData !== 'undefined' && batchTransactionsData.length > 0) {
    await Promise.all(batchTransactionsData.map(data =>
      BatchTransaction.create({
        movement_id: movement.movement_id,
        ...data
      }, options)
    ));
  }

  return movement;
};

/**
 * Get available FIFO batches for an item
 * Used by frontend for batch selection in manual adjustments
 */
export const getItemBatches = async (itemId) => {
  const FIFOBatch = dbStore.get('FIFOBatch');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

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
  const StockMovement = dbStore.get('StockMovement');
  const Item = dbStore.get('Item');
  const User = dbStore.get('User');
  const FIFOBatch = dbStore.get('FIFOBatch');

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
  const StockMovement = dbStore.get('StockMovement');
  const Item = dbStore.get('Item');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

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
 * For multi-batch consumption, restores ALL affected batches via BatchTransaction records
 */
export const voidMovement = async (movementId, userId, reason) => {
  const StockMovement = dbStore.get('StockMovement');
  const Item = dbStore.get('Item');
  const FIFOBatch = dbStore.get('FIFOBatch');
  const BatchTransaction = dbStore.get('BatchTransaction');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();

  try {
    const originalMovement = await StockMovement.findByPk(movementId, {
      include: [
        { model: Item, as: 'item' },
        { model: BatchTransaction, as: 'batchTransactions' }
      ],
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
    else if (movement_type === 'production_output') reverseType = 'adjustment';

    // Update item stock
    const item = await Item.findByPk(item_id, { transaction });
    const newStock = parseFloat(item.current_stock) + reverseQuantity;

    if (newStock < 0) {
      const error = new Error('Cannot void: would result in negative stock');
      error.statusCode = 400;
      throw error;
    }

    await item.update({ current_stock: newStock }, { transaction });

    // Handle FIFO batch reversal for consumption movements
    // Check if this was a consumption (negative quantity) that needs batch restoration
    if (quantity < 0 && reverseQuantity > 0) {
      // Get all batch transactions for this movement (handles multi-batch consumption)
      const batchTransactions = originalMovement.batchTransactions || [];

      if (batchTransactions.length > 0) {
        // Restore each affected batch from BatchTransaction records
        for (const bt of batchTransactions) {
          const batch = await FIFOBatch.findByPk(bt.batch_id, { transaction });
          if (batch) {
            const restoredQty = parseFloat(bt.quantity_consumed);
            await batch.update({
              quantity_consumed: Math.max(0, parseFloat(batch.quantity_consumed) - restoredQty)
            }, { transaction });
          }
        }
      } else if (batch_id) {
        // Fallback: if no BatchTransaction records, use the single batch_id
        const batch = await FIFOBatch.findByPk(batch_id, { transaction });
        if (batch) {
          await batch.update({
            quantity_consumed: Math.max(0, parseFloat(batch.quantity_consumed) + quantity)
          }, { transaction });
        }
      }
    }

    // Handle FIFO batch reversal for additions (purchase_receipt, return, production_output)
    // When voiding an addition, we need to mark the batch as consumed
    if (quantity > 0 && reverseQuantity < 0 && batch_id) {
      const batch = await FIFOBatch.findByPk(batch_id, { transaction });
      if (batch) {
        // Increase quantity_consumed to effectively remove the stock from this batch
        const newConsumed = parseFloat(batch.quantity_consumed) + parseFloat(quantity);
        await batch.update({
          quantity_consumed: Math.min(newConsumed, parseFloat(batch.quantity))
        }, { transaction });
      }
    }

    // Create the voiding movement (counter-entry)
    const voidMovementRecord = await StockMovement.create({
      item_id,
      movement_type: reverseType,
      quantity: reverseQuantity,
      reference_id: originalMovement.movement_id.toString(),
      reference_type: 'MANUAL',
      user_responsible: userId,
      notes: `Void of movement #${movementId}: ${reason}`,
      batch_id: batch_id, // Link to primary batch for reference
      timestamp: new Date()
    }, { transaction });

    // Update original movement to indicate it was voided
    await originalMovement.update({
      notes: `${originalMovement.notes || ''} [Voided by user ${userId} on ${new Date().toISOString()}]`
    }, { transaction });

    await transaction.commit();
    return voidMovementRecord;

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
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
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
