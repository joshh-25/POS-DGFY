import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Item from '../models/Item.js';
import FIFOBatch from '../models/FIFOBatch.js';
import Supplier from '../models/Supplier.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import StockMovement from '../models/StockMovement.js';

export const getStockAgingReport = async () => {
  const items = await Item.findAll({
    where: { is_active: true },
    include: [
      {
        model: FIFOBatch,
        as: 'fifoBatches',
        required: false
      }
    ]
  });

  const agingData = items.map(item => {
    const batches = item.fifoBatches || [];
    const oldestBatch = batches.length > 0 
      ? batches.reduce((oldest, batch) => 
          new Date(batch.received_date) < new Date(oldest.received_date) ? batch : oldest
        )
      : null;

    const daysInStock = oldestBatch
      ? Math.floor((new Date() - new Date(oldestBatch.received_date)) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      item_id: item.item_id,
      sku_code: item.sku_code,
      name: item.name,
      current_stock: item.current_stock,
      days_in_stock: daysInStock,
      oldest_batch_date: oldestBatch?.received_date
    };
  });

  return agingData.sort((a, b) => b.days_in_stock - a.days_in_stock);
};

export const getSurplusShortageReport = async () => {
  const items = await Item.findAll({
    where: { is_active: true }
  });

  const report = items.map(item => {
    const currentStock = parseFloat(item.current_stock) || 0;
    const maxCapacity = parseFloat(item.max_capacity) || 0;
    const minThreshold = parseFloat(item.min_threshold) || 0;
    
    const stockPercentage = maxCapacity > 0 ? (currentStock / maxCapacity) * 100 : 0;
    const isLowStock = currentStock <= minThreshold;
    const isSurplus = stockPercentage > 80;

    return {
      item_id: item.item_id,
      sku_code: item.sku_code,
      name: item.name,
      current_stock: currentStock,
      max_capacity: maxCapacity,
      min_threshold: minThreshold,
      stock_percentage: stockPercentage,
      status: isLowStock ? 'shortage' : isSurplus ? 'surplus' : 'normal'
    };
  });

  return report;
};

export const getFinancialSummary = async () => {
  const items = await Item.findAll({
    where: { is_active: true },
    attributes: ['current_stock', 'cost_per_unit']
  });

  const totalValue = items.reduce((sum, item) => {
    const stock = parseFloat(item.current_stock) || 0;
    const cost = parseFloat(item.cost_per_unit) || 0;
    return sum + (stock * cost);
  }, 0);

  const totalItems = items.length;
  const itemsWithValue = items.filter(item => 
    parseFloat(item.cost_per_unit) > 0 && parseFloat(item.current_stock) > 0
  ).length;

  return {
    total_inventory_value: totalValue,
    total_items: totalItems,
    items_with_value: itemsWithValue,
    average_item_value: itemsWithValue > 0 ? totalValue / itemsWithValue : 0
  };
};

export const getSupplierPerformanceReport = async () => {
  const suppliers = await Supplier.findAll({
    include: [
      {
        model: PurchaseOrder,
        as: 'purchaseOrders',
        required: false
      }
    ]
  });

  return suppliers.map(supplier => {
    const pos = supplier.purchaseOrders || [];
    const completedPOs = pos.filter(po => po.status === 'received');
    const avgDeliveryDays = supplier.avg_delivery_days || 0;
    const qualityRating = supplier.quality_rating || 0;

    return {
      supplier_id: supplier.supplier_id,
      name: supplier.name,
      total_orders: pos.length,
      completed_orders: completedPOs.length,
      avg_delivery_days: avgDeliveryDays,
      quality_rating: qualityRating,
      performance_score: (qualityRating * 20) + (completedPOs.length > 0 ? 50 : 0) + (avgDeliveryDays < 5 ? 30 : 0)
    };
  }).sort((a, b) => b.performance_score - a.performance_score);
};

