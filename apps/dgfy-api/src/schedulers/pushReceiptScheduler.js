import cron from 'node-cron';
import * as cacheService from '../services/cacheService.js';
import { getPushAccountTokenMaxAgeDays, getPushDeliveryLogRetentionDays, getPushGuestTokenTtlDays, isPushDeliveryRetentionEnabled } from '../modules/pushDelivery/adapters/index.js';
import { pushDeliveryLogRepository, pushDeviceTokenRepository, processPushReceiptsUseCase } from '../modules/pushDelivery/index.js';
import logger from '../config/logger.js';

let task = null;
let cycleInProgress = false;
const LOCK_KEY = 'scheduler:push_receipts_and_retention';

const beforeDays = (days, reference = new Date()) => new Date(reference.getTime() - days * 24 * 60 * 60 * 1000);

export const runPushReceiptCycle = async ({
    processReceipts = processPushReceiptsUseCase,
    deviceRepository = pushDeviceTokenRepository,
    logRepository = pushDeliveryLogRepository,
    now = () => new Date()
} = {}) => {
    if (cycleInProgress) return { status: 'skipped', reason: 'local_lock' };
    const acquired = await cacheService.acquireLock(LOCK_KEY, 900);
    if (!acquired) return { status: 'skipped', reason: 'distributed_lock' };

    cycleInProgress = true;
    try {
        const receiptResult = await processReceipts();
        if (!isPushDeliveryRetentionEnabled()) return { status: 'completed', receipts: receiptResult, retention: 'disabled' };

        const currentTime = now();
        const [guestRevoked, accountRevoked, tokensPurged, logsPurged] = await Promise.all([
            deviceRepository.revokeGuestBindingsPastTtl(beforeDays(getPushGuestTokenTtlDays(), currentTime)),
            deviceRepository.revokeInactiveAccountTokens(beforeDays(getPushAccountTokenMaxAgeDays(), currentTime)),
            deviceRepository.purgeRevokedTokens(beforeDays(getPushDeliveryLogRetentionDays(), currentTime)),
            logRepository.purgeDeliveryLogs(beforeDays(getPushDeliveryLogRetentionDays(), currentTime))
        ]);
        return {
            status: 'completed',
            receipts: receiptResult,
            retention: { guestRevoked, accountRevoked, tokensPurged, logsPurged }
        };
    } finally {
        cycleInProgress = false;
        await cacheService.releaseLock(LOCK_KEY);
    }
};

export const startPushReceiptScheduler = () => {
    if (task) return;
    task = cron.schedule('*/15 * * * *', () => runPushReceiptCycle()
        .catch((error) => logger.warn('[Push] Receipt/retention cycle failed', {
            error_code: String(error?.code || error?.name || 'push_scheduler_failed').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 80)
        })));
    logger.info('Push receipt and retention scheduler initialized (every 15 minutes)');
};

export const stopPushReceiptScheduler = () => { task?.stop(); task = null; };

export default { runPushReceiptCycle, startPushReceiptScheduler, stopPushReceiptScheduler };
