/**
 * Item Image Generation Worker
 *
 * Drains the Redis-backed queue populated by both callers of
 * services/itemImageGenerationService.js: the batch menu-import confirm step
 * (#176, via enqueueItemImageGeneration from menuImportController.js) and the
 * "Generate an Image" action for existing items (#197). One task = one item.
 *
 * Queue mechanics: same lPush/rPop FIFO convention as
 * workers/menuImportWorker.js and workers/geoInventoryWorker.js, with an
 * in-flight concurrency cap (ITEM_IMAGE_WORKER_CONCURRENCY) rather than a
 * fixed per-tick batch, since each task here is an OpenAI image-generation
 * call, not a fast DB upsert.
 *
 * --- The deliberate ADR 0049 departure ------------------------------------
 *
 * Unlike workers/menuImportWorker.js, this worker DOES touch the tenant
 * database — attaching a generated image to a specific item is inherently a
 * tenant-scoped write. ADR 0049 deliberately keeps the menu-import worker
 * DB-free; this worker cannot follow that rule and still do its job, so it
 * establishes tenant context per task the same way
 * modules/dgfy/usecases/dgfyCustomerUseCases.js's withTenantContext() does:
 * resolve the Tenant row, open its connection via TenantConnector, build the
 * tenant model set, and run the attach step inside dbStore.run(...). Without
 * this, modules/inventory/repositories/storefrontCatalogImageStorage.js falls
 * back to dbStore.getStore()?.tenantId ?? 'default' and every generated image
 * would land under the 'default' tenant folder — silently wrong for every
 * real tenant. See the ADR 0049 amendment this PR adds.
 *
 * Image *generation* itself (the OpenAI call + watermark) stays outside that
 * tenant context — services/itemImageGenerationService.js is deliberately
 * DB-agnostic, so there's no reason to hold a tenant DB connection open for
 * it, and it lets a tenant-lookup failure short-circuit before spending
 * anything.
 */

import fs from 'fs/promises';
import { isRedisConnected, getRedisClient } from '../config/redis.js';
import logger from '../config/logger.js';
import { ITEM_IMAGE_WORKER_CONCURRENCY } from '../config/itemImageFeature.js';
import { AI_USAGE_FEATURES } from '../config/aiUsageFeatures.js';
import { generateItemImage, ItemImageGenerationError } from '../services/itemImageGenerationService.js';
import { uploadStorefrontCatalogImageUseCase } from '../modules/inventory/index.js';
import { findTenantById } from '../services/landlordService.js';
import tenantConnector from '../utils/TenantConnector.js';
import { getTenantModels } from '../utils/tenantModelFactory.js';
import dbStore from '../utils/dbStore.js';
import { AiUsageLog } from '../models/index.js';
import { setItemImageStatus } from './itemImageStatusStore.js';

const QUEUE_KEY = 'item_image:queue';
const POLL_INTERVAL_MS = 500;   // tick when the queue likely has items
const IDLE_INTERVAL_MS = 5000;  // tick when the queue was empty last round

let _timer = null;
let _running = false;
let _inFlight = 0;

/**
 * Enqueues one item-image-generation task. Both callers (menu-import
 * confirm, the existing-items "Generate an Image" action) push through this
 * — colocating the queue helper with the worker mirrors
 * geoInventoryWorker.js's enqueueInventoryPush() convention.
 *
 * `user` must carry a pre-resolved `permissions` array (see
 * menuImportController.js's enqueue step), not just a role — the attach step
 * (buildUploadStorefrontCatalogImageUseCase's assertCanEditItems) checks
 * user.permissions literally and has no request context to fall back to a
 * role's default permission set minutes later when this task actually runs.
 *
 * @param {Object} payload
 * @param {{user_id: (number|string), tenant_id: string, is_master_admin?: boolean, permissions: string[]}} payload.user
 * @param {number} payload.itemId
 * @param {string} payload.name
 * @param {string|null} [payload.description]
 * @param {string|null} [payload.category]
 */
export const enqueueItemImageGeneration = async (payload) => {
    if (!isRedisConnected()) {
        throw new Error('Redis unavailable — cannot enqueue item image generation');
    }
    await getRedisClient().lPush(QUEUE_KEY, JSON.stringify(payload));
};

const unlinkQuietly = async (filePath) => {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch {
        // Ignore — cleanupService.js's sweep of os.tmpdir() equivalents is not
        // guaranteed, but a stray temp file here is a disk-hygiene concern,
        // not a correctness one, and this mirrors menuImportWorker.js's own
        // best-effort unlink.
    }
};

const logImageUsage = async ({ user, usage }) => {
    try {
        await AiUsageLog.create({
            tenant_id: user.tenant_id,
            user_id: user.user_id,
            feature: AI_USAGE_FEATURES.ITEM_IMAGE_GENERATION,
            model: usage.model,
            input_tokens: 0,
            output_tokens: 0,
            units: 1,
            cost_usd: usage.costUsd.toFixed(6)
        });
    } catch (error) {
        // Best-effort, like every other AiUsageLog write site in this
        // codebase — a logging failure must not fail an otherwise-successful
        // image generation.
        logger.warn('[ItemImageWorker] Failed to log AI usage', { reason: error?.message });
    }
};

