import { jest } from '@jest/globals';

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
  let getTemplateDefinition;

  beforeAll(async () => {
    const mod = await import('../src/services/csvImportService.js');
    previewImport = mod.previewImport;
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

  it('allows manufacturing template when tenant mode is manufacturing', async () => {
    mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('manufacturing'));

    const result = await previewImport(csvWithMode('manufacturing'));

    expect(result.success).toBe(true);
    expect(result.templateWorkflowMode).toBe('manufacturing');
    expect(result.tenantWorkflowMode).toBe('manufacturing');
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
    expect(result.error).toMatch(/does not match tenant workflow mode/i);
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
    expect(result.error).toMatch(/does not match tenant workflow mode/i);
    expect(result.details).toMatchObject({
      code: 'WORKFLOW_MODE_TEMPLATE_MISMATCH',
      template_workflow_mode: 'msme',
      tenant_workflow_mode: 'manufacturing'
    });
  });

  it('builds MSME template with required pricing and marker columns', () => {
    const template = getTemplateDefinition({ workflowMode: 'msme' });

    expect(template.workflowMode).toBe('msme');
    expect(template.filename).toBe('msme_items_import_template.csv');
    expect(template.headers).toEqual(expect.arrayContaining([
      'default_sale_price',
      'template_workflow_mode',
      'mode_compatibility_note'
    ]));
  });
});
