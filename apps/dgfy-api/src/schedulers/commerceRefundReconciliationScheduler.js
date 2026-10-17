import cron from 'node-cron';
import * as cacheService from '../services/cacheService.js';
import logger from '../config/logger.js';
import { reconcilePendingCommerceRefundsUseCase } from '../modules/commercePayments/index.js';

let task = null;
let cycleInProgress = false;
const LOCK_KEY = 'scheduler:commerce_refund_reconcile';
const isEnabled = () => process.env.COMMERCE_REFUND_RECONCILE_ENABLED !== 'false';
const intervalMinutes = () => Math.max(1, Math.min(
  59,
  Number.parseInt(process.env.COMMERCE_REFUND_RECONCILE_MINUTES || '15', 10) || 15
));
const lockTtlSeconds = () => Math.max(900, intervalMinutes() * 120);

export const runCommerceRefundReconciliationCycle = async ({
  reconcile = reconcilePendingCommerceRefundsUseCase
} = {}) => {
  if (!isEnabled()) return { status: 'skipped', reason: 'disabled' };
  if (cycleInProgress) return { status: 'skipped', reason: 'local_lock' };
  const acquired = await cacheService.acquireLock(LOCK_KEY, lockTtlSeconds());
  if (!acquired) return { status: 'skipped', reason: 'distributed_lock' };

  cycleInProgress = true;
  try {
    const result = await reconcile();
    return { status: 'completed', ...result };
  } finally {
    cycleInProgress = false;
    await cacheService.releaseLock(LOCK_KEY);
  }
};

export const startCommerceRefundReconciliationScheduler = () => {
  if (!isEnabled() || task) return;
  const minutes = intervalMinutes();
  task = cron.schedule(`*/${minutes} * * * *`, () => runCommerceRefundReconciliationCycle()
    .catch((error) => logger.error(`Commerce refund reconciliation failed: ${error.message}`)));
  logger.info(`Commerce refund reconciliation scheduler initialized (${minutes} minutes)`);
};

export const stopCommerceRefundReconciliationScheduler = () => { task?.stop(); task = null; };
