import { jest } from '@jest/globals';
import { parse } from 'csv-parse/sync';

const mockItemModel = {
  findAll: jest.fn()
};

const mockRelatedModel = {};

const mockDbStore = {
  get: jest.fn((name) => {
    if (name === 'Item') return mockItemModel;
    if ([
      'ItemNutrition',
      'ItemAllergen',
      'ItemPhysicalProperties',
      'ItemShelfLife',
      'ItemPackaging',
      'ItemQualityControl',
      'ItemRegulatoryCompliance',
      'ItemCostBreakdown',
      'ItemBarcode'
    ].includes(name)) {
      return mockRelatedModel;
    }
    throw new Error(`Unexpected model lookup: ${name}`);
  })
};

const mockGetAllSettingsUseCase = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
  default: mockDbStore
}));

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
  getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

const settingsFor = (workflowMode) => ({
  success: true,
  data: {
    ops_workflow_mode: { value: workflowMode }
  },
  error: null,
  message: null
});

const parseRows = (csvContent) => parse(csvContent, {
  relax_column_count: true,
  skip_empty_lines: true
});

const recordItems = {
  food_manufacturing: [
    {
      item_id: 1,
      sku_code: 'RM-001',
      name: 'Flour',
      category: 'raw_material',
      mode_item_preset: 'raw_material',
      unit_of_measure: 'kg',
      max_capacity: 100,
      current_stock: 25,
      cost_per_unit: 45,
      fifo_enabled: true
    },
    {
      item_id: 2,
      sku_code: 'FG-001',
      name: 'Chocolate Cake',
      category: 'product',
      product_type: 'finished_goods',
      mode_item_preset: 'finished_product',
      vat_type: 'vatable',
      unit_of_measure: 'pcs',
      max_capacity: 50,
      current_stock: 10,
      cost_per_unit: 450,
      default_sale_price: 680,
      fifo_enabled: true
    }
  ],
  msme: [
    {
      item_id: 11,
      sku_code: 'MSME-PROD-001',
      name: 'Cookies Pack',
      category: 'product',
      product_type: 'finished_goods',
      mode_item_preset: 'product',
      vat_type: 'vatable',
      unit_of_measure: 'pack',
      max_capacity: 120,
      current_stock: 40,
      cost_per_unit: 65,
      default_sale_price: 95,
      fifo_enabled: true
    },
    {
      item_id: 12,
      sku_code: 'MSME-SUP-001',
      name: 'Paper Bag',
      category: 'supplies',
      mode_item_preset: 'supplies',
      unit_of_measure: 'pcs',
      max_capacity: 500,
      current_stock: 180,
      cost_per_unit: 4.5,
      default_sale_price: 8,
      fifo_enabled: false
    }
  ],
  services: [
    {
      item_id: 21,
      sku_code: 'SVC-001',
      name: 'Haircut Appointment',
      category: 'service',
      mode_item_preset: 'service',
      vat_type: 'vatable',
      unit_of_measure: 'service',
      max_capacity: 1,
      current_stock: 9,
      cost_per_unit: 0,
      default_sale_price: 350,
      fifo_enabled: true
    },
    {
      item_id: 22,
      sku_code: 'SVC-SUP-001',
      name: 'Disposable Cape',
      category: 'supplies',
      mode_item_preset: 'supplies',
      unit_of_measure: 'pcs',
      max_capacity: 200,
      current_stock: 40,
      cost_per_unit: 6,
      default_sale_price: 0,
      fifo_enabled: true
    }
  ],
  fnb: [
    {
      item_id: 31,
      sku_code: 'FNB-MENU-001',
      name: 'Chicken Adobo Plate',
      category: 'product',
      product_type: 'finished_goods',
      mode_item_preset: 'menu_item',
      vat_type: 'vatable',
      unit_of_measure: 'serving',
      max_capacity: 180,
      current_stock: 0,
      cost_per_unit: 95,
      default_sale_price: 180,
      fifo_enabled: false
    },
    {
      item_id: 32,
      sku_code: 'FNB-ING-001',
      name: 'Chicken Thigh',
      category: 'raw_material',
      mode_item_preset: 'ingredient',
      unit_of_measure: 'kg',
      max_capacity: 300,
      current_stock: 50,
      cost_per_unit: 180,
      default_sale_price: 0,
      fifo_enabled: true
    },
    {
      item_id: 33,
      sku_code: 'FNB-BEV-001',
      name: 'Bottled Juice',
      category: 'product',
      product_type: 'finished_goods',
      mode_item_preset: 'packaged_beverage',
      vat_type: 'vatable',
      unit_of_measure: 'bottle',
      max_capacity: 180,
      current_stock: 30,
      cost_per_unit: 20,
      default_sale_price: 45,
      fifo_enabled: true
    }
  ]
};

