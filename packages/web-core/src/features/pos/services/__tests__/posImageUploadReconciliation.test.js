// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../../services/storefrontCatalogService.js', () => ({ getStorefrontCatalogImageUploadStatus: vi.fn() }));
import { reconcilePosImageUploads } from '../posImageUploadReconciliation.js';
import {
  stagePendingPosItemImagePreview,
  bindPendingPosItemImagePreviewJob,
  getPendingPosItemImagePreviews,
  markPendingPosItemImagePreviewUncertain,
  resetPendingPosItemImagePreviews
} from '../posPendingItemImagePreviewStore.js';

const item = { item_id: 22, storefront_image_url: '/uploads/old.webp', pos_image_source: 'override', pos_image_url: '/uploads/new.webp', pos_image_variants: { pos_thumbnail_url: '/uploads/new144.webp' } };
const begin = () => {
  const attemptId = stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:preview' });
  bindPendingPosItemImagePreviewJob({ itemId: 22, attemptId, jobId: 'job' });
  return attemptId;
};
afterEach(resetPendingPosItemImagePreviews);
describe('event-driven POS upload reconciliation', () => {
  it('retains a preview after a status read fails', async () => {
    begin();
    await reconcilePosImageUploads([item], async () => { throw new Error('offline'); });
    expect(getPendingPosItemImagePreviews()['22'].url).toBe('blob:preview');
    expect(getPendingPosItemImagePreviews()['22'].readyUrl).toBe('');
  });
  it('rejects completed status paired with a stale catalog version', async () => {
    begin();
    await reconcilePosImageUploads([item], async () => ({ job_id: 'job', status: 'completed', image_url: '/uploads/other.webp' }));
    expect(getPendingPosItemImagePreviews()['22'].readyUrl).toBe('');
  });
  it('offers only the matching authorized catalog thumbnail, retaining the local preview', async () => {
    begin();
    await reconcilePosImageUploads([item], async () => ({ job_id: 'job', status: 'completed', image_url: item.storefront_image_url }));
    expect(getPendingPosItemImagePreviews()['22']).toMatchObject({ url: 'blob:preview', readyUrl: '/uploads/new144.webp', status: 'ready' });
  });
  it('reconciles an uncertain attempt before allowing a retry', async () => {
    const attemptId = stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:preview', fileKeys: ['dish'] });
    markPendingPosItemImagePreviewUncertain({ itemId: 22, attemptId });
    await reconcilePosImageUploads([item], async () => ({ job_id: 'recovered-job', status: 'processing' }));
    expect(getPendingPosItemImagePreviews()['22']).toMatchObject({
      attemptId,
      jobId: 'recovered-job',
      status: 'processing',
      fileKeys: ['dish']
    });
  });
  it('does not let a late status response change a newer attempt', async () => {
    begin();
    let finish;
    const pending = reconcilePosImageUploads([item], () => new Promise((resolve) => { finish = resolve; }));
    await Promise.resolve();
    stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:newer' });
    finish({ job_id: 'job', status: 'completed', image_url: item.storefront_image_url });
    await pending;
    expect(getPendingPosItemImagePreviews()['22']).toMatchObject({ url: 'blob:newer', readyUrl: '' });
  });
});
