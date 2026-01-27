import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Item from '../models/Item.js';
import FIFOBatch from '../models/FIFOBatch.js';
import Supplier from '../models/Supplier.js';
import SystemSetting from '../models/SystemSetting.js';

/**
 * Helper to get a setting value with a default fallback
 */
const getSettingValue = async (key, defaultValue) => {
  try {
    const setting = await SystemSetting.findOne({
      where: { setting_key: key }
    });
    if (!setting) return defaultValue;

    if (setting.data_type === 'number') {
      return parseFloat(setting.setting_value) || defaultValue;
    } else if (setting.data_type === 'boolean') {
      return setting.setting_value === 'true' || setting.setting_value === '1';
    }
    return setting.setting_value;
  } catch (err) {
    console.warn(`Failed to get setting ${key}, using default: ${defaultValue}`);
    return defaultValue;
  }
};

export const generateAlerts = async () => {
  const alerts = [];

  // Low stock alerts
  const lowStockItems = await Item.findAll({
    where: {
      status: 'active',
      min_threshold: { [Op.ne]: null }, // Only alert for items with thresholds set
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

  // Fetch configurable expiry thresholds from settings
  const criticalDays = await getSettingValue('expiry_critical_days', 7);
  const warningDays = await getSettingValue('expiry_warning_days', 30);

  // Calculate expiry window
  const warningHorizon = new Date();
  warningHorizon.setDate(warningHorizon.getDate() + warningDays);

  console.log(`[AlertService] Checking for batches expiring on or before ${warningHorizon.toISOString().split('T')[0]}`);

  // Fetch batches expiring within the warning window (OR already expired)
  // We want anything where expiry_date <= warningHorizon AND quantity > consumed
  const expiringBatches = await FIFOBatch.findAll({
    where: {
      expiry_date: {
        [Op.lte]: warningHorizon
      },
      [Op.and]: [
        sequelize.where(
          sequelize.col('quantity'),
          Op.gt,
          sequelize.col('quantity_consumed')
        )
      ]
    },
    include: [{
      model: Item,
      as: 'item',
      where: { status: 'active' }, // Only active items
      attributes: [
        'item_id', 'name', 'sku_code', 'unit_of_measure',
        'fifo_enabled', 'shelf_life_days'
      ]
    }],
    order: [['expiry_date', 'ASC']] // Sort by earliest expiry first
  });

  console.log(`[AlertService] Found ${expiringBatches.length} expiring/expired batches`);

  expiringBatches.forEach(batch => {
    if (!batch.item) {
      console.warn(`Warning: Batch #${batch.batch_id} refers to non-existent item ID ${batch.item_id}`);
      return;
    }

    const expiryDate = new Date(batch.expiry_date);

    // Skip batches with invalid expiry dates (NaN or before year 2000 - Excel epoch dates)
    if (isNaN(expiryDate.getTime()) || expiryDate.getFullYear() < 2000) {
      console.warn(`[AlertService] Batch #${batch.batch_id} has invalid expiry_date: ${batch.expiry_date}, skipping`);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    const availableQuantity = parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed);

    // Three-tier severity based on configurable thresholds
    // critical: <= criticalDays (default 7), warning: criticalDays+1 to warningDays
    const severity = daysUntilExpiry <= criticalDays ? 'critical' : 'warning';

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
      unit_of_measure: batch.item.unit_of_measure,
      // Additional shelf life context
      fifo_enabled: batch.item.fifo_enabled,
      shelf_life_days: batch.item.shelf_life_days,
      received_date: batch.received_date,
      po_number: batch.po_number
    });
  });

  // Alert for FIFO batches missing expiry_date (data quality issue)
  const batchesMissingExpiry = await FIFOBatch.findAll({
    where: {
      expiry_date: null,
      [Op.and]: [
        sequelize.where(
          sequelize.col('quantity'),
          Op.gt,
          sequelize.col('quantity_consumed')
        )
      ]
    },
    include: [{
      model: Item,
      as: 'item',
      where: {
        fifo_enabled: true,
        status: 'active'
      }
    }]
  });

  batchesMissingExpiry.forEach(batch => {
    if (!batch.item) return;

    const availableQuantity = parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed);

    alerts.push({
      type: 'missing_expiry_date',
      severity: 'warning',
      message: `Batch #${batch.batch_id} for ${batch.item.name} is missing expiry date`,
      item_id: batch.item_id,
      item_name: batch.item.name,
      item_sku: batch.item.sku_code,
      batch_id: batch.batch_id,
      available_quantity: availableQuantity,
      unit_of_measure: batch.item.unit_of_measure,
      received_date: batch.received_date,
      po_number: batch.po_number,
      shelf_life_days: batch.item.shelf_life_days,
      suggestion: batch.item.shelf_life_days
        ? 'Run the backfill migration or manually set expiry date'
        : 'Set shelf_life_days on this item first'
    });
  });

  // Supplier performance alerts
  const lowRatedSuppliers = await Supplier.findAll({
    where: {
      status: 'active',
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

