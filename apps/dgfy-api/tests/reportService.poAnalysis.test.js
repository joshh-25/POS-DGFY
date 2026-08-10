import { jest } from '@jest/globals';

const mockPurchaseOrderFindAll = jest.fn();
const mockGetItemsCostMetrics = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
  default: {
    get: (name) => {
      if (name === 'PurchaseOrder') {
        return { findAll: mockPurchaseOrderFindAll };
      }
      if (name === 'Supplier') return {};
      if (name === 'POLineItem') return {};
      if (name === 'Item') return {};
      return {};
    },
    getStore: () => ({})
  }
}));

jest.unstable_mockModule('../src/modules/inventory/services/costValuationService.js', () => ({
  getItemsCostMetrics: mockGetItemsCostMetrics,
  getWeightedInventoryValueOverview: jest.fn()
}));

let getPurchaseOrderAnalysis;

beforeAll(async () => {
  const mod = await import('../src/services/reportService.js');
  getPurchaseOrderAnalysis = mod.getPurchaseOrderAnalysis;
});

describe('reportService.getPurchaseOrderAnalysis weighted variance regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes fallback-required item attributes and maps variance source from metrics source contract', async () => {
    mockPurchaseOrderFindAll.mockResolvedValue([{
      po_id: 1,
      po_number: 'PO-001',
      status: 'pending',
      total_amount: 160,
      order_date: '2026-04-01',
      supplier: {
        supplier_id: 8,
        name: 'Prime Supply',
        quality_rating: 4.8,
        avg_delivery_days: 2
      },
      items: [
        {
          item: { item_id: 1, name: 'Candy A', sku_code: 'C-A', cost_per_unit: 9, current_stock: 0 },
          quantity_ordered: 10,
          quantity_received: 0,
          unit_price: 10
        },
        {
          item: { item_id: 2, name: 'Candy B', sku_code: 'C-B', cost_per_unit: 5, current_stock: 4 },
          quantity_ordered: 10,
          quantity_received: 0,
          unit_price: 6
        }
      ]
    }]);

    mockGetItemsCostMetrics.mockResolvedValue(new Map([
      [1, {
        global: { weighted_avg_cost: 9, source: 'fifo_batches' },
        scoped: { location_id: 3, weighted_avg_cost: 8, source: 'fifo_batches' }
      }],
      [2, {
        global: { weighted_avg_cost: 5, source: 'item_cost_fallback' }
      }]
    ]));

    const result = await getPurchaseOrderAnalysis({ location_id: 3 });

    const findAllArgs = mockPurchaseOrderFindAll.mock.calls[0][0];
    const poItemInclude = findAllArgs.include.find((entry) => entry.as === 'items');
    const itemInclude = poItemInclude.include[0];
    expect(itemInclude.attributes).toEqual(expect.arrayContaining(['cost_per_unit', 'current_stock']));

    expect(result.cost_variance.summary.ordered_weighted_baseline_value).toBe(130);
    expect(result.cost_variance.summary.ordered_supplier_value).toBe(160);

    const lineByItemId = new Map(result.cost_variance.line_samples.map((line) => [line.item_id, line]));
    expect(lineByItemId.get(1).source).toBe('location_weighted_avg_cost');
    expect(lineByItemId.get(1).weighted_avg_cost).toBe(8);
    expect(lineByItemId.get(2).source).toBe('item_cost_fallback');
    expect(lineByItemId.get(2).weighted_avg_cost).toBe(5);
  });
});
