import { jest } from '@jest/globals';

const mockCreateMenuImportJobUseCase = jest.fn();
const mockGetMenuImportJobUseCase = jest.fn();
const mockPreviewMenuImportJobUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/menuImport/index.js', () => ({
    createMenuImportJobUseCase: mockCreateMenuImportJobUseCase,
    getMenuImportJobUseCase: mockGetMenuImportJobUseCase,
    previewMenuImportJobUseCase: mockPreviewMenuImportJobUseCase,
    menuImportJobRepository: {}
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
    trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

const makeRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('menuImportBatchHandlers.previewMenuImportJob', () => {
    let previewMenuImportJob;

    beforeAll(async () => {
        ({ previewMenuImportJob } = await import('../src/modules/menuImport/controllers/menuImportBatchHandlers.js'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('responds 200 with the use case data on success', async () => {
        mockPreviewMenuImportJobUseCase.mockResolvedValue({
            success: true,
            data: { rows: [], merge: { conflicts: [] } },
            error: null,
            message: null
        });
        const req = { user: { tenant_id: 'tenant-1' }, params: { jobId: 'job-123' } };
        const res = makeRes();

        await previewMenuImportJob(req, res);

        expect(mockPreviewMenuImportJobUseCase).toHaveBeenCalledWith({ tenantId: 'tenant-1', jobId: 'job-123' });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true, data: { rows: [], merge: { conflicts: [] } } });
    });

    it('maps a JOB_NOT_READY failure to a 409 with the business error_code', async () => {
        mockPreviewMenuImportJobUseCase.mockResolvedValue({
            success: false,
            data: null,
            error: { code: 'CONFLICT', statusCode: 409, message: 'This import job is still processing.', details: { code: 'JOB_NOT_READY', status: 'running' } },
            message: null
        });
        const req = { user: { tenant_id: 'tenant-1' }, params: { jobId: 'job-123' } };
        const res = makeRes();

        await previewMenuImportJob(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(false);
        expect(payload.error_code).toBe('JOB_NOT_READY');
    });

    it('responds 500 if the use case throws', async () => {
        mockPreviewMenuImportJobUseCase.mockRejectedValue(new Error('boom'));
        const req = { user: { tenant_id: 'tenant-1' }, params: { jobId: 'job-123' } };
        const res = makeRes();

        await previewMenuImportJob(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
});
