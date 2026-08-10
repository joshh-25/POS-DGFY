/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TERMINAL_STATUSES = ['completed', 'completed_with_errors', 'failed'];

const createMenuImportJob = vi.fn();
const getMenuImportJob = vi.fn();
const previewMenuImportJob = vi.fn();
const confirmMenuImport = vi.fn();

vi.mock('../../services/menuImportService.js', () => ({
    createMenuImportJob: (...args) => createMenuImportJob(...args),
    getMenuImportJob: (...args) => getMenuImportJob(...args),
    previewMenuImportJob: (...args) => previewMenuImportJob(...args),
    confirmMenuImport: (...args) => confirmMenuImport(...args),
    isMenuImportTerminalStatus: (status) => TERMINAL_STATUSES.includes(status)
}));

let useMenuImportJob;
let MENU_IMPORT_POLL_INTERVAL_MS;
let MENU_IMPORT_POLL_TIMEOUT_MS;

const jobAt = (status, totals) => ({
    job_id: 'job-1',
    status,
    totals,
    files: []
});

describe('useMenuImportJob', () => {
    beforeAll(async () => {
        ({ useMenuImportJob, MENU_IMPORT_POLL_INTERVAL_MS, MENU_IMPORT_POLL_TIMEOUT_MS } = await import('../useMenuImportJob.js'));
    });

    beforeEach(() => {
        vi.useFakeTimers();
        createMenuImportJob.mockReset();
        getMenuImportJob.mockReset();
        previewMenuImportJob.mockReset();
        confirmMenuImport.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uploads, polls until the job settles, then loads the merged preview', async () => {
        createMenuImportJob.mockResolvedValue({ job_id: 'job-1', total_files: 2 });
        getMenuImportJob
            .mockResolvedValueOnce(jobAt('running', { files: 2, completed: 1, failed: 0, pending: 1 }))
            .mockResolvedValueOnce(jobAt('completed', { files: 2, completed: 2, failed: 0, pending: 0 }));
        previewMenuImportJob.mockResolvedValue({ rows: [{ rowNumber: 1 }], merge: { items_after_dedup: 1 } });

        const onReady = vi.fn();
        const { result } = renderHook(() => useMenuImportJob());

        await act(async () => {
            await result.current.startJob([new File(['a'], 'a.jpg')], { onReady });
        });

        expect(result.current.phase).toBe('processing');
        expect(result.current.progress.total).toBe(2);
        expect(onReady).not.toHaveBeenCalled();

        // First poll: still running, progress reflects the partial result.
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(result.current.job.status).toBe('running');
        expect(result.current.progress.percent).toBe(50);

        // Second poll: terminal, so the preview is fetched automatically.
        await act(async () => { await vi.advanceTimersByTimeAsync(MENU_IMPORT_POLL_INTERVAL_MS); });

        expect(result.current.phase).toBe('ready');
        expect(previewMenuImportJob).toHaveBeenCalledWith('job-1');
        expect(result.current.previewData.rows).toHaveLength(1);
        expect(result.current.progress.percent).toBe(100);
        expect(onReady).toHaveBeenCalledTimes(1);
        expect(onReady.mock.calls[0][0].rows).toHaveLength(1);
    });

    it('stops polling and surfaces the server message when the upload is rejected', async () => {
        createMenuImportJob.mockRejectedValue({
            response: { data: { message: 'A batch may contain at most 20 files.', error_code: 'TOO_MANY_FILES' } }
        });

        const { result } = renderHook(() => useMenuImportJob());

        let outcome;
        await act(async () => {
            outcome = await result.current.startJob([new File(['a'], 'a.jpg')]);
        });

        expect(outcome.success).toBe(false);
        expect(result.current.phase).toBe('error');
        expect(result.current.error).toBe('A batch may contain at most 20 files.');
        expect(result.current.errorCode).toBe('TOO_MANY_FILES');
        expect(getMenuImportJob).not.toHaveBeenCalled();
    });

    it('reports a job that never settles instead of polling forever', async () => {
        createMenuImportJob.mockResolvedValue({ job_id: 'job-1', total_files: 1 });
        getMenuImportJob.mockResolvedValue(jobAt('running', { files: 1, completed: 0, failed: 0, pending: 1 }));

        const { result } = renderHook(() => useMenuImportJob());

        await act(async () => {
            await result.current.startJob([new File(['a'], 'a.jpg')]);
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(MENU_IMPORT_POLL_TIMEOUT_MS + MENU_IMPORT_POLL_INTERVAL_MS);
        });

        expect(result.current.phase).toBe('error');
        expect(result.current.errorCode).toBe('POLL_TIMEOUT');

        const callsAtTimeout = getMenuImportJob.mock.calls.length;
        await act(async () => { await vi.advanceTimersByTimeAsync(MENU_IMPORT_POLL_INTERVAL_MS * 5); });
        expect(getMenuImportJob).toHaveBeenCalledTimes(callsAtTimeout);
    });

    it('abandons an in-flight job on reset so a stale poll can never overwrite a new run', async () => {
        createMenuImportJob.mockResolvedValue({ job_id: 'job-1', total_files: 1 });
        getMenuImportJob.mockResolvedValue(jobAt('running', { files: 1, completed: 0, failed: 0, pending: 1 }));

        const { result } = renderHook(() => useMenuImportJob());

        await act(async () => {
            await result.current.startJob([new File(['a'], 'a.jpg')]);
        });
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });

        const callsBeforeReset = getMenuImportJob.mock.calls.length;
        act(() => { result.current.reset(); });

        expect(result.current.phase).toBe('idle');
        expect(result.current.job).toBeNull();

        await act(async () => { await vi.advanceTimersByTimeAsync(MENU_IMPORT_POLL_INTERVAL_MS * 5); });
        expect(getMenuImportJob).toHaveBeenCalledTimes(callsBeforeReset);
        expect(result.current.phase).toBe('idle');
    });

    it('confirms the edited rows and reports the created/failed counts', async () => {
        confirmMenuImport.mockResolvedValue({ createdCount: 3, failedCount: 1 });

        const { result } = renderHook(() => useMenuImportJob());

        let outcome;
        await act(async () => {
            outcome = await result.current.confirmImport([{ rowNumber: 1, included: true }]);
        });

        expect(confirmMenuImport).toHaveBeenCalledWith([{ rowNumber: 1, included: true }], undefined);
        expect(outcome).toEqual({ success: true, data: { createdCount: 3, failedCount: 1 } });
        expect(result.current.phase).toBe('done');
    });

    it('passes confirmImport options (e.g. markAlwaysAvailable) through to the service call', async () => {
        confirmMenuImport.mockResolvedValue({ createdCount: 1, failedCount: 0 });

        const { result } = renderHook(() => useMenuImportJob());

        await act(async () => {
            await result.current.confirmImport([{ rowNumber: 1 }], { markAlwaysAvailable: true });
        });

        expect(confirmMenuImport).toHaveBeenCalledWith([{ rowNumber: 1 }], { markAlwaysAvailable: true });
    });
});
