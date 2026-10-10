import cron from 'node-cron';
import * as cacheService from '../services/cacheService.js';
import { isSmsDeliveryLogRetentionEnabled, getSmsDeliveryLogRetentionDays } from '../modules/smsDelivery/adapters/index.js';
import { redactExpiredSmsDeliveryPiiUseCase } from '../modules/smsDelivery/usecases/redactExpiredSmsDeliveryPiiUseCase.js';
import logger from '../config/logger.js';

let task = null;
let cycleInProgress = false;
const LOCK_KEY = 'scheduler:sms_delivery_log_retention';

export const runSmsDeliveryRetentionCycle = async ({ redact = redactExpiredSmsDeliveryPiiUseCase } = {}) => {
  if (!isSmsDeliveryLogRetentionEnabled()) return { status: 'skipped', reason: 'disabled' };
  if (cycleInProgress) return { status: 'skipped', reason: 'local_lock' };
  const acquired = await cacheService.acquireLock(LOCK_KEY, 900);
  if (!acquired) return { status: 'skipped', reason: 'distributed_lock' };

  cycleInProgress = true;
  try {
    const redacted = await redact({ days: getSmsDeliveryLogRetentionDays() });
    return { status: 'completed', redacted };
  } finally {
    cycleInProgress = false;
    await cacheService.releaseLock(LOCK_KEY);
  }
};

export const startSmsDeliveryRetentionScheduler = () => {
  if (!isSmsDeliveryLogRetentionEnabled() || task) return;
  task = cron.schedule('15 3 * * *', () => runSmsDeliveryRetentionCycle()
    .catch((error) => logger.error(`SMS delivery retention failed: ${error.message}`)));
  logger.info('SMS delivery retention scheduler initialized (daily at 03:15)');
};

export const stopSmsDeliveryRetentionScheduler = () => { task?.stop(); task = null; };
