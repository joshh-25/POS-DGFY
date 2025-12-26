import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Item from '../models/Item.js';
import FIFOBatch from '../models/FIFOBatch.js';
import Supplier from '../models/Supplier.js';

export const generateAlerts = async () => {
  const alerts = [];

  // Low stock alerts
  const lowStockItems = await Item.findAll({
    where: {
      is_active: true,
      [Op.and]: [
        sequelize.where(
          sequelize.col('current_stock'),
          Op.lte,
          sequelize.col('min_threshold')
        )
      ]
    }
  });

  lowStockItems.forEach(item => {
    alerts.push({
      type: 'low_stock',
      severity: 'high',
      message: `${item.name} (${item.sku_code}) is below minimum threshold`,
      item_id: item.item_id,
      current_stock: item.current_stock,
      min_threshold: item.min_threshold
    });
  });

  // Expiry alerts
  const expiringBatches = await FIFOBatch.findAll({
    where: {
      expiry_date: {
        [Op.between]: [new Date(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)] // Next 7 days
      },
      [Op.and]: [
        sequelize.where(
          sequelize.col('quantity'),
          Op.gt,
          sequelize.col('quantity_consumed')
        )
      ]
    },
    include: [{ model: Item, as: 'item' }]
  });

  expiringBatches.forEach(batch => {
    alerts.push({
      type: 'expiring_batch',
      severity: 'medium',
      message: `Batch for ${batch.item.name} expires on ${batch.expiry_date}`,
      item_id: batch.item_id,
      batch_id: batch.batch_id,
      expiry_date: batch.expiry_date
    });
  });

  // Supplier performance alerts
  const lowRatedSuppliers = await Supplier.findAll({
    where: {
      is_active: true,
      quality_rating: {
        [Op.lt]: 3.0
      }
    }
  });

  lowRatedSuppliers.forEach(supplier => {
    alerts.push({
      type: 'supplier_performance',
      severity: 'medium',
      message: `${supplier.name} has low quality rating (${supplier.quality_rating})`,
      supplier_id: supplier.supplier_id,
      quality_rating: supplier.quality_rating
    });
  });

  return alerts;
};

