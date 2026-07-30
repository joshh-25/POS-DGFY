import { jest } from '@jest/globals';
import { buildPreviewMenuImportJobUseCase } from '../src/modules/menuImport/usecases/previewMenuImportJobUseCase.js';

const file = (overrides = {}) => ({
    file_id: 'file-1',
    status: 'completed',
    items: [{ name: 'Chicken Adobo', price: 180, section: 'Mains', description: null }],
    ...overrides
});

const job = (overrides = {}) => ({
    job_id: 'job-123',
    tenant_id: 'tenant-1',
    user_id: 1,
    created_at: '2026-07-28T00:00:00.000Z',
    status: 'completed',
    totals: { files: 1, completed: 1, failed: 0, pending: 0 },
    files: [file()],
    ...overrides
});

describe('buildPreviewMenuImportJobUseCase', () => {
    let menuImportJobRepository;
    let previewItemsImportUseCase;
    let buildSignedCsv;
    let useCase;

    beforeEach(() => {
        menuImportJobRepository = { readJob: jest.fn() };
        previewItemsImportUseCase = jest.fn();
        buildSignedCsv = jest.fn(() => 'sku_code,name\n');
        useCase = buildPreviewMenuImportJobUseCase({ menuImportJobRepository, previewItemsImportUseCase, buildSignedCsv });
    });

    it('rejects a missing jobId', async () => {
        const result = await useCase({ tenantId: 'tenant-1', jobId: '' });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(400);
        expect(menuImportJobRepository.readJob).not.toHaveBeenCalled();
    });

    it('returns JOB_EXPIRED_OR_NOT_FOUND when the job is missing', async () => {
        menuImportJobRepository.readJob.mockResolvedValue(null);
        const result = await useCase({ tenantId: 'tenant-1', jobId: 'job-123' });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
        expect(result.error.details.code).toBe('JOB_EXPIRED_OR_NOT_FOUND');
    });

    it.each(['queued', 'running'])('returns JOB_NOT_READY while status is %s', async (status) => {
        menuImportJobRepository.readJob.mockResolvedValue(job({ status }));
        const result = await useCase({ tenantId: 'tenant-1', jobId: 'job-123' });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(409);
        expect(result.error.details.code).toBe('JOB_NOT_READY');
        expect(previewItemsImportUseCase).not.toHaveBeenCalled();
    });

    it('returns NO_ITEMS_TO_PREVIEW when no file completed successfully', async () => {
        menuImportJobRepository.readJob.mockResolvedValue(job({
            status: 'failed',
            files: [file({ status: 'failed', items: undefined })]
        }));
        const result = await useCase({ tenantId: 'tenant-1', jobId: 'job-123' });
        expect(result.success).toBe(false);
        expect(result.error.details.code).toBe('NO_ITEMS_TO_PREVIEW');
    });

    it('returns MERGED_ITEM_LIMIT_EXCEEDED when the deduped item count exceeds the cap', async () => {
        const manyItems = Array.from({ length: 201 }, (_, i) => ({ name: `Item ${i}`, price: 100, section: null, description: null }));
        menuImportJobRepository.readJob.mockResolvedValue(job({ files: [file({ items: manyItems })] }));
        const result = await useCase({ tenantId: 'tenant-1', jobId: 'job-123' });
        expect(result.success).toBe(false);
        expect(result.error.details.code).toBe('MERGED_ITEM_LIMIT_EXCEEDED');
        expect(result.error.details.max_items).toBe(200);
        expect(result.error.details.submitted).toBe(201);
        expect(previewItemsImportUseCase).not.toHaveBeenCalled();
    });

    it('propagates a previewItemsImportUseCase failure as-is', async () => {
        menuImportJobRepository.readJob.mockResolvedValue(job());
        const failure = { success: false, data: null, error: { code: 'VALIDATION_FAILED' }, message: null };
        previewItemsImportUseCase.mockResolvedValue(failure);
        const result = await useCase({ tenantId: 'tenant-1', jobId: 'job-123' });
        expect(result).toBe(failure);
    });

    it('merges across files, annotates conflicted rows, and returns merge metadata', async () => {
        menuImportJobRepository.readJob.mockResolvedValue(job({
            totals: { files: 3, completed: 2, failed: 1, pending: 0 },
            files: [
                file({ file_id: 'a', items: [{ name: 'Chicken Adobo', price: 180, section: 'Mains', description: null }] }),
                file({ file_id: 'b', items: [{ name: 'Chicken Adobo', price: 185, section: 'Mains', description: null }] }),
                file({ file_id: 'c', status: 'failed', items: undefined })
            ]
        }));
        previewItemsImportUseCase.mockResolvedValue({
            success: true,
            data: { totalRows: 1, validRows: 1, invalidRows: 0, rows: [{ rowNumber: 1, name: 'Chicken Adobo', action: 'CREATE' }] },
            error: null,
            message: null
        });

        const result = await useCase({ tenantId: 'tenant-1', jobId: 'job-123' });

        expect(result.success).toBe(true);
        expect(buildSignedCsv).toHaveBeenCalledWith(
            [expect.objectContaining({ name: 'Chicken Adobo', price: 180, price_conflict: true, observed_prices: [180, 185] })],
            { batchToken: 'JOB123' }
        );
        expect(result.data.rows).toEqual([
            expect.objectContaining({ rowNumber: 1, price_conflict: true, observed_prices: [180, 185] })
        ]);
        expect(result.data.merge).toEqual({
            files_considered: 2,
            files_excluded: 1,
            items_before_dedup: 2,
            items_after_dedup: 1,
            conflicts: [{ name: 'Chicken Adobo', chosen_price: 180, observed_prices: [180, 185], index: 0 }],
            near_duplicates: []
        });
    });
});