describe('csvExportService workflow-mode exports', () => {
  let exportFiltered;
  let previewImport;
  let getTemplateDefinition;

  beforeAll(async () => {
    const exportMod = await import('../src/services/csvExportService.js');
    const importMod = await import('../src/services/csvImportService.js');
    exportFiltered = exportMod.exportFiltered;
    previewImport = importMod.previewImport;
    getTemplateDefinition = importMod.getTemplateDefinition;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['food_manufacturing'],
    ['msme'],
    ['services'],
    ['fnb']
  ])('exports %s with import-template headers and round-trips through preview', async (workflowMode) => {
    mockGetAllSettingsUseCase.mockResolvedValue(settingsFor(workflowMode));
    mockItemModel.findAll
      .mockResolvedValueOnce(recordItems[workflowMode])
      .mockResolvedValueOnce([]);

    const result = await exportFiltered({}, { workflowMode });
    const template = getTemplateDefinition({ workflowMode });
    const rows = parseRows(result.csvContent);
    const headers = rows[0];

    expect(result.success).toBe(true);
    expect(result.workflowMode).toBe(template.workflowMode);
    expect(result.filename).toBe(template.filename.replace('_import_template.csv', '_export.csv'));
    expect(headers).toEqual(template.headers);
    rows.slice(1).forEach((row) => expect(row).toHaveLength(headers.length));

    const preview = await previewImport(result.csvContent);
    expect(preview.success).toBe(true);
    expect(preview.templateWorkflowMode).toBe(template.workflowMode);
    expect(preview.rows.filter((row) => !row.valid)).toEqual([]);
  });

  it('normalizes stock-exempt Services rows in export output', async () => {
    mockItemModel.findAll.mockResolvedValueOnce(recordItems.services);

    const result = await exportFiltered({}, { workflowMode: 'services' });
    const rows = parseRows(result.csvContent);
    const headers = rows[0];
    const serviceRow = rows.find((row) => row[headers.indexOf('sku_code')] === 'SVC-001');

    expect(serviceRow[headers.indexOf('category')]).toBe('service');
    expect(serviceRow[headers.indexOf('mode_item_preset')]).toBe('service');
    expect(serviceRow[headers.indexOf('current_stock')]).toBe('0');
    expect(serviceRow[headers.indexOf('fifo_enabled')]).toBe('FALSE');
  });

  it('exports mode-aware headers even when no items match', async () => {
    mockItemModel.findAll.mockResolvedValueOnce([]);

    const result = await exportFiltered({}, { workflowMode: 'services' });
    const rows = parseRows(result.csvContent);
    const template = getTemplateDefinition({ workflowMode: 'services' });

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.workflowMode).toBe('services');
    expect(rows).toEqual([template.headers]);
  });

  it('preserves F&B preset distinctions in export output', async () => {
    mockItemModel.findAll.mockResolvedValueOnce(recordItems.fnb);

    const result = await exportFiltered({}, { workflowMode: 'fnb' });
    const rows = parseRows(result.csvContent);
    const headers = rows[0];
    const presets = rows.slice(1).map((row) => row[headers.indexOf('mode_item_preset')]);

    expect(presets).toEqual(expect.arrayContaining([
      'menu_item',
      'ingredient',
      'packaged_beverage'
    ]));
  });

  it('keeps legacy product export columns aligned when explicitly requested', async () => {
    mockItemModel.findAll.mockResolvedValueOnce([recordItems.fnb[2]]);

    const result = await exportFiltered({}, { templateType: 'products' });
    const rows = parseRows(result.csvContent);
    const headers = rows[0];
    const itemRow = rows[1];

    expect(headers).toContain('mode_item_preset');
    expect(itemRow[headers.indexOf('mode_item_preset')]).toBe('packaged_beverage');
    expect(itemRow[headers.indexOf('vat_type')]).toBe('vatable');
    expect(itemRow[headers.indexOf('description')]).toBe('');
  });
});
