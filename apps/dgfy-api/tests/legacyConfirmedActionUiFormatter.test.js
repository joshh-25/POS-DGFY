import { jest } from '@jest/globals';
import { createLegacyConfirmedActionUiFormatter } from '../src/modules/ai/usecases/legacyConfirmedActionUiFormatter.js';

describe('legacyConfirmedActionUiFormatter', () => {
  it('formats purchase-order execution into impact/details cards', () => {
    const logger = { warn: jest.fn() };
    const formatResult = createLegacyConfirmedActionUiFormatter(logger);

    const result = formatResult(
      'create_purchase_order',
      { items: [{}, {}] },
      {
        po_number: 'PO-1001',
        total_amount: 123.45,
        details: {
          Supplier: 'Kitchen Source',
          'Expected Delivery': '2026-03-10'
        }
      }
    );

    expect(result.summary).toBe('Purchase Order #PO-1001 Created');
    expect(result.impact).toEqual({
      'Total Cost': '$123.45',
      'Items Ordered': '2',
      Status: 'Pending'
    });
    expect(result.details).toEqual({
      Supplier: 'Kitchen Source',
      Delivery: '2026-03-10'
    });
  });

  it('marks partial failures for bulk folder deletion', () => {
    const logger = { warn: jest.fn() };
    const formatResult = createLegacyConfirmedActionUiFormatter(logger);

    const result = formatResult(
      'bulk_delete_inventory_folders',
      {},
      {
        deleted_count: 1,
        failed_count: 1,
        total_requested: 2,
        deleted: [{ name: 'A', unassigned_count: 5 }],
        failed: [{ name: 'B', error: 'Folder not found' }]
      }
    );

    expect(result.success).toBe(false);
    expect(result.details.Failed).toContain('B: Folder not found');
  });
});
