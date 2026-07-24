import { jest } from '@jest/globals';

// Mirrors tests/csvImportService.workflowMode.test.js's mocking shape — this
// suite verifies menuExtractionService.js's CSV output round-trips through the
// REAL csvImportService.previewImport (not a mock), so the two stay in sync.
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

// The 'openai' SDK is mocked so this suite never makes a live API call —
// extractMenuItemsFromText's OpenAI request/response handling is exercised
// entirely against this fake client.
const mockCreateCompletion = jest.fn();
class MockOpenAI {
    constructor() {
        this.chat = { completions: { create: mockCreateCompletion } };
    }
}

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: mockDbStore
}));

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
    getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

jest.unstable_mockModule('openai', () => ({
    default: MockOpenAI
}));

describe('menuExtractionService', () => {
    let extractMenuItemsFromText;
    let buildSignedCsv;
    let extractMenuCsvFromPdf;
    let MenuExtractionError;
    let previewImport;

    beforeAll(async () => {
        process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
        const mod = await import('../src/services/menuExtractionService.js');
        extractMenuItemsFromText = mod.extractMenuItemsFromText;
        buildSignedCsv = mod.buildSignedCsv;
        extractMenuCsvFromPdf = mod.extractMenuCsvFromPdf;
        MenuExtractionError = mod.MenuExtractionError;

        const csvMod = await import('../src/services/csvImportService.js');
        previewImport = csvMod.previewImport;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockItemModel.findAll.mockResolvedValue([]);
    });

    const makeSettingsResult = (workflowMode) => ({
        success: true,
        data: { ops_workflow_mode: { value: workflowMode } },
        error: null,
        message: null
    });

    const mockOpenAiJson = (payload) => {
        mockCreateCompletion.mockResolvedValue({
            model: 'gpt-4o',
            choices: [{ message: { content: JSON.stringify(payload) } }]
            // No `usage` field — keeps this suite from touching AiUsageLog/DB.
        });
    };

    describe('extractMenuItemsFromText', () => {
        it('keeps items with a name and a positive numeric price', async () => {
            mockOpenAiJson({
                items: [
                    { name: 'Chicken Rice Bowl', price: 149, section: 'Mains', description: 'Grilled chicken over rice' },
                    { name: 'Iced Tea', price: 60 }
                ]
            });

            const items = await extractMenuItemsFromText('some menu text', { user_id: 1, tenant_id: 1 });

            expect(items).toEqual([
                { name: 'Chicken Rice Bowl', price: 149, section: 'Mains', description: 'Grilled chicken over rice' },
                { name: 'Iced Tea', price: 60, section: null, description: null }
            ]);
        });

        it('drops items missing a name, a price, or with a non-positive price', async () => {
            mockOpenAiJson({
                items: [
                    { name: '', price: 100 },
                    { name: 'No Price Item' },
                    { name: 'Free Sample', price: 0 },
                    { name: 'Negative', price: -5 },
                    { name: 'Valid Item', price: 25 }
                ]
            });

            const items = await extractMenuItemsFromText('menu text');

            expect(items).toHaveLength(1);
            expect(items[0].name).toBe('Valid Item');
        });

        it('rounds price to 2 decimal places', async () => {
            mockOpenAiJson({ items: [{ name: 'Rounded', price: 99.999 }] });

            const items = await extractMenuItemsFromText('menu text');

            expect(items[0].price).toBe(100);
        });

        it('throws MenuExtractionError when the model response is not valid JSON', async () => {
            mockCreateCompletion.mockResolvedValue({
                model: 'gpt-4o',
                choices: [{ message: { content: 'not json' } }]
            });

            await expect(extractMenuItemsFromText('menu text')).rejects.toMatchObject({
                name: 'MenuExtractionError',
                code: 'EXTRACTION_RESPONSE_INVALID'
            });
        });
    });

    describe('buildSignedCsv', () => {
        it('produces a signed CSV that previewImport accepts as valid fnb menu_item rows', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));

            const csvContent = buildSignedCsv([
                { name: 'Chicken Rice Bowl', price: 149, section: 'Mains', description: 'Grilled chicken' },
                { name: 'Iced Tea', price: 60, section: null, description: null }
            ]);

            const result = await previewImport(csvContent);

            expect(result.success).toBe(true);
            expect(result.templateWorkflowMode).toBe('fnb');
            expect(result.totalRows).toBe(2);
            expect(result.validRows).toBe(2);
            expect(result.createCount).toBe(2);
            for (const row of result.rows) {
                expect(row.valid).toBe(true);
                expect(row.action).toBe('CREATE');
                expect(row.category).toBe('product');
                expect(row.data.mode_item_preset).toBe('menu_item');
                expect(row.data.product_type).toBe('finished_goods');
                expect(row.data.unit_of_measure).toBe('serving');
            }
            expect(result.rows[0].name).toBe('Chicken Rice Bowl');
            expect(Number(result.rows[0].data.default_sale_price)).toBe(149);
            expect(result.rows[0].data.product_folder).toBe('Mains');
        });

        it('generates unique sku_codes per row so no row is flagged as a duplicate', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));

            const csvContent = buildSignedCsv([
                { name: 'Item A', price: 10 },
                { name: 'Item B', price: 20 },
                { name: 'Item C', price: 30 }
            ]);

            const result = await previewImport(csvContent);

            const skus = result.rows.map((row) => row.sku_code);
            expect(new Set(skus).size).toBe(3);
            expect(result.invalidRows).toBe(0);
        });

        it('rejects when the tenant is not in F&B workflow mode (template/tenant mode mismatch)', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));

            const csvContent = buildSignedCsv([{ name: 'Chicken Rice Bowl', price: 149 }]);
            const result = await previewImport(csvContent);

            expect(result.success).toBe(false);
            expect(result.details).toMatchObject({ code: 'WORKFLOW_MODE_TEMPLATE_MISMATCH' });
        });
    });

    describe('extractMenuCsvFromPdf', () => {
        it('rejects up front for non-F&B tenants without attempting PDF parsing', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));

            await expect(extractMenuCsvFromPdf(Buffer.from('%PDF-1.4 fake'), { user_id: 1 }))
                .rejects.toMatchObject({
                    name: 'MenuExtractionError',
                    code: 'WORKFLOW_MODE_NOT_FNB'
                });

            expect(MenuExtractionError).toBeDefined();
        });
    });
});
