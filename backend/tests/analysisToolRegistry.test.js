import { jest } from '@jest/globals';
import { buildAnalysisToolRegistry } from '../src/modules/ai/usecases/toolHandlers/analysisToolRegistry.js';

describe('analysisToolRegistry', () => {
  it('analyze_production_feasibility supports single product and list modes', async () => {
    const checkProductionFeasibility = jest
      .fn()
      .mockResolvedValueOnce({ producible: true, max_producible: 12 })
      .mockResolvedValueOnce({ producible: false, max_producible: 0 })
      .mockResolvedValueOnce({ producible: true, max_producible: 4 });

    const registry = buildAnalysisToolRegistry({
      analyticsService: {},
      jobOrderService: { checkProductionFeasibility }
    });

    const single = await registry.analyze_production_feasibility({
      args: { product_id: 10, show_chain: true }
    });
    const multiple = await registry.analyze_production_feasibility({
      args: { product_ids: [11, 12], show_chain: false }
    });

    expect(single).toEqual({ producible: true, max_producible: 12 });
    expect(multiple).toEqual([
      { producible: false, max_producible: 0 },
      { producible: true, max_producible: 4 }
    ]);
  });

  it('analyze_reorder_needs chooses item-level or category-level path', async () => {
    const analyticsService = {
      calculateReorderPoint: jest.fn().mockResolvedValue({ item_id: 1, reorder_point: 42 }),
      getReorderRecommendations: jest.fn().mockResolvedValue([{ item_id: 2 }])
    };

    const registry = buildAnalysisToolRegistry({
      analyticsService,
      jobOrderService: {}
    });

    const itemResult = await registry.analyze_reorder_needs({ args: { item_id: 1 } });
    const categoryResult = await registry.analyze_reorder_needs({ args: { category: 'raw_materials' } });

    expect(itemResult).toEqual({ item_id: 1, reorder_point: 42 });
    expect(categoryResult).toEqual([{ item_id: 2 }]);
    expect(analyticsService.calculateReorderPoint).toHaveBeenCalledWith(1);
    expect(analyticsService.getReorderRecommendations).toHaveBeenCalledWith('raw_materials');
  });

  it('get_advanced_analytics enforces supplier target_id requirement', async () => {
    const registry = buildAnalysisToolRegistry({
      analyticsService: {
        analyzeSupplierPerformance: jest.fn(),
        analyzeInventoryCosts: jest.fn()
      },
      jobOrderService: {}
    });

    await expect(
      registry.get_advanced_analytics({ args: { analysis_type: 'supplier_performance' } })
    ).rejects.toThrow('target_id (Supplier ID) is required');
  });
});

