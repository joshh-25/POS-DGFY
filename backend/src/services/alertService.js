import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';

/**
 * Helper to get a setting value with a default fallback
 */
const getSettingValue = async (key, defaultValue) => {
  const SystemSetting = dbStore.get('SystemSetting');

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

/**
 * Get all low stock alerts
 */
export const getLowStockAlerts = async () => {
  const Item = dbStore.get('Item');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  const lowStockItems = await Item.findAll({
    where: {
      status: 'active',
      min_threshold: { [Op.ne]: null },
      [Op.and]: [
        sequelize.where(
          sequelize.col('current_stock'),
          Op.lte,
          sequelize.col('min_threshold')
        )
      ]
    }
  });

  return lowStockItems.map(item => ({
    type: 'low_stock',
    severity: 'high',
    message: `${item.name} (${item.sku_code}) is below minimum threshold`,
    item_id: item.item_id,
    current_stock: item.current_stock,
    min_threshold: item.min_threshold
  }));
};

/**
 * Get all expiry alerts based on thresholds
 */
export const getExpiryAlerts = async (options = {}) => {
  const FIFOBatch = dbStore.get('FIFOBatch');
  const Item = dbStore.get('Item');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

  const criticalDays = options.criticalDays || await getSettingValue('expiry_critical_days', 7);
  const warningDays = options.warningDays || await getSettingValue('expiry_warning_days', 30);

  const warningHorizon = new Date();
  warningHorizon.setDate(warningHorizon.getDate() + warningDays);

  const expiringBatches = await FIFOBatch.findAll({
    where: {
      expiry_date: { [Op.lte]: warningHorizon },
      [Op.and]: [
        sequelize.literal('`quantity` > COALESCE(`quantity_consumed`, 0)')
      ]
    },
    include: [{
      model: Item,
      as: 'item',
      where: { status: 'active' },
      attributes: ['item_id', 'name', 'sku_code', 'unit_of_measure', 'fifo_enabled', 'shelf_life_days']
    }],
    order: [['expiry_date', 'ASC']]
  });

  const alerts = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  expiringBatches.forEach(batch => {
    if (!batch.item) return;
    const expiryDate = new Date(batch.expiry_date);
    if (isNaN(expiryDate.getTime()) || expiryDate.getFullYear() < 2000) return;

    const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    const severity = daysUntilExpiry < 0 ? 'expired' : daysUntilExpiry <= criticalDays ? 'critical' : 'warning';

    alerts.push({
      type: 'expiring_batch',
      severity,
      message: `Batch #${batch.batch_id} for ${batch.item.name} expires ${daysUntilExpiry <= 0 ? 'today' : daysUntilExpiry === 1 ? 'tomorrow' : `in ${daysUntilExpiry} days`}`,
      item_id: batch.item_id,
      item_name: batch.item.name,
      item_sku: batch.item.sku_code,
      batch_id: batch.batch_id,
      expiry_date: batch.expiry_date,
      days_until_expiry: daysUntilExpiry,
      available_quantity: parseFloat(batch.quantity) - parseFloat(batch.quantity_consumed)
    });
  });

  return alerts;
};

/**
 * Get supplier performance alerts
 */
export const getSupplierPerformanceAlerts = async () => {
  const Supplier = dbStore.get('Supplier');

  const lowRatedSuppliers = await Supplier.findAll({
    where: {
      status: 'active',
      quality_rating: { [Op.lt]: 3.0 }
    }
  });

  return lowRatedSuppliers.map(supplier => ({
    type: 'supplier_performance',
    severity: 'medium',
    message: `${supplier.name} has low quality rating (${supplier.quality_rating})`,
    supplier_id: supplier.supplier_id,
    quality_rating: supplier.quality_rating
  }));
};

/**
 * Generate all system alerts (Legacy compatibility)
 */
export const generateAlerts = async () => {
  const [lowStock, expiry, performance] = await Promise.all([
    getLowStockAlerts(),
    getExpiryAlerts(),
    getSupplierPerformanceAlerts()
  ]);

  return [...lowStock, ...expiry, ...performance];
};

