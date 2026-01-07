import { Op } from 'sequelize';
import Item from '../models/Item.js';
import StockMovement from '../models/StockMovement.js';

export const forecastStockLevels = async (daysAhead = 30) => {
  const items = await Item.findAll({
    where: { is_active: true }
  });

  const forecasts = [];

  for (const item of items) {
    // Get recent consumption rate
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days

    const movements = await StockMovement.findAll({
      where: {
        item_id: item.item_id,
        movement_type: { [Op.in]: ['production_consumption', 'calculated_loss'] },
        timestamp: {
          [Op.between]: [startDate, endDate]
        }
      }
    });

    const totalConsumed = movements.reduce((sum, m) => sum + Math.abs(parseFloat(m.quantity)), 0);
    const avgDailyConsumption = totalConsumed / 30;

    const currentStock = parseFloat(item.current_stock) || 0;
    const forecastedStock = currentStock - (avgDailyConsumption * daysAhead);
    const daysUntilDepletion = avgDailyConsumption > 0
      ? Math.floor(currentStock / avgDailyConsumption)
      : Infinity;

    forecasts.push({
      item_id: item.item_id,
      sku_code: item.sku_code,
      name: item.name,
      current_stock: currentStock,
      avg_daily_consumption: avgDailyConsumption,
      forecasted_stock: forecastedStock,
      days_until_depletion: daysUntilDepletion,
      status: forecastedStock < (item.min_threshold || 0) ? 'shortage' : 'normal'
    });
  }

  return forecasts;
};

