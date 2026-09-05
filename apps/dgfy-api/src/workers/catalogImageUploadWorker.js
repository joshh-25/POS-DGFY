import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ensurePosImageThumbnail } from '../modules/shared/utils/imageAssetStorage.js';
import logger from '../config/logger.js';
import { uploadStorefrontCatalogImageUseCase, uploadStorefrontCatalogGalleryImagesUseCase } from '../modules/inventory/index.js';
import { findTenantById } from '../services/landlordService.js';
import tenantConnector from '../utils/TenantConnector.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';
import dbStore from '../utils/dbStore.js';
import { publishCatalogChange } from '../modules/shared/services/catalogChangeEventBus.js';
import { setCatalogImageUploadStatus } from './catalogImageUploadStatusStore.js';

const POLL_INTERVAL_MS = 250;
const IDLE_INTERVAL_MS = 5000;
const WORKER_CONCURRENCY = Math.max(1, Number.parseInt(process.env.CATALOG_IMAGE_UPLOAD_WORKER_CONCURRENCY || '2', 10));

let timer = null;
let running = false;
let inFlight = 0;
const localQueue = [];
const activeItems = new Set();

const unlinkQuietly = async (filePath) => {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch {
        // The temp-file cleanup scheduler remains the final backstop.
    }
};

const buildTenantContext = async (tenantId) => {
    const tenant = await findTenantById(tenantId);
    if (!tenant) return null;
    const sequelize = await tenantConnector.getConnection(tenant);
    return {
        sequelize,
        tenantId: tenant.id,
        tenantToken: tenant.company_token,
        tenantName: tenant.name,
        tenantPlan: tenant.plan,
        ...getTenantModels(sequelize)
    };
};

const processTaskInTenantContext = async (task) => {
    const context = await buildTenantContext(task.tenant_id);
    if (!context) throw new Error('Tenant not found');

    const user = task.user || {
        tenant_id: task.tenant_id,
        user_id: task.user_id,
        permissions: task.permissions
    };
    const files = Array.isArray(task.files) ? task.files : [];

    return dbStore.run(context, () => (
        task.mode === 'gallery'
            ? uploadStorefrontCatalogGalleryImagesUseCase({ itemId: task.item_id, files, user })
            : uploadStorefrontCatalogImageUseCase({ itemId: task.item_id, file: files[0], user })
    ));
};

export const enqueueCatalogImageUpload = async ({ tenantId, user, itemId, mode = 'single', files = [] }) => {
    const jobId = crypto.randomUUID();
    const task = {
        job_id: jobId,
        tenant_id: tenantId,
        item_id: Number(itemId),
        mode,
        user: {
            tenant_id: user?.tenant_id || tenantId,
            user_id: user?.user_id || null,
            is_master_admin: user?.is_master_admin === true,
            permissions: Array.isArray(user?.permissions) ? [...user.permissions] : []
        },
        files: files.map((file) => ({
            path: file.path,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        }))
    };

    await setCatalogImageUploadStatus({
        tenantId,
        itemId,
        jobId,
        status: 'queued'
    });

    // Uploaded files live on this API process's local filesystem. Keeping the
    // task in-process guarantees the worker can read those paths; publishing
    // them through Redis could send a task to a different host where the file
    // does not exist. Redis remains appropriate for status fan-out only.
    localQueue.push(task);
    if (running) setImmediate(drainLocalQueue);

    return { job_id: jobId, item_id: Number(itemId), queued: true };
};

export const processCatalogImageUploadTask = async (task) => {
    const {
        job_id: jobId,
        tenant_id: tenantId,
        item_id: itemId
    } = task || {};
    const files = Array.isArray(task?.files) ? task.files : [];
    if (!jobId || !tenantId || !itemId || files.length === 0) {
        logger.warn('[CatalogImageUploadWorker] Discarding malformed task', { task });
        await Promise.all(files.map((file) => unlinkQuietly(file?.path)));
        return;
    }

    await setCatalogImageUploadStatus({ tenantId, itemId, jobId, status: 'processing' });
    try {
        const data = await processTaskInTenantContext(task);
        // Only the POS derivative is added; Storefront primary/gallery semantics stay intact.
        const gallery = typeof data?.storefront_image_gallery === 'string'
            ? JSON.parse(data.storefront_image_gallery) : data?.storefront_image_gallery;
        const imagePaths = new Set([data?.storefront_image_path, ...(Array.isArray(gallery) ? gallery.map((entry) => entry.path) : [])].filter(Boolean));
        for (const storedPath of imagePaths) {
            try {
                await ensurePosImageThumbnail({
                    uploadsRoot: fileURLToPath(new URL('../../uploads/', import.meta.url)), storedPath
                });
            } catch (error) {
                // The gallery is already committed. Do not report a persisted upload
                // as failed just because its optional POS derivative could not be made.
                logger.warn('[CatalogImageUploadWorker] POS thumbnail unavailable', { itemId, reason: error?.message });
            }
        }
        await setCatalogImageUploadStatus({ tenantId, itemId, jobId, status: 'completed', image_url: data?.storefront_image_url || null });
        await publishCatalogChange({
            tenantId,
            reason: 'catalog_image_upload_completed',
            itemIds: [itemId]
        });
        return data;
    } catch (error) {
        logger.error('[CatalogImageUploadWorker] Image optimization failed', {
            tenantId,
            itemId,
            jobId,
            reason: error?.message || 'Unknown image upload error'
        });
        await setCatalogImageUploadStatus({
            tenantId,
            itemId,
            jobId,
            status: 'failed',
            error_code: error?.code || 'CATALOG_IMAGE_UPLOAD_FAILED',
            error_message: error?.message || 'Image optimization failed'
        });
        await Promise.all(files.map((file) => unlinkQuietly(file?.path)));
        await publishCatalogChange({ tenantId, reason: 'catalog_image_upload_failed', itemIds: [itemId] });
    }
};

const drainLocalQueue = async () => {
    while (running && inFlight < WORKER_CONCURRENCY && localQueue.length > 0) {
        const nextIndex = localQueue.findIndex((entry) => !activeItems.has(`${entry.tenant_id}:${entry.item_id}`));
        if (nextIndex < 0) break;
        const [task] = localQueue.splice(nextIndex, 1);
        const itemKey = `${task.tenant_id}:${task.item_id}`;
        activeItems.add(itemKey);
        inFlight++;
        processCatalogImageUploadTask(task)
            .catch((error) => logger.error('[CatalogImageUploadWorker] Unexpected local task failure', { reason: error?.message }))
            .finally(() => { inFlight--; activeItems.delete(itemKey); if (running) setImmediate(drainLocalQueue); });
    }
};

const tick = async () => {
    if (!running) return;
    let dequeued = 0;
    try {
        await drainLocalQueue();
    } catch (error) {
        logger.error('[CatalogImageUploadWorker] Tick failed', { reason: error?.message });
    }
    timer = setTimeout(tick, dequeued > 0 || localQueue.length > 0 ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS);
};

export const startCatalogImageUploadWorker = () => {
    if (running) return;
    running = true;
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    logger.info(`[CatalogImageUploadWorker] Started (concurrency=${WORKER_CONCURRENCY})`);
};

export const stopCatalogImageUploadWorker = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    running = false;
    logger.info('[CatalogImageUploadWorker] Stopped');
};

export default {
    enqueueCatalogImageUpload,
    processCatalogImageUploadTask,
    startCatalogImageUploadWorker,
    stopCatalogImageUploadWorker
};
