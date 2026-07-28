import { jest } from '@jest/globals';

// This suite exercises processFileTask (exported from menuImportWorker.js for
// focused unit testing — see that file's comment) directly rather than
// driving the real tick()/setTimeout poll loop; processFileTask is where all
// the actual per-file behavior — including the "one bad file must not affect
// another" isolation guarantee — lives.
//
// modules/menuImport/index.js and services/menuExtractionService.js are
// fully mocked (jest.unstable_mockModule) rather than partially — that keeps
// this suite from needing any of their transitive dependencies (Redis
// hashes, Sequelize models, the OpenAI SDK) to actually load.
class MockMenuExtractionError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'MenuExtractionError';
        this.code = code;
    }
}

const mockBeginProcessingFile = jest.fn();
const mockSetFileResult = jest.fn();
const mockExtractMenuItemsFromFile = jest.fn();

jest.unstable_mockModule('../src/modules/menuImport/index.js', () => ({
    menuImportJobRepository: {
        beginProcessingFile: mockBeginProcessingFile,
        setFileResult: mockSetFileResult
    }
}));

jest.unstable_mockModule('../src/services/menuExtractionService.js', () => ({
    extractMenuItemsFromFile: mockExtractMenuItemsFromFile,
    MenuExtractionError: MockMenuExtractionError
}));

const mockReadFile = jest.fn();
const mockUnlink = jest.fn();
jest.unstable_mockModule('fs/promises', () => ({
    default: { readFile: mockReadFile, unlink: mockUnlink }
}));

describe('menuImportWorker.processFileTask', () => {
    let processFileTask;

    beforeAll(async () => {
        const mod = await import('../src/workers/menuImportWorker.js');
        processFileTask = mod.processFileTask;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockReadFile.mockResolvedValue(Buffer.from('fake-bytes'));
        mockUnlink.mockResolvedValue(undefined);
    });

    const fileRecord = (overrides = {}) => ({
        file_id: 'f1',
        path: '/tmp/f1.png',
        mime_type: 'image/png',
        tenant_id: 'tenant-1',
        user_id: 42,
        status: 'processing',
        ...overrides
    });

    it('records a completed result and unlinks the temp file on success', async () => {
        mockBeginProcessingFile.mockResolvedValue(fileRecord());
        mockExtractMenuItemsFromFile.mockResolvedValue({
            items: [{ name: 'Iced Tea', price: 60, section: null, description: null }],
            kind: 'image',
            pages: 1
        });

        await processFileTask({ tenantId: 'tenant-1', jobId: 'job-1', fileId: 'f1' });

        expect(mockExtractMenuItemsFromFile).toHaveBeenCalledWith(
            Buffer.from('fake-bytes'),
            'image/png',
            { tenant_id: 'tenant-1', user_id: 42 }
        );
        expect(mockSetFileResult).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            jobId: 'job-1',
            fileId: 'f1',
            result: {
                status: 'completed',
                items: [{ name: 'Iced Tea', price: 60, section: null, description: null }],
                kind: 'image',
                pages: 1
            }
        });
        expect(mockUnlink).toHaveBeenCalledWith('/tmp/f1.png');
    });

    it('records a failed result with the extraction error code, and still unlinks the file', async () => {
        mockBeginProcessingFile.mockResolvedValue(fileRecord({ file_id: 'f2', path: '/tmp/f2.pdf' }));
        mockExtractMenuItemsFromFile.mockRejectedValue(new MockMenuExtractionError('no legible text', 'PDF_TEXT_EMPTY'));

        // Never throws — a bad file must not take down the caller (the worker's
        // concurrency loop treats each task independently).
        await expect(processFileTask({ tenantId: 'tenant-1', jobId: 'job-1', fileId: 'f2' })).resolves.toBeUndefined();

        expect(mockSetFileResult).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            jobId: 'job-1',
            fileId: 'f2',
            result: { status: 'failed', error_code: 'PDF_TEXT_EMPTY', error_message: 'no legible text' }
        });
        expect(mockUnlink).toHaveBeenCalledWith('/tmp/f2.pdf');
    });

    it('falls back to EXTRACTION_REQUEST_FAILED for an error that is not a MenuExtractionError', async () => {
        mockBeginProcessingFile.mockResolvedValue(fileRecord());
        mockExtractMenuItemsFromFile.mockRejectedValue(new Error('unexpected boom'));

        await processFileTask({ tenantId: 'tenant-1', jobId: 'job-1', fileId: 'f1' });

        expect(mockSetFileResult).toHaveBeenCalledWith(expect.objectContaining({
            result: expect.objectContaining({ status: 'failed', error_code: 'EXTRACTION_REQUEST_FAILED', error_message: 'unexpected boom' })
        }));
    });

    it('does nothing when the file record is missing (job/file expired between enqueue and dequeue)', async () => {
        mockBeginProcessingFile.mockResolvedValue(null);

        await processFileTask({ tenantId: 'tenant-1', jobId: 'job-1', fileId: 'gone' });

        expect(mockExtractMenuItemsFromFile).not.toHaveBeenCalled();
        expect(mockSetFileResult).not.toHaveBeenCalled();
        expect(mockUnlink).not.toHaveBeenCalled();
    });

    // The core per-file isolation guarantee: one file failing has zero effect
    // on another file's outcome, whether processed sequentially or concurrently
    // (mirroring how the worker's tick() fires them off without awaiting each
    // other — see menuImportWorker.js's concurrency-capped loop).
    it('isolates failures — one file failing does not affect another file processed concurrently', async () => {
        mockBeginProcessingFile.mockImplementation(async ({ tenantId, fileId }) => fileRecord({
            file_id: fileId,
            path: `/tmp/${fileId}.png`,
            tenant_id: tenantId
        }));
        mockExtractMenuItemsFromFile.mockImplementation(async (buffer, mimeType, user) => {
            if (user.tenant_id === 'bad-file-tenant') {
                throw new MockMenuExtractionError('unreadable image', 'NO_ITEMS_EXTRACTED');
            }
            return { items: [{ name: 'OK Item', price: 10, section: null, description: null }], kind: 'image', pages: 1 };
        });

        await Promise.all([
            processFileTask({ tenantId: 'bad-file-tenant', jobId: 'job-1', fileId: 'bad' }),
            processFileTask({ tenantId: 'good-tenant', jobId: 'job-1', fileId: 'good' })
        ]);

        const results = mockSetFileResult.mock.calls.map((call) => call[0]);
        const badResult = results.find((r) => r.fileId === 'bad');
        const goodResult = results.find((r) => r.fileId === 'good');

        expect(badResult.result.status).toBe('failed');
        expect(badResult.result.error_code).toBe('NO_ITEMS_EXTRACTED');
        expect(goodResult.result.status).toBe('completed');
        expect(goodResult.result.items).toHaveLength(1);
        // Both files got their temp file cleaned up regardless of outcome.
        expect(mockUnlink).toHaveBeenCalledWith('/tmp/bad.png');
        expect(mockUnlink).toHaveBeenCalledWith('/tmp/good.png');
    });
});
