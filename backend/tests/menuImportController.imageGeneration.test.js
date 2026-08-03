import { jest } from '@jest/globals';

const mockConfirmItemsImportUseCase = jest.fn();
const mockPreviewItemsImportUseCase = jest.fn();
const mockResolveMenuImportCategories = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();
const mockEnqueueItemImageGeneration = jest.fn();
const mockGetTenantAiSpendSince = jest.fn();
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('../src/modules/csv/index.js', () => ({
    previewItemsImportUseCase: mockPreviewItemsImportUseCase,
    confirmItemsImportUseCase: mockConfirmItemsImportUseCase
}));
jest.unstable_mockModule('../src/services/menuExtractionService.js', () => ({
    extractMenuCsvFromFile: jest.fn(),
    MenuExtractionError: class MenuExtractionError extends Error {}
}));
jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
    trackProductUsageFromResult: mockTrackProductUsageFromResult
}));
jest.unstable_mockModule('../src/services/menuImportCategoryService.js', () => ({
    resolveMenuImportCategories: mockResolveMenuImportCategories
}));
jest.unstable_mockModule('../src/workers/itemImageWorker.js', () => ({
    enqueueItemImageGeneration: mockEnqueueItemImageGeneration
}));
jest.unstable_mockModule('../src/modules/menuImport/repositories/menuImportBudgetRepository.js', () => ({
    getTenantAiSpendSince: mockGetTenantAiSpendSince
}));
jest.unstable_mockModule('../src/config/logger.js', () => ({ default: mockLogger }));

let confirmPdfImport;
let ITEM_IMAGE_MAX_PER_BATCH;

beforeAll(async () => {
    process.env.ITEM_IMAGE_GENERATION_ENABLED = 'true';
    const controllerMod = await import('../src/controllers/menuImportController.js');
    confirmPdfImport = controllerMod.confirmPdfImport;
    ({ ITEM_IMAGE_MAX_PER_BATCH } = await import('../src/config/itemImageFeature.js'));
});

beforeEach(() => {
    jest.clearAllMocks();
    mockResolveMenuImportCategories.mockResolvedValue({ created: [], linked: [], skipped: [] });
    mockTrackProductUsageFromResult.mockResolvedValue(undefined);
    mockGetTenantAiSpendSince.mockResolvedValue(0);
    mockEnqueueItemImageGeneration.mockResolvedValue(undefined);
});

const createRes = () => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    return res;
};

const buildReqRes = (rows, userOverrides = {}) => {
    const req = {
        body: { rows },
        user: {
            user_id: 1,
            tenant_id: 'tenant-1',
            permissions: ['items:import', 'items:edit'],
            is_master_admin: false,
            ...userOverrides
        }
    };
    return { req, res: createRes() };
};

const rowsWithOneImageRequest = [
    { rowNumber: 1, generate_image: true, data: { name: 'Sisig', description: 'Pork sisig', product_folder: 'Mains' } },
    { rowNumber: 2, generate_image: false, data: { name: 'Lumpia' } }
];

const successfulConfirmResult = {
    success: true,
    data: {
        createdCount: 2,
        updatedCount: 0,
        failedCount: 0,
        results: {
            created: [
                { rowNumber: 1, item_id: 101, sku_code: 'SKU1', name: 'Sisig' },
                { rowNumber: 2, item_id: 102, sku_code: 'SKU2', name: 'Lumpia' }
            ],
            updated: [],
            failed: []
        }
    }
};

