import { getStorefrontCatalogImageUploadStatus } from '../../../services/storefrontCatalogService.js';
import { resolvePosCatalogImageSources } from '../utils/posCheckoutTerminalUtils.js';
import {
  getPendingPosItemImagePreviews, completePendingPosItemImagePreview,
  bindPendingPosItemImagePreviewJob, markPendingPosItemImagePreviewFailed
} from './posPendingItemImagePreviewStore.js';

// Invoked by successful authorized catalog reads, not a per-item polling timer.
const active = new Map();
export const reconcilePosImageUploads = async (catalog, readStatus = getStorefrontCatalogImageUploadStatus) => {
  for (const item of catalog) {
    const pending = getPendingPosItemImagePreviews()[String(item.item_id)];
    if (!pending || ['ready', 'failed'].includes(pending.status)) continue;
    const key = pending.attemptId;
    try {
      if (!active.has(key)) active.set(key, Promise.resolve().then(() => readStatus(item.item_id)));
      const status = await active.get(key);
      const statusJobId = String(status?.job_id || '').trim();
      if (!statusJobId || (pending.jobId && statusJobId !== pending.jobId)) continue;
      // A network failure can leave the client without the job ID even though
      // the server accepted the request. A normal authorized catalog read is
      // the reconciliation boundary: bind the returned status job before
      // applying its terminal result, so retries cannot duplicate the upload.
      if (!pending.jobId) {
        bindPendingPosItemImagePreviewJob({ itemId: item.item_id, attemptId: key, jobId: statusJobId });
      }
      const identity = { itemId: item.item_id, attemptId: key, jobId: statusJobId };
      if (status.status === 'failed') {
        markPendingPosItemImagePreviewFailed(identity);
      } else if (status.status === 'completed' && status.image_url
        && status.image_url === item.storefront_image_url) {
        completePendingPosItemImagePreview({ ...identity, url: resolvePosCatalogImageSources(item).src, resultUrl: item.pos_image_url || status.image_url });
      }
    } catch {
      // Failed status/catalog reads never retire the preview; online/visibility
      // and the existing catalog invalidation fallback will reconcile it later.
    } finally {
      active.delete(key);
    }
  }
};
