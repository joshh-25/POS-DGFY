import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';
import { buildStockBearingItemWhere } from '../modules/shared/utils/stockBearingPolicy.js';

export const forecastStockLevels = async (daysAhead = 30) => {
  const Item = dbStore.get('Item');
  const StockMovement = dbStore.get('StockMovement');

  // Query 1: all active, stock-bearing items (services carry no stock to forecast)
  const items = await Item.findAll({
    where: buildStockBearingItemWhere(buildVisibleWhere({ status: 'active' }))
  });

  if (items.length === 0) return [];

  // Query 2: all relevant movements for ALL items in one batch (replaces N per-item queries)
  // Includes goods_issue for finished goods items so that customer dispatch is factored
  // into consumption forecasting (not just internal production consumption).
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  // Build item ID sets: finished goods include goods_issue; all items include production/loss
  const finishedGoodsIds = items
    .filter(i => i.category === 'product' && i.product_type === 'finished_goods')
    .map(i => i.item_id);

  const allMovements = await StockMovement.findAll({
    where: {
      item_id: { [Op.in]: items.map(i => i.item_id) },
      [Op.or]: [
        { movement_type: { [Op.in]: ['production_consumption', 'calculated_loss'] } },
        // Include goods_issue only for finished goods items
        ...(finishedGoodsIds.length > 0
          ? [{ movement_type: 'goods_issue', item_id: { [Op.in]: finishedGoodsIds } }]
          : [])
      ],
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

