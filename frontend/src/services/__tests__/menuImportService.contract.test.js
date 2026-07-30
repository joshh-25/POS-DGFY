import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = {
    get: vi.fn(),
    post: vi.fn()
};

vi.mock('../api.js', () => ({ default: apiMock }));

const loadService = async () => import('../menuImportService.js');

describe('menuImportService batch contract', () => {
    beforeEach(() => {
        apiMock.get.mockReset();
        apiMock.post.mockReset();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('stays disabled unless VITE_MENU_IMPORT_BATCH_ENABLED is exactly "true"', async () => {
        const { isMenuImportBatchEnabled } = await loadService();

        vi.stubEnv('VITE_MENU_IMPORT_BATCH_ENABLED', '');
        expect(isMenuImportBatchEnabled()).toBe(false);

        vi.stubEnv('VITE_MENU_IMPORT_BATCH_ENABLED', 'yes');
        expect(isMenuImportBatchEnabled()).toBe(false);

        vi.stubEnv('VITE_MENU_IMPORT_BATCH_ENABLED', 'true');
        expect(isMenuImportBatchEnabled()).toBe(true);
    });

    it('uploads every file under the multipart "files" field the batch route expects', async () => {
        const { createMenuImportJob } = await loadService();
        apiMock.post.mockResolvedValue({ data: { data: { job_id: 'job-1', total_files: 2 } } });

        const files = [new File(['a'], 'a.jpg'), new File(['b'], 'b.pdf')];
        const created = await createMenuImportJob(files);

        expect(apiMock.post).toHaveBeenCalledTimes(1);
        const [path, formData] = apiMock.post.mock.calls[0];
        expect(path).toBe('/items/import/menu/jobs');
        expect(formData).toBeInstanceOf(FormData);
        expect(formData.getAll('files')).toHaveLength(2);
        expect(created).toEqual({ job_id: 'job-1', total_files: 2 });
    });

    it('polls, previews, and confirms against the batch routes', async () => {
        const { getMenuImportJob, previewMenuImportJob, confirmMenuImport } = await loadService();

        apiMock.get.mockResolvedValue({ data: { data: { job_id: 'job-1', status: 'running' } } });
        await getMenuImportJob('job-1');
        expect(apiMock.get).toHaveBeenCalledWith('/items/import/menu/jobs/job-1');

        apiMock.post.mockResolvedValue({ data: { data: { rows: [], merge: {} } } });
        await previewMenuImportJob('job-1');
        expect(apiMock.post).toHaveBeenCalledWith('/items/import/menu/jobs/job-1/preview');

        apiMock.post.mockResolvedValue({ data: { data: { createdCount: 1 } } });
        await confirmMenuImport([{ rowNumber: 1 }]);
        expect(apiMock.post).toHaveBeenCalledWith('/items/import/menu/confirm', { rows: [{ rowNumber: 1 }] });
    });

    it('treats only the three server-derived terminal statuses as done', async () => {
        const { isMenuImportTerminalStatus } = await loadService();

        expect(isMenuImportTerminalStatus('completed')).toBe(true);
        expect(isMenuImportTerminalStatus('completed_with_errors')).toBe(true);
        expect(isMenuImportTerminalStatus('failed')).toBe(true);
        expect(isMenuImportTerminalStatus('queued')).toBe(false);
        expect(isMenuImportTerminalStatus('running')).toBe(false);
    });
});
