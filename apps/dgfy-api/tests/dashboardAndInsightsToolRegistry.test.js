import { jest } from '@jest/globals';
import { buildDashboardAndInsightsToolRegistry } from '../src/modules/ai/usecases/toolHandlers/dashboardAndInsightsToolRegistry.js';

describe('dashboardAndInsightsToolRegistry', () => {
  it('maps dashboard stats to the AI response shape', async () => {
    const registry = buildDashboardAndInsightsToolRegistry({
      dashboardService: {
        getDashboardStats: jest.fn().mockResolvedValue({
          totalItems: 120,
          lowStockCount: 7,
          healthyCount: 100,
          overStockCount: 13,
          pending_purchase_orders: 4,
          active_job_orders: 2,
          totalValue: 450000
        })
      },
      settingsService: {},
      alertService: {},
      forecastService: {},
      documentationService: {}
    });

    const result = await registry.get_dashboard_stats({ args: {} });

    expect(result).toEqual({
      total_items: 120,
      low_stock_count: 7,
      healthy_stock_count: 100,
      overstock_count: 13,
      pending_purchase_orders: 4,
      active_job_orders: 2,
      total_inventory_value: 450000,
      data_quality: null
    });
  });

  it('get_system_settings flattens values by key', async () => {
    const registry = buildDashboardAndInsightsToolRegistry({
      dashboardService: {},
      settingsService: {
        getAllSettings: jest.fn().mockResolvedValue({
          timezone: { value: 'Asia/Manila' },
          low_stock_threshold: { value: 10 }
        })
      },
      alertService: {},
      forecastService: {},
      documentationService: {}
    });

    const result = await registry.get_system_settings({ args: {} });

    expect(result).toEqual({
      timezone: 'Asia/Manila',
      low_stock_threshold: 10
    });
  });

  it('update_system_settings persists and returns normalized payload', async () => {
    const updateSettings = jest.fn().mockResolvedValue({ updated: 2 });

    const registry = buildDashboardAndInsightsToolRegistry({
      dashboardService: {},
      settingsService: { updateSettings },
      alertService: {},
      forecastService: {},
      documentationService: {}
    });

    const result = await registry.update_system_settings({
      args: { updates: { timezone: 'UTC', low_stock_threshold: 5 } }
    });

    expect(updateSettings).toHaveBeenCalledWith({ timezone: 'UTC', low_stock_threshold: 5 });
    expect(result).toEqual({
      success: true,
      message: 'System settings updated successfully',
      updated_count: 2,
      details: { timezone: 'UTC', low_stock_threshold: 5 }
    });
  });

  it('search_documentation returns contextual_help fallback when no results', async () => {
    const searchDocumentation = jest.fn().mockResolvedValue([]);
    const getContextualHelp = jest.fn().mockResolvedValue({
      guide: 'Try searching with "stock adjustment"'
    });

    const registry = buildDashboardAndInsightsToolRegistry({
      dashboardService: {},
      settingsService: {},
      alertService: {},
      forecastService: {},
      documentationService: {
        searchDocumentation,
        getContextualHelp
      }
    });

    const result = await registry.search_documentation({ args: { query: 'adjust stocks' } });

    expect(searchDocumentation).toHaveBeenCalledWith('adjust stocks');
    expect(getContextualHelp).toHaveBeenCalledWith('adjust stocks');
    expect(result).toEqual({
      query: 'adjust stocks',
      results: [],
      contextual_help: { guide: 'Try searching with "stock adjustment"' }
    });
  });

  it('generate_executive_summary combines stats, alerts, and shortages', async () => {
    const registry = buildDashboardAndInsightsToolRegistry({
      dashboardService: {
        getDashboardStats: jest.fn().mockResolvedValue({
          totalValue: 120000,
          totalItems: 40,
          lowStockCount: 5,
          overStockCount: 3,
          healthyCount: 32,
          pending_purchase_orders: 2,
          active_job_orders: 1
        }),
        getLowStockItems: jest.fn().mockResolvedValue([
          { name: 'Milk', current_stock: 2, min_threshold: 10 },
          { name: 'Sugar', current_stock: 5, min_threshold: 8 }
        ])
      },
      settingsService: {},
      alertService: {
        getExpiryAlerts: jest.fn().mockResolvedValue([
          { severity: 'critical', item_name: 'Eggs', expiry_date: '2026-03-05' },
          { severity: 'warning', item_name: 'Butter', expiry_date: '2026-03-10' }
        ])
      },
      forecastService: {},
      documentationService: {}
    });

    const result = await registry.generate_executive_summary({ args: {} });

    expect(result.financial_overview).toEqual({
      total_inventory_value: 120000,
      item_count: 40
    });
    expect(result.operational_health.healthy_percentage).toBe('80.0%');
    expect(result.top_issues.critical_stock_shortages).toEqual(['Milk (2/10)', 'Sugar (5/8)']);
    expect(result.top_issues.expiring_critical).toEqual(['Eggs expires 2026-03-05']);
  });
});
