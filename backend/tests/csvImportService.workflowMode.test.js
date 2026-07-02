import { jest } from '@jest/globals';
import crypto from 'crypto';

const mockItemModel = {
  findAll: jest.fn(),
  bulkCreate: jest.fn(),
  update: jest.fn()
};

const mockTransaction = {
  commit: jest.fn(),
  rollback: jest.fn()
};

const mockSequelize = {
  transaction: jest.fn()
};

const mockDbStore = {
  get: jest.fn((name) => {
    if (name === 'Item') return mockItemModel;
    if (name === 'sequelize') return mockSequelize;
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

describe('csvImportService workflow-mode template enforcement', () => {
  let previewImport;
  let confirmImport;
  let getTemplateDefinition;

  beforeAll(async () => {
    const mod = await import('../src/services/csvImportService.js');
    previewImport = mod.previewImport;
    confirmImport = mod.confirmImport;
    getTemplateDefinition = mod.getTemplateDefinition;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbStore.get.mockImplementation((name) => {
      if (name === 'Item') return mockItemModel;
      if (name === 'sequelize') return mockSequelize;
      throw new Error(`Unexpected model lookup: ${name}`);
    });
    mockItemModel.findAll.mockResolvedValue([]);
    mockItemModel.bulkCreate.mockImplementation(async (items) => (
      items.map((item, index) => ({
        item_id: index + 1,
        ...item
      }))
    ));
    mockSequelize.transaction.mockResolvedValue(mockTransaction);
  });

  const makeSettingsResult = (workflowMode) => ({
    success: true,
    data: {
      ops_workflow_mode: { value: workflowMode }
    },
    error: null,
    message: null
  });

  const csvWithMode = (mode) => [
    'sku_code,name,category,max_capacity,unit_of_measure,template_workflow_mode,mode_compatibility_note',
    `SKU-001,Sample Supplies,supplies,100,pcs,${mode},"mode note"`
  ].join('\n');

  const buildSignature = ({ workflowMode, schemaVersion, issuedAt }) => {
    const payload = `${workflowMode}|${schemaVersion}|${issuedAt}`;
    return crypto
      .createHmac('sha256', process.env.CSV_TEMPLATE_SIGNING_SECRET || process.env.JWT_SECRET || 'csv-template-signing-secret')
      .update(payload)
      .digest('hex');
  };

  it('allows manufacturing template when tenant mode is manufacturing', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('manufacturing'));

    const result = await previewImport(csvWithMode('manufacturing'));

    expect(result.success).toBe(true);
    expect(result.templateWorkflowMode).toBe('food_manufacturing');
    expect(result.tenantWorkflowMode).toBe('food_manufacturing');
  });

  it('allows MSME template when tenant mode is msme', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));

    const result = await previewImport(csvWithMode('msme'));

    expect(result.success).toBe(true);
    expect(result.templateWorkflowMode).toBe('msme');
    expect(result.tenantWorkflowMode).toBe('msme');
  });

  it('blocks food manufacturing template when tenant mode is msme', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));

    const result = await previewImport(csvWithMode('food_manufacturing'));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not compatible with tenant workflow mode/i);
    expect(result.details).toMatchObject({
      code: 'WORKFLOW_MODE_TEMPLATE_MISMATCH',
      template_workflow_mode: 'food_manufacturing',
      tenant_workflow_mode: 'msme'
    });
  });

  it('blocks MSME template when tenant mode is manufacturing', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('manufacturing'));

    const result = await previewImport(csvWithMode('msme'));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not compatible with tenant workflow mode/i);
    expect(result.details).toMatchObject({
      code: 'WORKFLOW_MODE_TEMPLATE_MISMATCH',
      template_workflow_mode: 'msme',
      tenant_workflow_mode: 'food_manufacturing'
    });
  });

  it('builds MSME template with required pricing and marker columns', () => {
    const template = getTemplateDefinition({ workflowMode: 'msme' });

    expect(template.workflowMode).toBe('msme');
    expect(template.filename).toBe('msme_items_import_template.csv');
    expect(template.headers).toEqual(expect.arrayContaining([
      'default_sale_price',
      'barcode_aliases',
      'template_workflow_mode',
      'mode_compatibility_note',
      'template_schema_version',
      'template_issued_at',
      'template_signature'
    ]));
  });

  it('builds Services and F&B mode-aware templates', () => {
    const servicesTemplate = getTemplateDefinition({ workflowMode: 'services' });
    const fnbTemplate = getTemplateDefinition({ workflowMode: 'fnb' });

    expect(servicesTemplate.workflowMode).toBe('services');
    expect(servicesTemplate.filename).toBe('services_items_import_template.csv');
    expect(servicesTemplate.headers).toContain('mode_item_preset');
    expect(servicesTemplate.sampleRows[0]).toContain('service');
    expect(fnbTemplate.workflowMode).toBe('fnb');
    expect(fnbTemplate.filename).toBe('fnb_items_import_template.csv');
    expect(fnbTemplate.headers).toContain('mode_item_preset');
    expect(fnbTemplate.sampleRows[0]).toContain('menu_item');
    expect(fnbTemplate.sampleRows[0]).toContain('serving');
  });

  it('blocks Services template when tenant mode is F&B', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));

    const result = await previewImport(csvWithMode('services'));

    expect(result.success).toBe(false);
    expect(result.details).toMatchObject({
      code: 'WORKFLOW_MODE_TEMPLATE_MISMATCH',
      template_workflow_mode: 'services',
      tenant_workflow_mode: 'fnb'
    });
  });

  it('rejects Services CSV rows that do not match the mode taxonomy', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('services'));
    const csv = [
      'sku_code,name,category,max_capacity,current_stock,unit_of_measure,template_workflow_mode,mode_compatibility_note',
      'SVC-001,Massage,service,1,5,kg,services,"mode note"'
    ].join('\n');

    const result = await previewImport(csv);

    expect(result.success).toBe(true);
    expect(result.rows[0].valid).toBe(false);
    expect(result.rows[0].errors.join(' ')).toMatch(/does not support unit_of_measure/i);
  });

  it('normalizes stock-exempt service rows before confirm bulk import', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('services'));

    const result = await confirmImport([
      {
        rowNumber: 1,
        sku_code: 'SVC-001',
        data: {
          sku_code: 'SVC-001',
          name: 'Massage',
          category: 'service',
          vat_type: 'vatable',
          max_capacity: 1,
          current_stock: 5,
          unit_of_measure: 'service',
          template_workflow_mode: 'services'
        }
      }
    ], 'test-user');

    expect(result.success).toBe(true);
    expect(result.results.failed).toEqual([]);
    expect(mockItemModel.bulkCreate).toHaveBeenCalledWith(
      [expect.objectContaining({
        category: 'service',
        mode_item_preset: 'service',
        current_stock: 0,
        fifo_enabled: false,
        location_id: null
      })],
      expect.objectContaining({
        validate: true
      })
    );
  });

  it('bulk imports flat F&B menu, ingredient, beverage, and packaging rows without product service timeouts', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));

    const result = await confirmImport([
      {
        rowNumber: 1,
        sku_code: 'MENU-001',
        data: {
          sku_code: 'MENU-001',
          name: 'Chicken Rice Bowl',
          category: 'product',
          product_type: 'finished_goods',
          mode_item_preset: 'menu_item',
          vat_type: 'vatable',
          max_capacity: 100,
          unit_of_measure: 'serving',
          default_sale_price: 149,
          template_workflow_mode: 'fnb'
        }
      },
      {
        rowNumber: 2,
        sku_code: 'ING-001',
        data: {
          sku_code: 'ING-001',
          name: 'Chicken Breast',
          category: 'raw_material',
          mode_item_preset: 'ingredient',
          vat_type: 'vatable',
          max_capacity: 100,
          unit_of_measure: 'kg',
          template_workflow_mode: 'fnb'
        }
      },
      {
        rowNumber: 3,
        sku_code: 'BEV-001',
        data: {
          sku_code: 'BEV-001',
          name: 'Bottled Juice',
          category: 'product',
          product_type: 'finished_goods',
          mode_item_preset: 'packaged_beverage',
          vat_type: 'vatable',
          max_capacity: 100,
          unit_of_measure: 'bottle',
          default_sale_price: 80,
          template_workflow_mode: 'fnb'
        }
      },
      {
        rowNumber: 4,
        sku_code: 'PKG-001',
        data: {
          sku_code: 'PKG-001',
          name: 'Takeout Box',
          category: 'packaging',
          mode_item_preset: 'packaging_supply',
          vat_type: 'vatable',
          max_capacity: 100,
          unit_of_measure: 'pcs',
          template_workflow_mode: 'fnb'
        }
      }
    ], 'test-user');

    expect(result.success).toBe(true);
    expect(result.results.failed).toEqual([]);
    expect(result.results.created).toHaveLength(4);
    expect(mockItemModel.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sku_code: 'MENU-001', mode_item_preset: 'menu_item', category: 'product' }),
        expect.objectContaining({ sku_code: 'ING-001', mode_item_preset: 'ingredient', category: 'raw_material' }),
        expect.objectContaining({ sku_code: 'BEV-001', mode_item_preset: 'packaged_beverage', category: 'product' }),
        expect.objectContaining({ sku_code: 'PKG-001', mode_item_preset: 'packaging_supply', category: 'packaging' })
      ]),
      expect.objectContaining({ validate: true })
    );
  });

  it('reports clear row errors when an F&B import database operation times out', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));
    mockItemModel.bulkCreate.mockRejectedValueOnce(new Error('Operation timeout while acquiring connection'));

    const result = await confirmImport([
      {
        rowNumber: 1,
        sku_code: 'MENU-TIMEOUT',
        data: {
          sku_code: 'MENU-TIMEOUT',
          name: 'Timeout Bowl',
          category: 'product',
          product_type: 'finished_goods',
          mode_item_preset: 'menu_item',
          vat_type: 'vatable',
          max_capacity: 100,
          unit_of_measure: 'serving',
          default_sale_price: 149,
          template_workflow_mode: 'fnb'
        }
      }
    ], 'test-user');

    expect(result.success).toBe(true);
    expect(result.results.created).toEqual([]);
    expect(result.results.failed).toEqual([
      expect.objectContaining({
        rowNumber: 1,
        sku_code: 'MENU-TIMEOUT',
        errors: [expect.stringMatching(/database operation timed out/i)]
      })
    ]);
  });

  it('counts created rows accurately when barcode alias sync fails after item create', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));
    const mockItemBarcode = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockRejectedValue(new Error('Operation timeout while writing barcode alias'))
    };
    mockDbStore.get.mockImplementation((name) => {
      if (name === 'Item') return mockItemModel;
      if (name === 'sequelize') return mockSequelize;
      if (name === 'ItemBarcode') return mockItemBarcode;
      throw new Error(`Unexpected model lookup: ${name}`);
    });

    const result = await confirmImport([
      {
        rowNumber: 1,
        sku_code: 'MENU-WARN',
        barcode_aliases: [
          {
            code: '1234567890123',
            normalized_code: '1234567890123',
            source: 'manual',
            scope: 'pos',
            packaging_level: 'each',
            quantity_multiplier: 1
          }
        ],
        data: {
          sku_code: 'MENU-WARN',
          name: 'Warning Bowl',
          category: 'product',
          product_type: 'finished_goods',
          mode_item_preset: 'menu_item',
          vat_type: 'vatable',
          max_capacity: 100,
          unit_of_measure: 'serving',
          default_sale_price: 149,
          template_workflow_mode: 'fnb'
        }
      }
    ], 'test-user');

    expect(result.success).toBe(true);
    expect(result.createdCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.results.failed).toEqual([]);
    expect(result.results.created[0]).toEqual(expect.objectContaining({
      sku_code: 'MENU-WARN',
      warnings: [expect.stringMatching(/barcode import failed after item create/i)]
    }));
  });

  it('blocks preview when signed markers are present but signature is invalid', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));
    const schemaVersion = 'v1';
    const issuedAt = '2026-04-14T00:00:00.000Z';
    const csv = [
      'sku_code,name,category,max_capacity,unit_of_measure,template_workflow_mode,mode_compatibility_note,template_schema_version,template_issued_at,template_signature',
      `SKU-001,Sample Supplies,supplies,100,pcs,msme,"mode note",${schemaVersion},${issuedAt},bad-signature`
    ].join('\n');

    const result = await previewImport(csv);

    expect(result.success).toBe(false);
    expect(result.details).toMatchObject({
      code: 'TEMPLATE_SIGNATURE_INVALID',
      template_workflow_mode: 'msme',
      tenant_workflow_mode: 'msme'
    });
  });

  it('allows preview when signed markers are valid', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));
    const schemaVersion = 'v1';
    const issuedAt = '2026-04-14T00:00:00.000Z';
    const signature = buildSignature({ workflowMode: 'msme', schemaVersion, issuedAt });
    const csv = [
      'sku_code,name,category,max_capacity,unit_of_measure,template_workflow_mode,mode_compatibility_note,template_schema_version,template_issued_at,template_signature',
      `SKU-001,Sample Supplies,supplies,100,pcs,msme,"mode note",${schemaVersion},${issuedAt},${signature}`
    ].join('\n');

    const result = await previewImport(csv);

    expect(result.success).toBe(true);
    expect(result.templateWorkflowMode).toBe('msme');
  });

  it('accepts legacy signed manufacturing markers after normalizing to food manufacturing', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('manufacturing'));
    const schemaVersion = 'v1';
    const issuedAt = '2026-04-14T00:00:00.000Z';
    const signature = buildSignature({ workflowMode: 'manufacturing', schemaVersion, issuedAt });
    const csv = [
      'sku_code,name,category,max_capacity,unit_of_measure,template_workflow_mode,mode_compatibility_note,template_schema_version,template_issued_at,template_signature',
      `SKU-001,Flour,raw_material,100,kg,manufacturing,"mode note",${schemaVersion},${issuedAt},${signature}`
    ].join('\n');

    const result = await previewImport(csv);

    expect(result.success).toBe(true);
    expect(result.templateWorkflowMode).toBe('food_manufacturing');
  });

  it('normalizes SKU matching during preview so case/whitespace variants resolve to UPDATE', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('manufacturing'));
    mockItemModel.findAll.mockResolvedValue([
      { item_id: 88, sku_code: 'rm-0001' }
    ]);

    const csv = [
      'sku_code,name,category,max_capacity,unit_of_measure,template_workflow_mode,mode_compatibility_note',
      ' RM-0001 ,Flour,raw_material,100,kg,manufacturing,"mode note"'
    ].join('\n');

    const result = await previewImport(csv);

    expect(result.success).toBe(true);
    expect(result.rows[0].action).toBe('UPDATE');
    expect(result.rows[0].existingItemId).toBe(88);
  });

  it('flags duplicate SKU rows in preview even when case differs', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('manufacturing'));

    const csv = [
      'sku_code,name,category,max_capacity,unit_of_measure,template_workflow_mode,mode_compatibility_note',
      'SUP-001,Gloves,supplies,50,pcs,manufacturing,"mode note"',
      ' sup-001 ,Mask,supplies,50,pcs,manufacturing,"mode note"'
    ].join('\n');

    const result = await previewImport(csv);

    expect(result.success).toBe(true);
    expect(result.rows[1].valid).toBe(false);
    expect(result.rows[1].errors.join(' ')).toMatch(/duplicate sku code in import file/i);
  });

  it('blocks confirm when row metadata signature is invalid', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));

    const result = await confirmImport([
      {
        rowNumber: 1,
        sku_code: 'SKU-001',
        data: {
          sku_code: 'SKU-001',
          name: 'Sample Supplies',
          category: 'supplies',
          max_capacity: 100,
          unit_of_measure: 'pcs',
          template_workflow_mode: 'msme',
          template_schema_version: 'v1',
          template_issued_at: '2026-04-14T00:00:00.000Z',
          template_signature: 'bad-signature'
        }
      }
    ], 'test-user');

    expect(result.success).toBe(false);
    expect(result.details).toMatchObject({
      code: 'TEMPLATE_SIGNATURE_INVALID',
      template_workflow_mode: 'msme',
      tenant_workflow_mode: 'msme'
    });
  });
});
