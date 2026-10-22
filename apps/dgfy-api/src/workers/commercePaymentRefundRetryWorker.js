import logger from '../config/logger.js';
import { commercePaymentRepository } from '../modules/commercePayments/repositories/commercePaymentRepository.js';
import { COMMERCE_PAYMENT_REFUND_MAX_RETRIES } from '../modules/commercePayments/usecases/commercePaymentAdminUseCases.js';

const POLL_MS = Math.max(1000, Math.min(60_000, Number(process.env.COMMERCE_PAYMENT_REFUND_RETRY_POLL_MS) || 15_000));
const BATCH_SIZE = Math.max(1, Math.min(25, Number(process.env.COMMERCE_PAYMENT_REFUND_RETRY_BATCH_SIZE) || 10));
const LEASE_MS = Math.max(60_000, Math.min(30 * 60_000, Number(process.env.COMMERCE_PAYMENT_REFUND_RETRY_LEASE_MS) || 10 * 60_000));

let timer = null;
let stopped = true;
let running = null;

export const processCommercePaymentRefundRetryBatch = async ({
  repository = commercePaymentRepository,
  retryUseCase = null,
  now = new Date(),
  limit = BATCH_SIZE
} = {}) => {
  let processed = 0;
  let retry = retryUseCase;

  while (processed < limit) {
    const row = await repository.claimDueCommercePaymentRefundRetry({
      now,
      leaseUntil: new Date(new Date(now).getTime() + LEASE_MS),
      maxAttempts: COMMERCE_PAYMENT_REFUND_MAX_RETRIES
    });
    if (!row) break;

    if (!retry) {
      const commercePayments = await import('../modules/commercePayments/index.js');
      retry = commercePayments.retryCommercePaymentRefundUseCase;
    }

    try {
      const result = await retry({
        refundId: row.refund_id,
        actor: 'commerce_payment_refund_retry_worker'
      });
      if (!result?.success) {
        logger.warn?.({
          event_type: 'commerce_payment_refund_retry_failed',
          refund_id: row.refund_id,
          error: result?.error?.message || 'Refund retry did not complete'
        });
      }
    } catch (error) {
      logger.warn?.({
        event_type: 'commerce_payment_refund_retry_worker_item_failed',
        refund_id: row.refund_id,
        error: error.message
      });
    }
    processed += 1;
  }

  return processed;
};

const poll = async () => {
  if (stopped || running) return;
  running = processCommercePaymentRefundRetryBatch()
    .catch((error) => logger.error?.({
      event_type: 'commerce_payment_refund_retry_worker_failed',
      error: error.message
    }))
    .finally(() => {
      running = null;
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    });
};

export const startCommercePaymentRefundRetryWorker = () => {
  if (!stopped) return;
  stopped = false;
  timer = setTimeout(poll, POLL_MS);
};

export const stopCommercePaymentRefundRetryWorker = async () => {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
  if (running) await running;
};

export default {
  startCommercePaymentRefundRetryWorker,
  stopCommercePaymentRefundRetryWorker,
  processCommercePaymentRefundRetryBatch
};
