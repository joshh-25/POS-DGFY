import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/services/api.js', () => ({ default: api }));

import {
  POS_BULK_IMAGE_CHUNK_BYTES,
  getAllPosCatalogImageImportResults,
  retryFailedPosCatalogImageImport,
  uploadPosCatalogImagePackage,
  waitForPosCatalogImageImport
} from '@/services/posCatalogService.js';

describe('POS catalog image package transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', {
      randomUUID: () => '12345678-1234-4234-8234-123456789abc',
      subtle: { digest: async () => new Uint8Array(32).buffer }
    });
  });

  it('uploads ZIP chunks in order and reports terminal status', async () => {
    const zipFile = new File([new Uint8Array(POS_BULK_IMAGE_CHUNK_BYTES + 2)], 'images.zip', { type: 'application/zip' });
    const csvFile = new File(['sku_code,image_filename,replace_existing\nSKU-1,one.jpg,true\n'], 'manifest.csv', { type: 'text/csv' });
    api.post
      .mockResolvedValueOnce({ data: { data: { job_id: 'job-1' } } })
      .mockResolvedValueOnce({ data: { data: { job_id: 'job-1', status: 'queued' } } });
    api.put.mockResolvedValue({ data: { data: {} } });
    api.get.mockResolvedValue({ data: { data: {
      job_id: 'job-1', status: 'completed', totals: { files: 1, completed: 1, failed: 0 },
      pagination: { pages: 1 }, files: [{ file_id: 'file-1', status: 'completed' }]
    } } });
    const progress = vi.fn();

    const result = await uploadPosCatalogImagePackage({ zipFile, csvFile }, { onProgress: progress });

    expect(api.put).toHaveBeenCalledTimes(2);
    expect(api.put.mock.calls.map(([url]) => url)).toEqual([
      '/pos/catalog-image-imports/job-1/chunks/0',
      '/pos/catalog-image-imports/job-1/chunks/1'
    ]);
    expect(api.post.mock.calls[0][2]).toMatchObject({
      headers: { 'Idempotency-Key': `pos-bulk-${'00'.repeat(32)}` }
    });
    expect(progress).toHaveBeenLastCalledWith({ stage: 'uploading', processed: 2, total: 2 });
    expect(result.status).toBe('completed');
  });

  it('hydrates all paginated file results and retries failed files', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: { job_id: 'job-2', pagination: { pages: 2 }, files: [{ file_id: 'one' }] } } })
      .mockResolvedValueOnce({ data: { data: { job_id: 'job-2', pagination: { pages: 2 }, files: [{ file_id: 'two' }] } } });
    api.post.mockResolvedValueOnce({ data: { data: { job_id: 'job-2', queued: 1 } } });

    const result = await getAllPosCatalogImageImportResults('job-2');
    expect(result.files.map((file) => file.file_id)).toEqual(['one', 'two']);
    await expect(retryFailedPosCatalogImageImport('job-2')).resolves.toMatchObject({ queued: 1 });
    expect(api.post).toHaveBeenCalledWith('/pos/catalog-image-imports/job-2/retry-failed');
  });

  it('releases the abort listener after each completed polling wait', async () => {
    api.get
      .mockResolvedValueOnce({ data: { data: { job_id: 'job-3', status: 'processing' } } })
      .mockResolvedValueOnce({ data: { data: { job_id: 'job-3', status: 'completed', pagination: { pages: 1 }, files: [] } } })
      .mockResolvedValueOnce({ data: { data: { job_id: 'job-3', status: 'completed', pagination: { pages: 1 }, files: [] } } });
    const signal = {
      aborted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    await expect(waitForPosCatalogImageImport('job-3', { pollMs: 0, signal }))
      .resolves.toMatchObject({ status: 'completed' });
    expect(signal.addEventListener).toHaveBeenCalledTimes(1);
    expect(signal.removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
