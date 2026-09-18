import fs from 'fs/promises';
import {
    POS_BULK_IMAGE_IMPORT_MAX_ATTEMPTS,
    POS_BULK_IMAGE_IMPORT_WORKER_CONCURRENCY
} from '../config/posBulkImageImportFeature.js';
import logger from '../config/logger.js';
import { uploadPosCatalogImageUseCase } from '../modules/pos/index.js';
import { posBulkImageImportJobRepository as jobs } from '../modules/pos/repositories/posBulkImageImportJobRepository.js';
import { posBulkImageImportStorage } from '../modules/pos/repositories/posBulkImageImportStorage.js';
import { posRepository } from '../modules/pos/repositories/posRepository.js';
import { publishCatalogChange } from '../modules/shared/services/catalogChangeEventBus.js';
import { findTenantById } from '../services/landlordService.js';
import dbStore from '../utils/dbStore.js';
import tenantConnector from '../utils/TenantConnector.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';

const ACTIVE_POLL_MS = 250;
const IDLE_POLL_MS = 3000;
let timer = null;
let running = false;
let inFlight = 0;
let recoveryDone = false;

const unlinkQuietly = async (filePath) => {
    if (filePath) await fs.unlink(filePath).catch(() => {});
};

const buildTenantContext = async (tenantId) => {
    const tenant = await findTenantById(tenantId);
    if (!tenant) throw Object.assign(new Error('Tenant not found'), { code: 'TENANT_NOT_FOUND' });
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

const cleanupTerminalJob = async ({ tenantId, jobId, jobRepository = jobs, importStorage = posBulkImageImportStorage }) => {
    const job = await jobRepository.readInternal({ tenantId, jobId });
    if (!job || job.files.some((file) => !['completed', 'failed', 'skipped_existing', 'superseded'].includes(file.status))) return;
    if (job.files.some((file) => file.status === 'failed' && Number(file.attempts || 0) < POS_BULK_IMAGE_IMPORT_MAX_ATTEMPTS)) return;
    await importStorage.cleanup({ jobId });
};

export const createProcessPosBulkImageImportTask = ({
    jobRepository = jobs,
    itemRepository = posRepository,
    uploadImage = uploadPosCatalogImageUseCase,
    tenantContextBuilder = buildTenantContext,
    publishChange = publishCatalogChange,
    importStorage = posBulkImageImportStorage
} = {}) => async (task) => {
    const { tenantId, jobId, fileId, queueRaw } = task || {};
    if (!tenantId || !jobId || !fileId || !queueRaw) return;
    const begun = await jobRepository.beginFile({ tenantId, jobId, fileId });
    if (!begun) return;
    const { record, leaseToken } = begun;
    let itemToken = null;
    try {
        itemToken = await jobRepository.acquireItemLease({ tenantId, itemId: record.item_id });
        if (!itemToken) {
            await jobRepository.deferFile({ tenantId, jobId, fileId, leaseToken, queueRaw });
            return;
        }
        if (!await jobRepository.isCurrentVersion({ tenantId, itemId: record.item_id, version: record.version })) {
            await unlinkQuietly(record.path);
            await jobRepository.finishFile({ tenantId, jobId, fileId, leaseToken, queueRaw, result: { status: 'superseded' } });
            return;
        }
        const job = await jobRepository.readInternal({ tenantId, jobId });
        if (!job?.actor) throw Object.assign(new Error('Import actor is unavailable'), { code: 'IMPORT_ACTOR_MISSING' });
        const context = await tenantContextBuilder(tenantId);
        const outcome = await dbStore.run(context, async () => {
            const existing = await itemRepository.findCatalogOverrideByItemId(record.item_id);
            if (!record.replace_existing && (existing?.pos_image_path || existing?.pos_image_url)) {
                return { skipped: true, imageUrl: existing.pos_image_url || null };
            }
            const result = await uploadImage({
                itemId: record.item_id,
                file: { path: record.path, originalname: record.filename, mimetype: record.mimetype, size: record.size },
                user: job.actor
            });
            if (!result?.success) throw result?.error || new Error('POS image upload failed');
            return { skipped: false, imageUrl: result.data?.pos_image_url || result.data?.image_url || null };
        });
        if (outcome.skipped) await unlinkQuietly(record.path);
        const stillCurrent = await jobRepository.isCurrentVersion({ tenantId, itemId: record.item_id, version: record.version });
        const status = stillCurrent ? (outcome.skipped ? 'skipped_existing' : 'completed') : 'superseded';
        await jobRepository.finishFile({
            tenantId, jobId, fileId, leaseToken, queueRaw,
            result: { status, image_url: outcome.imageUrl, error_code: null, error_message: null }
        });
        await cleanupTerminalJob({ tenantId, jobId, jobRepository, importStorage });
        await publishChange({ tenantId, reason: 'pos_bulk_image_import_file_completed', itemIds: [record.item_id] });
    } catch (error) {
        // Retain the private source while a failed-only retry is still allowed.
        // It is deleted after the final attempt or consumed by a successful store.
        if (Number(record.attempts || 0) >= POS_BULK_IMAGE_IMPORT_MAX_ATTEMPTS) {
            await unlinkQuietly(record.path);
        }
        await jobRepository.finishFile({
            tenantId, jobId, fileId, leaseToken, queueRaw,
            result: {
                status: 'failed',
                error_code: error?.code || 'POS_BULK_IMAGE_PROCESSING_FAILED',
                error_message: String(error?.message || 'Image processing failed').slice(0, 300)
            }
        }).catch(() => {});
        await cleanupTerminalJob({ tenantId, jobId, jobRepository, importStorage }).catch(() => {});
        logger.error('[PosBulkImageImportWorker] File failed', { tenantId, jobId, fileId, reason: error?.message });
    } finally {
        if (itemToken) await jobRepository.releaseItemLease({ tenantId, itemId: record.item_id, token: itemToken }).catch(() => {});
    }
};

export const processPosBulkImageImportTask = createProcessPosBulkImageImportTask();

const tick = async () => {
    if (!running) return;
    let foundWork = false;
    try {
        // Run recovery once per process after Redis becomes reachable. Repeating
        // it every poll would create a dequeue-to-lease race across API replicas.
        if (!recoveryDone) {
            await jobs.recoverAbandoned();
            recoveryDone = true;
        }
        while (inFlight < POS_BULK_IMAGE_IMPORT_WORKER_CONCURRENCY) {
            const slotToken = await jobs.acquireWorkerSlot({ concurrency: POS_BULK_IMAGE_IMPORT_WORKER_CONCURRENCY });
            if (!slotToken) break;
            const task = await jobs.dequeue();
            if (!task) {
                await jobs.releaseWorkerSlot(slotToken);
                break;
            }
            foundWork = true;
            inFlight += 1;
            processPosBulkImageImportTask(task)
                .catch((error) => logger.error('[PosBulkImageImportWorker] Unexpected task error', { reason: error?.message }))
                .finally(async () => {
                    inFlight -= 1;
                    await jobs.releaseWorkerSlot(slotToken).catch(() => {});
                });
        }
    } catch (error) {
        logger.error('[PosBulkImageImportWorker] Tick failed', { reason: error?.message });
    }
    timer = setTimeout(tick, foundWork ? ACTIVE_POLL_MS : IDLE_POLL_MS);
};

export const startPosBulkImageImportWorker = () => {
    if (running) return;
    running = true;
    recoveryDone = false;
    timer = setTimeout(tick, ACTIVE_POLL_MS);
    // Keep the worker alive when new submissions are disabled so packages that
    // were already accepted can drain and their results remain recoverable.
    logger.info(`[PosBulkImageImportWorker] Started (global concurrency=${POS_BULK_IMAGE_IMPORT_WORKER_CONCURRENCY})`);
};

export const stopPosBulkImageImportWorker = () => {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
};

export default { startPosBulkImageImportWorker, stopPosBulkImageImportWorker, processPosBulkImageImportTask };
