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

  // Expiry alerts - batches expiring within 7 days
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
    const expiryDate = new Date(batch.expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    const availableQuantity = parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed);

    // Color-coded severity: red (≤3 days = critical), amber (4-7 days = warning)
    const severity = daysUntilExpiry <= 3 ? 'critical' : 'warning';

    alerts.push({
      type: 'expiring_batch',
      severity,
      message: `Batch #${batch.batch_id} for ${batch.item.name} expires ${daysUntilExpiry === 0 ? 'today' : daysUntilExpiry === 1 ? 'tomorrow' : `in ${daysUntilExpiry} days`}`,
      item_id: batch.item_id,
      item_name: batch.item.name,
      item_sku: batch.item.sku_code,
      batch_id: batch.batch_id,
      expiry_date: batch.expiry_date,
      days_until_expiry: daysUntilExpiry,
      available_quantity: availableQuantity,
      unit_of_measure: batch.item.unit_of_measure
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

