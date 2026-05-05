import { jest } from '@jest/globals';
import crypto from 'crypto';

const mockItemModel = {
  findAll: jest.fn()
};

const mockDbStore = {
  get: jest.fn((name) => {
    if (name === 'Item') return mockItemModel;
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
    mockItemModel.findAll.mockResolvedValue([]);
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
    expect(result.templateWorkflowMode).toBe('manufacturing');
    expect(result.tenantWorkflowMode).toBe('food_manufacturing');
  });

  it('allows MSME template when tenant mode is msme', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));

    const result = await previewImport(csvWithMode('msme'));

    expect(result.success).toBe(true);
    expect(result.templateWorkflowMode).toBe('msme');
    expect(result.tenantWorkflowMode).toBe('msme');
  });

  it('blocks manufacturing template when tenant mode is msme', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));

    const result = await previewImport(csvWithMode('manufacturing'));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not compatible with tenant workflow mode/i);
    expect(result.details).toMatchObject({
      code: 'WORKFLOW_MODE_TEMPLATE_MISMATCH',
      template_workflow_mode: 'manufacturing',
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
