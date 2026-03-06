import { jest } from '@jest/globals';
import { buildCsvTransferToolRegistry } from '../src/modules/ai/usecases/toolHandlers/csvTransferToolRegistry.js';

describe('csvTransferToolRegistry', () => {
  it('import_csv_data returns preview payload before confirmation', async () => {
    const registry = buildCsvTransferToolRegistry({
      tempFileService: {
        parseCsv: jest.fn().mockReturnValue({
          headers: ['sku_code', 'name'],
          rows: [{ sku_code: 'SKU-1', name: 'Flour' }],
          totalRows: 1
        }),
        validateCsvStructure: jest.fn().mockReturnValue({
          valid: true,
          summary: { total: 1 },
          errors: [],
          parseErrors: []
        })
      },
      itemService: {},
      supplierService: {},
      purchaseOrderService: {},
      jobOrderService: {},
      stockMovementService: {},
      logger: { error: jest.fn() }
    });

    const result = await registry.import_csv_data({
      args: {
        entity_type: 'items',
        csv_content: 'sku_code,name\\nSKU-1,Flour'
      },
      user: { user_id: 1 }
    });

    expect(result.requires_confirmation).toBe(true);
    expect(result.preview.total_rows).toBe(1);
    expect(result.entity_type).toBe('items');
  });

  it('import_csv_data confirmed path skips duplicates when configured', async () => {
    const createSupplier = jest
      .fn()
      .mockResolvedValueOnce({ supplier_id: 1 })
      .mockRejectedValueOnce(new Error('duplicate supplier name'));

    const registry = buildCsvTransferToolRegistry({
      tempFileService: {
        parseCsv: jest.fn().mockReturnValue({
          headers: ['name', 'contact_person', 'email'],
          rows: [
            { name: 'Acme', contact_person: 'Jane', email: 'j@a.test' },
            { name: 'Acme', contact_person: 'Jane', email: 'j@a.test' }
          ],
          totalRows: 2
        }),
        validateCsvStructure: jest.fn().mockReturnValue({
          valid: true,
          summary: { total: 2 },
          errors: [],
          parseErrors: []
        })
      },
      itemService: {},
      supplierService: { createSupplier },
      purchaseOrderService: {},
      jobOrderService: {},
      stockMovementService: {},
      logger: { error: jest.fn() }
    });

    const result = await registry.import_csv_data({
      args: {
        entity_type: 'suppliers',
        csv_content: 'name,contact_person,email\\nAcme,Jane,j@a.test',
        options: { skip_duplicates: true },
        _confirmed: true
      },
      user: { user_id: 99 }
    });

    expect(result.success).toBe(true);
    expect(result.stats).toEqual({ imported: 1, skipped: 1, errors: 0 });
  });

  it('export_to_csv returns display preview for items', async () => {
    const generateCsv = jest.fn().mockReturnValue('sku_code,name\\nSKU-1,Flour');

    const registry = buildCsvTransferToolRegistry({
      tempFileService: {
        generateCsv,
        storeTemporaryFile: jest.fn()
      },
      itemService: {
        getItems: jest.fn().mockResolvedValue({
          items: [
            {
              sku_code: 'SKU-1',
              name: 'Flour',
              category: 'raw_material',
              current_stock: 10,
              max_capacity: 100,
              min_threshold: 5,
              unit_of_measure: 'kg',
              cost_per_unit: 2,
              status: 'active'
            }
          ]
        })
      },
      supplierService: {},
      purchaseOrderService: {},
      jobOrderService: {},
      stockMovementService: {},
      logger: { error: jest.fn() }
    });

    const result = await registry.export_to_csv({
      args: {
        entity_type: 'items',
        output_preference: 'display'
      },
      user: { user_id: 2 }
    });

    expect(generateCsv).toHaveBeenCalled();
    expect(result.output_mode).toBe('display');
    expect(result.preview.showing).toBe(1);
  });

  it('export_to_csv returns download metadata when requested', async () => {
    const storeTemporaryFile = jest.fn().mockResolvedValue({
      downloadUrl: '/tmp/file.csv',
      filename: 'items.csv',
      expiresAt: '2026-03-05T00:00:00.000Z',
      expiresIn: 3600
    });

    const registry = buildCsvTransferToolRegistry({
      tempFileService: {
        generateCsv: jest.fn().mockReturnValue('x'),
        storeTemporaryFile
      },
      itemService: {
        getItems: jest.fn().mockResolvedValue({
          items: [{ sku_code: 'SKU-1', name: 'Flour' }]
        })
      },
      supplierService: {},
      purchaseOrderService: {},
      jobOrderService: {},
      stockMovementService: {},
      logger: { error: jest.fn() }
    });

    const result = await registry.export_to_csv({
      args: {
        entity_type: 'items',
        output_preference: 'download'
      },
      user: { user_id: 2 }
    });

    expect(storeTemporaryFile).toHaveBeenCalled();
    expect(result.output_mode).toBe('download');
    expect(result.download.filename).toBe('items.csv');
  });
});