/**
 * Processes exactly one task end to end: generate, attach to the item under
 * the correct tenant context, log spend. Never throws — any failure becomes
 * a logged error so one bad item never sinks the rest of the queue (the same
 * per-task isolation guarantee as menuImportWorker.js's processFileTask).
 * Exported for focused unit testing, mirroring that module's convention.
 */
export const processImageTask = async (task) => {
    const { user, itemId, name, description = null, category = null } = task || {};
    if (!user?.tenant_id || !user?.user_id || !itemId || !name) {
        logger.error('[ItemImageWorker] Discarding malformed task', { task });
        return;
    }

    await setItemImageStatus(user.tenant_id, itemId, { status: 'processing' });

    let generated;
    try {
        generated = await generateItemImage({ name, description, category });
    } catch (error) {
        const isKnownError = error instanceof ItemImageGenerationError;
        const code = isKnownError ? error.code : 'UNEXPECTED_ERROR';
        logger.error('[ItemImageWorker] Image generation failed', {
            tenantId: user.tenant_id,
            itemId,
            code,
            reason: error.message
        });
        await setItemImageStatus(user.tenant_id, itemId, {
            status: 'failed',
            error_code: code,
            error_message: error.message
        });
        return;
    }

    try {
        const tenant = await findTenantById(user.tenant_id);
        if (!tenant) {
            logger.error('[ItemImageWorker] Tenant not found — discarding generated image', {
                tenantId: user.tenant_id,
                itemId
            });
            await unlinkQuietly(generated.path);
            await setItemImageStatus(user.tenant_id, itemId, {
                status: 'failed',
                error_code: 'TENANT_NOT_FOUND',
                error_message: 'Tenant not found'
            });
            return;
        }

        const sequelize = await tenantConnector.getConnection(tenant);
        const context = {
            sequelize,
            tenantId: tenant.id,
            tenantToken: tenant.company_token,
            tenantName: tenant.name,
            tenantPlan: tenant.plan,
            ...getTenantModels(sequelize)
        };

        await dbStore.run(context, () => uploadStorefrontCatalogImageUseCase({
            itemId,
            file: { path: generated.path, originalname: generated.originalname, mimetype: generated.mimetype, size: generated.size },
            user,
            provenance: generated.provenance
        }));

        await logImageUsage({ user, usage: generated.usage });
        await setItemImageStatus(user.tenant_id, itemId, { status: 'completed' });
    } catch (error) {
        // buildUploadStorefrontCatalogImageUseCase already unlinks
        // generated.path itself on failure (see its own catch block) — no
        // duplicate cleanup needed here.
        logger.error('[ItemImageWorker] Failed to attach generated image to item', {
            tenantId: user.tenant_id,
            itemId,
            reason: error?.message
        });
        await setItemImageStatus(user.tenant_id, itemId, {
            status: 'failed',
            error_code: 'ATTACH_FAILED',
            error_message: error?.message || 'Failed to attach generated image'
        });
    }
};

// ── Poll loop ─────────────────────────────────────────────────────────────────
const tick = async () => {
    if (!isRedisConnected()) {
        _timer = setTimeout(tick, IDLE_INTERVAL_MS);
        return;
    }

    let dequeuedThisTick = 0;
    try {
        while (_inFlight < ITEM_IMAGE_WORKER_CONCURRENCY) {
            const raw = await getRedisClient().rPop(QUEUE_KEY);
            if (!raw) break;

            let task;
            try {
                task = JSON.parse(raw);
            } catch {
                logger.warn('[ItemImageWorker] Discarding unparseable queue entry');
                continue;
            }

            dequeuedThisTick++;
            _inFlight++;
            processImageTask(task)
                .catch((error) => {
                    // processImageTask already catches its own errors — this
                    // only guards against something truly unexpected.
                    logger.error('[ItemImageWorker] Unexpected task processing error', { err: error?.message });
                })
                .finally(() => {
                    _inFlight--;
                });
        }
    } catch (err) {
        logger.error('[ItemImageWorker] Tick error', { err: err?.message });
    }

    _timer = setTimeout(tick, dequeuedThisTick > 0 ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS);
};

// ── Public API ────────────────────────────────────────────────────────────────
export const startItemImageWorker = () => {
    if (_running) return;
    _running = true;
    logger.info(`[ItemImageWorker] Started (concurrency=${ITEM_IMAGE_WORKER_CONCURRENCY})`);
    _timer = setTimeout(tick, POLL_INTERVAL_MS);
};

export const stopItemImageWorker = () => {
    if (_timer) clearTimeout(_timer);
    _running = false;
    logger.info('[ItemImageWorker] Stopped');
};

export default { startItemImageWorker, stopItemImageWorker, processImageTask, enqueueItemImageGeneration };
