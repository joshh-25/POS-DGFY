// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBrowserSession, clearBrowserSession } from '../../../../services/browserSession.js';
import {
  stagePendingPosItemImagePreview,
  bindPendingPosItemImagePreviewJob,
  markPendingPosItemImagePreviewUncertain,
  clearPendingPosItemImagePreview,
  resetPendingPosItemImagePreviews,
  getPendingPosItemImagePreviews
} from '../posPendingItemImagePreviewStore.js';

describe('POS upload attempt isolation', () => {
  afterEach(resetPendingPosItemImagePreviews);
  beforeEach(() => {
    Object.entries(getPendingPosItemImagePreviews()).forEach(([itemId, entry]) => {
      clearPendingPosItemImagePreview({ itemId, attemptId: entry.attemptId });
    });
  });

  it('discards local previews on tenant switch and rejects old callbacks', () => {
    setBrowserSession({ token: 'session-a', companyToken: 'tenant-a' });
    const attemptId = stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:private-a' });
    setBrowserSession({ token: 'session-b', companyToken: 'tenant-b' });
    bindPendingPosItemImagePreviewJob({ itemId: 22, attemptId, jobId: 'old-job' });
    expect(getPendingPosItemImagePreviews()).toEqual({});
  });

  it('never exposes a preview after session clearing even without a window event', () => {
    setBrowserSession({ token: 'session', companyToken: 'tenant' });
    stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:private' });
    clearBrowserSession();
    expect(getPendingPosItemImagePreviews()).toEqual({});
  });

  it('does not let an old acknowledgement bind or clear a newer preview', () => {
    const first = stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:first' });
    stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:second' });
    bindPendingPosItemImagePreviewJob({ itemId: 22, attemptId: first, jobId: 'old-job' });
    clearPendingPosItemImagePreview({ itemId: 22, attemptId: first, jobId: 'old-job' });
    expect(getPendingPosItemImagePreviews()['22']?.url).toBe('blob:second');
    expect(getPendingPosItemImagePreviews()['22']?.jobId).toBeNull();
  });

  it('retains the accepted file intent when a network result is ambiguous', () => {
    const attemptId = stagePendingPosItemImagePreview({
      itemId: 22,
      url: 'blob:preview',
      fileKeys: ['dish\u001f10\u001f1\u001fimage/png'],
      galleryIntent: { base_keys: ['old.webp'] }
    });
    markPendingPosItemImagePreviewUncertain({ itemId: 22, attemptId });
    expect(getPendingPosItemImagePreviews()['22']).toMatchObject({
      status: 'uncertain',
      fileKeys: ['dish\u001f10\u001f1\u001fimage/png'],
      galleryIntent: { base_keys: ['old.webp'] }
    });
  });
});
