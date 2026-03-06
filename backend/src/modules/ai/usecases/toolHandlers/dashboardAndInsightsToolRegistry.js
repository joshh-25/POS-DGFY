export const buildDashboardAndInsightsToolRegistry = ({
  dashboardService,
  settingsService,
  alertService,
  forecastService,
  documentationService
}) => {
  const handlers = {
    get_dashboard_stats: async () => {
      const stats = await dashboardService.getDashboardStats();
      return {
        total_items: stats.totalItems,
        low_stock_count: stats.lowStockCount,
        healthy_stock_count: stats.healthyCount,
        overstock_count: stats.overStockCount,
        pending_purchase_orders: stats.pending_purchase_orders,
        active_job_orders: stats.active_job_orders,
        total_inventory_value: stats.totalValue
      };
    },

    get_low_stock_items: async ({ args }) => {
      const { limit = 20 } = args;
      const items = await dashboardService.getLowStockItems();
      return {
        count: items.length,
        items: items.slice(0, limit).map((item) => ({
          id: item.item_id,
          sku_code: item.sku_code,
          name: item.name,
          category: item.category,
          current_stock: item.current_stock,
          min_threshold: item.min_threshold,
          shortage: (item.min_threshold || 0) - (item.current_stock || 0),
          unit: item.unit_of_measure
        }))
      };
    },

    get_system_settings: async () => {
      const settings = await settingsService.getAllSettings();
      const simplified = {};
      for (const [key, data] of Object.entries(settings)) {
        simplified[key] = data.value;
      }
      return simplified;
    },

    update_system_settings: async ({ args }) => {
      const { updates } = args;
      const result = await settingsService.updateSettings(updates);
      return {
        success: true,
        message: 'System settings updated successfully',
        updated_count: result.updated,
        details: updates
      };
    },

    generate_executive_summary: async () => {
      const [stats, expiryAlerts, lowStockItems] = await Promise.all([
        dashboardService.getDashboardStats(),
        alertService.getExpiryAlerts({ criticalDays: 7, warningDays: 30 }),
        dashboardService.getLowStockItems()
      ]);

      return {
        financial_overview: {
          total_inventory_value: stats.totalValue,
          item_count: stats.totalItems
        },
        operational_health: {
          low_stock_critical: stats.lowStockCount,
          overstocked: stats.overStockCount,
          healthy_percentage: stats.totalItems > 0
            ? `${((stats.healthyCount / stats.totalItems) * 100).toFixed(1)}%`
            : '0%'
        },
        action_items: {
          pending_purchase_orders: stats.pending_purchase_orders,
          active_job_orders: stats.active_job_orders,
          expiring_soon_batches: expiryAlerts.length
        },
        top_issues: {
          critical_stock_shortages: lowStockItems
            .slice(0, 5)
            .map((item) => `${item.name} (${item.current_stock}/${item.min_threshold})`),
          expiring_critical: expiryAlerts
            .filter((alert) => alert.severity === 'critical')
            .slice(0, 3)
            .map((alert) => `${alert.item_name} expires ${alert.expiry_date}`)
        }
      };
    },

    get_expiry_alerts: async ({ args }) => {
      const { critical_days = 7, warning_days = 30 } = args;
      const alerts = await alertService.getExpiryAlerts({
        criticalDays: critical_days,
        warningDays: warning_days
      });

      return {
        critical_count: alerts.critical?.length || 0,
        warning_count: alerts.warning?.length || 0,
        critical: alerts.critical?.map((alert) => ({
          item_name: alert.item_name,
          batch_id: alert.batch_id,
          expiry_date: alert.expiry_date,
          days_until_expiry: alert.days_until_expiry,
          quantity: alert.quantity
        })) || [],
        warning: alerts.warning?.map((alert) => ({
          item_name: alert.item_name,
          batch_id: alert.batch_id,
          expiry_date: alert.expiry_date,
          days_until_expiry: alert.days_until_expiry,
          quantity: alert.quantity
        })) || []
      };
    },

    get_forecast: async ({ args }) => {
      const { item_id, days = 30 } = args;
      const allForecasts = await forecastService.forecastStockLevels(days);

      const forecast = item_id
        ? allForecasts.filter((entry) => entry.item_id === item_id)
        : allForecasts;

      return {
        forecast_days: days,
        items: forecast.map((entry) => ({
          item_id: entry.item_id,
          sku_code: entry.sku_code,
          item_name: entry.name,
          current_stock: entry.current_stock,
          daily_consumption_rate: entry.avg_daily_consumption,
          projected_stock: entry.forecasted_stock,
          days_until_stockout: entry.days_until_depletion === Infinity ? null : entry.days_until_depletion,
          status: entry.status
        }))
      };
    },

    search_documentation: async ({ args }) => {
      const { query } = args;
      const results = await documentationService.searchDocumentation(query);

      if (results.length === 0) {
        const help = await documentationService.getContextualHelp(query);
        return {
          query,
          results: [],
          contextual_help: help
        };
      }

      return {
        query,
        results: results.map((result) => ({
          title: result.title,
          description: result.description,
          relevance: result.score > 10 ? 'high' : result.score > 5 ? 'medium' : 'low',
          excerpt: result.excerpt
        }))
      };
    }
  };

  return handlers;
};