describe('confirmPdfImport — image generation enqueue (#176)', () => {
    it('enqueues generation only for rows with generate_image=true, reports images_queued', async () => {
        mockConfirmItemsImportUseCase.mockResolvedValue(successfulConfirmResult);
        const { req, res } = buildReqRes(rowsWithOneImageRequest);

        await confirmPdfImport(req, res);

        expect(mockEnqueueItemImageGeneration).toHaveBeenCalledTimes(1);
        expect(mockEnqueueItemImageGeneration).toHaveBeenCalledWith(expect.objectContaining({
            itemId: 101,
            name: 'Sisig',
            description: 'Pork sisig',
            category: 'Mains',
            user: expect.objectContaining({ tenant_id: 'tenant-1', permissions: expect.arrayContaining(['items:edit']) })
        }));

        const [payload] = res.json.mock.calls[0];
        expect(payload.data.images_queued).toBe(1);
        expect(payload.data.images_skipped).toEqual([]);
    });

    it('skips with permission_denied and does not enqueue when the user lacks items:edit', async () => {
        mockConfirmItemsImportUseCase.mockResolvedValue(successfulConfirmResult);
        const { req, res } = buildReqRes(rowsWithOneImageRequest, { permissions: ['items:import'] });

        await confirmPdfImport(req, res);

        expect(mockEnqueueItemImageGeneration).not.toHaveBeenCalled();
        const [payload] = res.json.mock.calls[0];
        expect(payload.data.images_queued).toBe(0);
        expect(payload.data.images_skipped).toEqual(expect.arrayContaining([
            expect.objectContaining({ rowNumber: 1, reason: 'permission_denied' })
        ]));
    });

    it('skips with budget_exceeded and does not enqueue when the daily budget is already spent', async () => {
        mockConfirmItemsImportUseCase.mockResolvedValue(successfulConfirmResult);
        mockGetTenantAiSpendSince.mockResolvedValue(9999);
        const { req, res } = buildReqRes(rowsWithOneImageRequest);

        await confirmPdfImport(req, res);

        expect(mockEnqueueItemImageGeneration).not.toHaveBeenCalled();
        const [payload] = res.json.mock.calls[0];
        expect(payload.data.images_skipped).toEqual(expect.arrayContaining([
            expect.objectContaining({ rowNumber: 1, reason: 'budget_exceeded' })
        ]));
    });

    it('caps enqueued images at ITEM_IMAGE_MAX_PER_BATCH and reports the rest as batch_cap_exceeded', async () => {
        const manyRows = Array.from({ length: ITEM_IMAGE_MAX_PER_BATCH + 3 }, (_, i) => ({
            rowNumber: i + 1,
            generate_image: true,
            data: { name: `Item ${i + 1}` }
        }));
        mockConfirmItemsImportUseCase.mockResolvedValue({
            success: true,
            data: {
                createdCount: manyRows.length,
                updatedCount: 0,
                failedCount: 0,
                results: {
                    created: manyRows.map((row) => ({ rowNumber: row.rowNumber, item_id: 1000 + row.rowNumber, sku_code: 'X', name: row.data.name })),
                    updated: [],
                    failed: []
                }
            }
        });
        const { req, res } = buildReqRes(manyRows);

        await confirmPdfImport(req, res);

        expect(mockEnqueueItemImageGeneration).toHaveBeenCalledTimes(ITEM_IMAGE_MAX_PER_BATCH);
        const [payload] = res.json.mock.calls[0];
        expect(payload.data.images_queued).toBe(ITEM_IMAGE_MAX_PER_BATCH);
        expect(payload.data.images_skipped.filter((s) => s.reason === 'batch_cap_exceeded')).toHaveLength(3);
    });

    it('does nothing (no budget/permission calls) when no row requests an image', async () => {
        mockConfirmItemsImportUseCase.mockResolvedValue(successfulConfirmResult);
        const { req, res } = buildReqRes([{ rowNumber: 1, generate_image: false, data: { name: 'Lumpia' } }]);

        await confirmPdfImport(req, res);

        expect(mockGetTenantAiSpendSince).not.toHaveBeenCalled();
        expect(mockEnqueueItemImageGeneration).not.toHaveBeenCalled();
        const [payload] = res.json.mock.calls[0];
        expect(payload.data.images_queued).toBe(0);
    });
});
