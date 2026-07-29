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
    let extractMenuItemsFromImage;
    let extractMenuItemsFromFile;
    let buildSignedCsv;
    let extractMenuCsvFromFile;
    let resolveTenantWorkflowMode;
    let MenuExtractionError;
    let previewImport;

    beforeAll(async () => {
        process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
        const mod = await import('../src/services/menuExtractionService.js');
        extractMenuItemsFromText = mod.extractMenuItemsFromText;
        extractMenuItemsFromImage = mod.extractMenuItemsFromImage;
        extractMenuItemsFromFile = mod.extractMenuItemsFromFile;
        buildSignedCsv = mod.buildSignedCsv;
        extractMenuCsvFromFile = mod.extractMenuCsvFromFile;
        resolveTenantWorkflowMode = mod.resolveTenantWorkflowMode;
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

        // Regression coverage for the batch-import SKU fix: the stamp used to be
        // computed inside the row .map(), so a batch whose rows straddled a
        // second boundary could emit mixed SKU stamps — and since a SKU
        // collision resolves to a silent UPDATE in previewImport rather than an
        // error, two imports landing in the same second could silently
        // overwrite each other's items. Hoisting the stamp out of the map fixes
        // that for both the single-file path (default options, tested above)
        // and the batch path (skuPrefix/batchToken, tested here).
        it('stamps every row in a call with the same timestamp regardless of row count', () => {
            const items = Array.from({ length: 50 }, (_, i) => ({ name: `Item ${i}`, price: 10 + i }));
            const csvContent = buildSignedCsv(items);
            const rows = csvContent.split('\n').slice(1);
            const stamps = rows.map((row) => row.split(',')[0].split('-')[1]);
            expect(new Set(stamps).size).toBe(1);
        });

        it('applies a custom skuPrefix and batchToken, keeping SKUs distinguishable across a multi-file batch', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));

            const csvContent = buildSignedCsv(
                [{ name: 'Batch Item A', price: 10 }, { name: 'Batch Item B', price: 20 }],
                { skuPrefix: 'MENUBATCH', batchToken: 'ab12cd' }
            );

            const result = await previewImport(csvContent);
            expect(result.success).toBe(true);
            expect(result.invalidRows).toBe(0);
            for (const row of result.rows) {
                expect(row.sku_code).toMatch(/^MENUBATCH-\d{14}-ab12cd-\d{3}$/);
            }
        });

        it('keeps two separately-built batches from colliding on sku_code when combined into one import', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));

            const batchOneCsv = buildSignedCsv([{ name: 'From File 1', price: 10 }], { batchToken: 'file1x' });
            const batchTwoCsv = buildSignedCsv([{ name: 'From File 2', price: 20 }], { batchToken: 'file2x' });

            // Simulate the merge use case combining two files' rows into one CSV
            // (drop the second file's header line).
            const combinedCsv = `${batchOneCsv}\n${batchTwoCsv.split('\n').slice(1).join('\n')}`;
            const result = await previewImport(combinedCsv);

            expect(result.success).toBe(true);
            expect(result.invalidRows).toBe(0);
            const skus = result.rows.map((row) => row.sku_code);
            expect(new Set(skus).size).toBe(2);
        });
    });

    describe('extractMenuItemsFromImage', () => {
        it('sends the image as a multimodal content part and maps the response the same as the text path', async () => {
            mockOpenAiJson({ items: [{ name: 'Iced Latte', price: 120 }] });

            const items = await extractMenuItemsFromImage(Buffer.from('fake-png-bytes'), 'image/png', { user_id: 1, tenant_id: 1 });

            expect(items).toEqual([{ name: 'Iced Latte', price: 120, section: null, description: null }]);
            const call = mockCreateCompletion.mock.calls[0][0];
            const userMessage = call.messages.find((m) => m.role === 'user');
            expect(Array.isArray(userMessage.content)).toBe(true);
            const imagePart = userMessage.content.find((part) => part.type === 'image_url');
            expect(imagePart.image_url.url).toMatch(/^data:image\/png;base64,/);
        });
    });

    describe('extractMenuCsvFromFile', () => {
        it('rejects up front for non-F&B tenants without attempting extraction', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('msme'));

            await expect(extractMenuCsvFromFile(Buffer.from('%PDF-1.4 fake'), 'application/pdf', { user_id: 1 }))
                .rejects.toMatchObject({
                    name: 'MenuExtractionError',
                    code: 'WORKFLOW_MODE_NOT_FNB'
                });

            expect(MenuExtractionError).toBeDefined();
        });

        it('produces a signed CSV from a PNG image for F&B tenants', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));
            mockOpenAiJson({ items: [{ name: 'Iced Latte', price: 120 }] });

            const result = await extractMenuCsvFromFile(Buffer.from('fake-png-bytes'), 'image/png', { user_id: 1 });

            expect(result.itemCount).toBe(1);
            const preview = await previewImport(result.csvContent);
            expect(preview.success).toBe(true);
            expect(preview.validRows).toBe(1);
        });

        it('rejects unsupported mimetypes', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));

            await expect(extractMenuCsvFromFile(Buffer.from('gif bytes'), 'image/gif', { user_id: 1 }))
                .rejects.toMatchObject({
                    name: 'MenuExtractionError',
                    code: 'UNSUPPORTED_FILE_TYPE'
                });
        });
    });

    // extractMenuItemsFromFile is the function workers/menuImportWorker.js calls
    // directly for batch import — deliberately WITHOUT a workflow-mode check,
    // since the worker has no tenant DB access. That check happens once, in
    // request context, in modules/menuImport/usecases/createMenuImportJobUseCase.js
    // before a job is ever enqueued (see resolveTenantWorkflowMode below).
    describe('extractMenuItemsFromFile', () => {
        it('extracts items from an image without checking tenant workflow mode', async () => {
            mockOpenAiJson({ items: [{ name: 'From Image', price: 45 }] });

            const result = await extractMenuItemsFromFile(Buffer.from('fake-png-bytes'), 'image/png', { user_id: 1 });

            expect(mockGetAllSettingsUseCase).not.toHaveBeenCalled();
            expect(result.kind).toBe('image');
            expect(result.items).toEqual([{ name: 'From Image', price: 45, section: null, description: null }]);
        });

        it('throws UNSUPPORTED_FILE_TYPE for anything other than pdf/jpeg/png', async () => {
            await expect(extractMenuItemsFromFile(Buffer.from('x'), 'image/gif', { user_id: 1 }))
                .rejects.toMatchObject({ name: 'MenuExtractionError', code: 'UNSUPPORTED_FILE_TYPE' });
        });

        // A PDF with a real embedded text content stream — confirms
        // extractPdfText's fast path (no vision calls at all) still wins
        // when there's real text, and regression-guards pdf-parse's
        // pageJoiner:'' fix (without it, pdf-parse's default page-boundary
        // marker means even a blank page never counts as "empty").
        const textPdf = (text) => Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${text.length + 20} >>
stream
BT /F1 24 Tf 20 100 Td (${text}) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
trailer
<< /Size 6 /Root 1 0 R >>
%%EOF`);

        it('uses the fast text path (no rasterization/vision) when the PDF has real embedded text', async () => {
            mockOpenAiJson({ items: [{ name: 'From Text', price: 33 }] });

            const result = await extractMenuItemsFromFile(textPdf('Real Menu Text'), 'application/pdf', { user_id: 1 });

            expect(result.kind).toBe('pdf_text');
            expect(result.pages).toBe(1);
            expect(result.items).toEqual([{ name: 'From Text', price: 33, section: null, description: null }]);
            expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
        });

        // A hand-built single-page PDF with no text content stream at all (no
        // /Contents on the page) — pdf-parse's real text extraction reads it
        // as empty, so this reliably exercises the rasterization fallback
        // (Phase 3) without needing to mock pdf-parse/pdfjs-dist itself. The
        // combination is proven to actually render in this sandbox (see
        // tests/menuPdfRasterService.test.js and the Phase 3 planning spike
        // in docs/proposals/MENU_IMPORT_BATCH_IMPORT_HANDOFF_2026-07-28.md) —
        // only the OpenAI vision call itself is mocked here, same as every
        // other test in this suite.
        const blankTextPdf = (pageCount = 1) => {
            const pageObjNums = Array.from({ length: pageCount }, (_, i) => 3 + i);
            const pagesObj = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageCount} >>\nendobj\n`;
            const pageObjs = pageObjNums.map((n) => (
                `${n} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n`
            )).join('');
            const size = 3 + pageCount;
            return Buffer.from(
                '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
                + pagesObj + pageObjs
                + `xref\n0 ${size}\n0000000000 65535 f \n`
                + `trailer\n<< /Size ${size} /Root 1 0 R >>\n%%EOF`
            );
        };

        it('falls back to rasterization + vision when PDF text extraction is empty', async () => {
            mockOpenAiJson({ items: [{ name: 'From Rasterized Page', price: 88 }] });

            const result = await extractMenuItemsFromFile(blankTextPdf(1), 'application/pdf', { user_id: 1 });

            expect(result.kind).toBe('pdf_rasterized');
            expect(result.pages).toBe(1);
            expect(result.pages_total).toBe(1);
            expect(result.truncated).toBe(false);
            expect(result.items).toEqual([{ name: 'From Rasterized Page', price: 88, section: null, description: null }]);
        });

        it('concatenates items across every rendered page', async () => {
            mockCreateCompletion
                .mockResolvedValueOnce({ model: 'gpt-4o', choices: [{ message: { content: JSON.stringify({ items: [{ name: 'Page 1 Item', price: 10 }] }) } }] })
                .mockResolvedValueOnce({ model: 'gpt-4o', choices: [{ message: { content: JSON.stringify({ items: [{ name: 'Page 2 Item', price: 20 }] }) } }] });

            const result = await extractMenuItemsFromFile(blankTextPdf(2), 'application/pdf', { user_id: 1 });

            expect(result.pages).toBe(2);
            expect(result.items.map((i) => i.name).sort()).toEqual(['Page 1 Item', 'Page 2 Item']);
        });

        it('stops rendering once reserveVisionCall denies a page, keeping items already extracted and flagging truncated', async () => {
            mockOpenAiJson({ items: [{ name: 'Only Page Processed', price: 15 }] });
            // Exactly 2 pages with the default worker-concurrency of 2 means
            // exactly one reserveVisionCall per page (each pool worker claims
            // one page and never loops back for a third) — deterministic
            // regardless of which worker's call lands first.
            const reserveVisionCall = jest.fn()
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            const result = await extractMenuItemsFromFile(blankTextPdf(2), 'application/pdf', { user_id: 1 }, { reserveVisionCall });

            expect(result.pages).toBe(1);
            expect(result.pages_total).toBe(2);
            expect(result.truncated).toBe(true);
            expect(result.items).toEqual([{ name: 'Only Page Processed', price: 15, section: null, description: null }]);
            expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
        });

        it('throws PDF_TEXT_EMPTY when reserveVisionCall denies even the first page', async () => {
            const reserveVisionCall = jest.fn().mockResolvedValue(false);

            await expect(extractMenuItemsFromFile(blankTextPdf(1), 'application/pdf', { user_id: 1 }, { reserveVisionCall }))
                .rejects.toMatchObject({ name: 'MenuExtractionError', code: 'PDF_TEXT_EMPTY' });
            expect(mockCreateCompletion).not.toHaveBeenCalled();
        });

        it('runs uninterrupted up to the page cap when no reserveVisionCall is provided (single-file sync path)', async () => {
            mockOpenAiJson({ items: [{ name: 'Uncapped Page Item', price: 5 }] });

            const result = await extractMenuItemsFromFile(blankTextPdf(2), 'application/pdf', { user_id: 1 });

            expect(result.pages).toBe(2);
            expect(result.truncated).toBe(false);
        });
    });

    describe('resolveTenantWorkflowMode', () => {
        it('is exported for reuse by createMenuImportJobUseCase and normalizes the tenant setting', async () => {
            mockGetAllSettingsUseCase.mockResolvedValue(makeSettingsResult('fnb'));
            await expect(resolveTenantWorkflowMode()).resolves.toBe('fnb');
        });
    });
});
