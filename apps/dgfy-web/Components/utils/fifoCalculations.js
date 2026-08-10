/**
 * FIFO Calculation Utilities
 * Handles First-In-First-Out inventory calculations
 */

/**
 * Calculate which batches will be consumed for a given quantity
 * Returns array of batch transactions and weighted average cost
 */
export function calculateFIFOConsumption(item, quantityNeeded) {
    if (!item.fifo_enabled || !item.fifo_batches || item.fifo_batches.length === 0) {
      return {
        batchTransactions: [],
        weightedAverageCost: item.cost_per_unit || 0,
        canFulfill: item.current_stock >= quantityNeeded
      };
    }
  
    // Sort batches by received_date (oldest first)
    const sortedBatches = [...item.fifo_batches].sort((a, b) => 
      new Date(a.received_date) - new Date(b.received_date)
    );
  
    const batchTransactions = [];
    let remainingNeeded = quantityNeeded;
    let totalCost = 0;
  
    for (const batch of sortedBatches) {
      if (remainingNeeded <= 0) break;
      
      const quantityFromBatch = Math.min(batch.quantity, remainingNeeded);
      const costFromBatch = quantityFromBatch * batch.cost_per_unit;
      
      batchTransactions.push({
        batch_id: batch.batch_id,
        quantity_consumed: quantityFromBatch,
        remaining_after: batch.quantity - quantityFromBatch,
        cost_per_unit: batch.cost_per_unit
      });
  
      totalCost += costFromBatch;
      remainingNeeded -= quantityFromBatch;
    }
  
    const weightedAverageCost = quantityNeeded > 0 ? totalCost / quantityNeeded : 0;
    const canFulfill = remainingNeeded === 0;
  
    return {
      batchTransactions,
      weightedAverageCost,
      canFulfill,
      shortfall: remainingNeeded > 0 ? remainingNeeded : 0
    };
  }
  
  /**
   * Update item's batches after consumption
   */
  export function updateBatchesAfterConsumption(item, batchTransactions) {
    if (!item.fifo_batches) return item;
  
    const updatedBatches = item.fifo_batches.map(batch => {
      const transaction = batchTransactions.find(t => t.batch_id === batch.batch_id);
      if (transaction) {
        return {
          ...batch,
          quantity: transaction.remaining_after
        };
      }
      return batch;
    }).filter(batch => batch.quantity > 0); // Remove empty batches
  
    return {
      ...item,
      fifo_batches: updatedBatches,
      current_stock: updatedBatches.reduce((sum, b) => sum + b.quantity, 0)
    };
  }
  
  /**
   * Add new batch on purchase receipt
   */
  export function addNewBatch(item, quantity, costPerUnit, poNumber, expiryDate = null) {
    const newBatch = {
      batch_id: `BATCH-${Date.now()}`,
      quantity,
      cost_per_unit: costPerUnit,
      received_date: new Date().toISOString().split('T')[0],
      po_number: poNumber,
      expiry_date: expiryDate
    };
  
    const updatedBatches = [...(item.fifo_batches || []), newBatch];
  
    return {
      ...item,
      fifo_batches: updatedBatches,
      current_stock: updatedBatches.reduce((sum, b) => sum + b.quantity, 0),
      cost_per_unit: costPerUnit // Update to latest purchase price
    };
  }
  
  /**
   * Get expiring batches within specified days
   */
  export function getExpiringBatches(items, daysThreshold = 30) {
    const expiringItems = [];
    const today = new Date();
  
    items.forEach(item => {
      if (!item.fifo_enabled || !item.fifo_batches) return;
  
      item.fifo_batches.forEach(batch => {
        if (!batch.expiry_date) return;
  
        const expiryDate = new Date(batch.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
  
        if (daysUntilExpiry <= daysThreshold && daysUntilExpiry > 0) {
          expiringItems.push({
            item_id: item.id,
            item_name: item.name,
            batch_id: batch.batch_id,
            quantity: batch.quantity,
            expiry_date: batch.expiry_date,
            days_until_expiry: daysUntilExpiry
          });
        }
      });
    });
  
    return expiringItems.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
  }

