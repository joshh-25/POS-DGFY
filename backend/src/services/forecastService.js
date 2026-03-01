import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';

export const forecastStockLevels = async (daysAhead = 30) => {
  const Item = dbStore.get('Item');
  const StockMovement = dbStore.get('StockMovement');

  // Query 1: all active items
  const items = await Item.findAll({
    where: { status: 'active' }
  });

  if (items.length === 0) return [];

  // Query 2: all relevant movements for ALL items in one batch (replaces N per-item queries)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const allMovements = await StockMovement.findAll({
    where: {
      item_id: { [Op.in]: items.map(i => i.item_id) },
      movement_type: { [Op.in]: ['production_consumption', 'calculated_loss'] },
      timestamp: { [Op.between]: [startDate, endDate] }
    }
  });

  // Group movements by item_id in JS (O(n), zero extra DB round trips)
  const movementsByItem = new Map();
  for (const m of allMovements) {
    if (!movementsByItem.has(m.item_id)) movementsByItem.set(m.item_id, []);
    movementsByItem.get(m.item_id).push(m);
  }

  // Build forecasts using the pre-grouped map
  const forecasts = items.map(item => {
    const movements = movementsByItem.get(item.item_id) || [];
    const totalConsumed = movements.reduce((sum, m) => sum + Math.abs(parseFloat(m.quantity)), 0);
    const avgDailyConsumption = totalConsumed / 30;

    const currentStock = parseFloat(item.current_stock) || 0;
    const forecastedStock = currentStock - (avgDailyConsumption * daysAhead);
    const daysUntilDepletion = avgDailyConsumption > 0
      ? Math.floor(currentStock / avgDailyConsumption)
      : Infinity;

    return {
      item_id: item.item_id,
      sku_code: item.sku_code,
      name: item.name,
      current_stock: currentStock,
      avg_daily_consumption: avgDailyConsumption,
      forecasted_stock: forecastedStock,
      days_until_depletion: daysUntilDepletion,
      status: (item.min_threshold !== null && forecastedStock < item.min_threshold) ? 'shortage' : 'normal'
    };
  });

  return forecasts;
};

