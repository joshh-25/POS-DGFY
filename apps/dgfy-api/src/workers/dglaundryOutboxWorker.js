import logger from '../config/logger.js';
import { dgfyLaundryOutboxRepository } from '../modules/dgfyLaundryOrders/repositories/dgfyLaundryOutboxRepository.js';
import { dglaundryDurableDelivery } from '../modules/dgfyLaundryOrders/index.js';

const POLL_MS = Math.max(250, Math.min(10000, Number(process.env.DGLAUNDRY_OUTBOX_POLL_MS) || 2000));
const BATCH_SIZE = Math.max(1, Math.min(25, Number(process.env.DGLAUNDRY_OUTBOX_BATCH_SIZE) || 10));
let timer = null;
let stopped = true;
let running = null;

export const processPendingDglaundryCompletions = async ({
  repository = dgfyLaundryOutboxRepository,
  orderUseCases = null,
  reconcilePayment = null,
  limit = BATCH_SIZE
} = {}) => {
  const completions = await repository.claimPendingCompletions(limit);
  if (completions.length) {
    let orderReconciler = orderUseCases;
    let paymentReconciler = reconcilePayment;
    if (!orderReconciler || !paymentReconciler) {
      const [commercePayments, dgfyLaundryOrders] = await Promise.all([
        import('../modules/commercePayments/index.js'),
        import('../modules/dgfyLaundryOrders/index.js')
      ]);
      orderReconciler ||= dgfyLaundryOrders.dgfyLaundryOrderUseCases;
      paymentReconciler ||= commercePayments.reconcileDglaundryOutboxCompletion;
    }
    await Promise.all(completions.map(async ({ row, token }) => {
      try {
        if (row.caller_idempotency_key) {
          await orderReconciler.reconcileOutboxCallerResult({
            callerIdempotencyKey: row.caller_idempotency_key,
            response: row.response,
            externalOrderReference: row.payload?.data?.externalOrderReference || row.payload?.data?.external_order_reference,
            externalTrackingReference: row.payload?.data?.externalTrackingReference || row.payload?.data?.external_tracking_reference
          });
        }
        if (row.completion_type === 'paid_dglaundry_booking') {
          await paymentReconciler({ completionReference: row.completion_reference });
        } else if (row.completion_type !== 'dglaundry_order_idempotency') {
          throw new Error('DGLAUNDRY_OUTBOX_COMPLETION_UNSUPPORTED');
        }
        await repository.acknowledgeCompletion({ id: row.id, token, completed: true });
      } catch (error) {
        const retryDelayMs = Math.min(5 * 60_000, 5000 * (2 ** Math.max(0, Number(row.completion_attempts) - 1)));
        await repository.acknowledgeCompletion({ id: row.id, token, completed: false, failure: error.message, retryDelayMs });
        logger.warn?.({ event_type: 'dglaundry_outbox_completion_failed', operation_id: row.id, error: error.message });
      }
    }));
  }
  return completions.length;
};

export const processDglaundryOutboxBatch = async () => {
  await dgfyLaundryOutboxRepository.markExhausted();
  const claims = await dgfyLaundryOutboxRepository.claimDue(BATCH_SIZE);
  await Promise.all(claims.map((claim) => dglaundryDurableDelivery.processClaim(claim).catch((error) => {
    logger.warn?.({ event_type: 'dglaundry_outbox_delivery_failed', operation_id: claim.row.id, error: error.message });
  })));
  await processPendingDglaundryCompletions();
  return claims.length;
};

const poll = async () => {
  if (stopped || running) return;
  running = processDglaundryOutboxBatch()
    .catch((error) => logger.error?.({ event_type: 'dglaundry_outbox_worker_failed', error: error.message }))
    .finally(() => {
      running = null;
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    });
};

export const startDglaundryOutboxWorker = () => {
  if (!stopped) return;
  stopped = false;
  timer = setTimeout(poll, POLL_MS);
};

export const stopDglaundryOutboxWorker = async () => {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
  if (running) await running;
};

export default { startDglaundryOutboxWorker, stopDglaundryOutboxWorker, processDglaundryOutboxBatch };
