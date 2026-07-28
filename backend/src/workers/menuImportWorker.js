/**
 * Menu Import Extraction Worker
 *
 * Drains the Redis-backed queue populated by
 * modules/menuImport/usecases/createMenuImportJobUseCase.js (one queue entry
 * per uploaded file in a batch), extracts menu items from each file via
 * menuExtractionService, and writes the per-file result back to the job hash
 * in modules/menuImport/repositories/menuImportJobRepository.js.
 *
 * Deliberately touches no tenant database — see this module's README
 * (modules/menuImport/README.md) and the menu batch import ADR. All
 * tenant-scoped checks (workflow mode, AI-spend budget) already happened in
 * request context before a job was ever enqueued; this worker's only write
 * is menuExtractionService's own AiUsageLog logging, which reaches the
 * landlord DB via a static model import, not tenant DB context.
 *
 * Queue mechanics: same lPush/rPop FIFO convention as
 * workers/geoInventoryWorker.js, but with an in-flight concurrency cap
 * (MENU_IMPORT_WORKER_CONCURRENCY) instead of a serial per-tick batch, since
 * each task here is an OpenAI vision/text call, not a fast DB upsert.
 */

import fs from 'fs/promises';
import { isRedisConnected } from '../config/redis.js';
import logger from '../config/logger.js';
import { MENU_IMPORT_WORKER_CONCURRENCY } from '../config/menuImportFeature.js';
import { menuImportJobRepository } from '../modules/menuImport/index.js';
import { extractMenuItemsFromFile, MenuExtractionError } from '../services/menuExtractionService.js';

const POLL_INTERVAL_MS = 500;   // tick when the queue likely has items
const IDLE_INTERVAL_MS = 5000;  // tick when the queue was empty last round

let _timer = null;
let _running = false;
let _inFlight = 0;

const unlinkQuietly = async (filePath) => {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch {
        // Ignore — cleanupService.js's 15-min sweep of TEMP_DIR is the backstop
        // for anything missed here (e.g. the process restarting mid-extraction).
    }
};

// Processes exactly one file task end to end: read its record, run
// extraction, record a terminal result, and always unlink the temp file. This
// never throws — any extraction failure becomes that file's 'failed' result
// so one unreadable photo or corrupt PDF in a batch never takes down the rest
// of the job (per-file isolation).
//
// Exported for focused unit testing (mirrors menuExtractionService.js's
// convention of exporting internal helpers) — not intended as a
// general-purpose public API of this module. Driving the real tick()/setTimeout
// poll loop deterministically in a test isn't worth the complexity when this
// is the one function tick() actually delegates real work to.
export const processFileTask = async ({ tenantId, jobId, fileId }) => {
    const fileRecord = await menuImportJobRepository.beginProcessingFile({ tenantId, jobId, fileId });
    if (!fileRecord) {
        // The job (or this file's record) expired between enqueue and dequeue —
        // there's nothing left to record a result against.
        return;
    }

    const user = { tenant_id: fileRecord.tenant_id, user_id: fileRecord.user_id };

    try {
        const fileBuffer = await fs.readFile(fileRecord.path);
        const { items, kind, pages } = await extractMenuItemsFromFile(fileBuffer, fileRecord.mime_type, user);
        await menuImportJobRepository.setFileResult({
            tenantId,
            jobId,
            fileId,
            result: { status: 'completed', items, kind, pages }
        });
    } catch (error) {
        const isKnownExtractionError = error instanceof MenuExtractionError;
        logger.warn('[MenuImportWorker] File extraction failed', {
            tenantId,
            jobId,
            fileId,
            code: isKnownExtractionError ? error.code : 'UNEXPECTED_ERROR',
            message: error.message
        });
        await menuImportJobRepository.setFileResult({
            tenantId,
            jobId,
            fileId,
            result: {
                status: 'failed',
                error_code: isKnownExtractionError ? error.code : 'EXTRACTION_REQUEST_FAILED',
                error_message: error.message
            }
        });
    } finally {
        await unlinkQuietly(fileRecord.path);
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
        while (_inFlight < MENU_IMPORT_WORKER_CONCURRENCY) {
            const task = await menuImportJobRepository.dequeueFileTask();
            if (!task) break;

            dequeuedThisTick++;
            _inFlight++;
            processFileTask(task)
                .catch((error) => {
                    // processFileTask already catches extraction/setFileResult
                    // errors internally — this only guards against something
                    // unexpected (e.g. beginProcessingFile itself throwing).
                    logger.error('[MenuImportWorker] Unexpected task processing error', { err: error?.message });
                })
                .finally(() => {
                    _inFlight--;
                });
        }
    } catch (err) {
        logger.error('[MenuImportWorker] Tick error', { err: err?.message });
    }

    _timer = setTimeout(tick, dequeuedThisTick > 0 ? POLL_INTERVAL_MS : IDLE_INTERVAL_MS);
};

// ── Public API ────────────────────────────────────────────────────────────────
export const startMenuImportWorker = () => {
    if (_running) return;
    _running = true;
    logger.info(`[MenuImportWorker] Started (concurrency=${MENU_IMPORT_WORKER_CONCURRENCY})`);
    _timer = setTimeout(tick, POLL_INTERVAL_MS);
};

export const stopMenuImportWorker = () => {
    if (_timer) clearTimeout(_timer);
    _running = false;
    logger.info('[MenuImportWorker] Stopped');
};

export default { startMenuImportWorker, stopMenuImportWorker, processFileTask };
