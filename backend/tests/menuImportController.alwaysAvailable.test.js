import { jest } from '@jest/globals';

const mockConfirmItemsImportUseCase = jest.fn();
const mockPreviewItemsImportUseCase = jest.fn();
const mockResolveMenuImportCategories = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();
const mockEnqueueItemImageGeneration = jest.fn();
const mockGetTenantAiSpendSince = jest.fn();
const mockUpdateBulkPosCatalogOverridesUseCase = jest.fn();
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
jest.unstable_mockModule('../src/modules/pos/index.js', () => ({
    updateBulkPosCatalogOverridesUseCase: mockUpdateBulkPosCatalogOverridesUseCase
}));
jest.unstable_mockModule('../src/config/logger.js', () => ({ default: mockLogger }));

let confirmPdfImport;

beforeAll(async () => {
    const controllerMod = await import('../src/controllers/menuImportController.js');
    confirmPdfImport = controllerMod.confirmPdfImport;
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

const buildReqRes = (rows, { markAlwaysAvailable = false, userOverrides = {} } = {}) => {
    const req = {
        body: { rows, mark_always_available: markAlwaysAvailable },
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

const rows = [
    { rowNumber: 1, data: { name: 'Sisig' } },
    { rowNumber: 2, data: { name: 'Lumpia' } }
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

describe('confirmPdfImport — mark items Always Available', () => {
    it('does nothing when mark_always_available is not set', async () => {
        mockConfirmItemsImportUseCase.mockResolvedValue(successfulConfirmResult);
        const { req, res } = buildReqRes(rows, { markAlwaysAvailable: false });

        await confirmPdfImport(req, res);

        expect(mockUpdateBulkPosCatalogOverridesUseCase).not.toHaveBeenCalled();
        const [payload] = res.json.mock.calls[0];
        expect(payload.data.always_available_marked_count).toBe(0);
    });

    it('marks every created item Always Available when opted in', async () => {
        mockConfirmItemsImportUseCase.mockResolvedValue(successfulConfirmResult);
        mockUpdateBulkPosCatalogOverridesUseCase.mockResolvedValue({
            success: true,
            data: { summary: { updated: 2, blocked: 0, not_found: 0, failed: 0 }, results: [] }
        });
        const { req, res } = buildReqRes(rows, { markAlwaysAvailable: true });

        await confirmPdfImport(req, res);

        expect(mockUpdateBulkPosCatalogOverridesUseCase).toHaveBeenCalledWith({
            payload: { item_ids: [101, 102], pos_always_available: true },
            user: req.user
        });
        const [payload] = res.json.mock.calls[0];
        expect(payload.data.always_available_marked_count).toBe(2);
        expect(payload.message).toMatch(/2 items marked Always Available/);
    });

    it('does not fail the confirm response when the bulk override call fails', async () => {
        mockConfirmItemsImportUseCase.mockResolvedValue(successfulConfirmResult);
        mockUpdateBulkPosCatalogOverridesUseCase.mockRejectedValue(new Error('db unavailable'));
        const { req, res } = buildReqRes(rows, { markAlwaysAvailable: true });

        await confirmPdfImport(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const [payload] = res.json.mock.calls[0];
        expect(payload.success).toBe(true);
        expect(payload.data.always_available_marked_count).toBe(0);
        expect(mockLogger.error).toHaveBeenCalled();
    });

    it('does not fail the confirm response when the bulk override use case returns a failed result', async () => {
        mockConfirmItemsImportUseCase.mockResolvedValue(successfulConfirmResult);
        mockUpdateBulkPosCatalogOverridesUseCase.mockResolvedValue({
            success: false,
            error: { message: 'permission denied' }
        });
        const { req, res } = buildReqRes(rows, { markAlwaysAvailable: true });

        await confirmPdfImport(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        const [payload] = res.json.mock.calls[0];
        expect(payload.data.always_available_marked_count).toBe(0);
    });

    it('does nothing when confirm created no items', async () => {
        mockConfirmItemsImportUseCase.mockResolvedValue({
            success: true,
            data: { createdCount: 0, updatedCount: 0, failedCount: 2, results: { created: [], updated: [], failed: [] } }
        });
        const { req, res } = buildReqRes(rows, { markAlwaysAvailable: true });

        await confirmPdfImport(req, res);

        expect(mockUpdateBulkPosCatalogOverridesUseCase).not.toHaveBeenCalled();
    });
});
