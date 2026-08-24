import {
  closeTerminalShift,
  createPosParkedSale,
  recordCashDrawerEvent
} from '../services/posService.js';
import {
  markTerminalOperationFailedManualResolution,
  markTerminalOperationReplayed,
  markTerminalOperationReplaying,
  markTerminalOperationRetryScheduled
} from '../services/terminalOperationQueueStore.js';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

const isRetryableError = (error) => {
  if (!error?.response) return true;
  const status = Number(error?.response?.status || 0);
  return RETRYABLE_STATUS_CODES.has(status);
};

const resolveErrorDetails = (error) => ({
  message: String(error?.response?.data?.message || error?.message || 'Operation replay failed').trim(),
  code: String(error?.response?.data?.error_code || error?.code || '').trim() || undefined,
  status: Number(error?.response?.status || 0) || undefined
});

const computeRetryBackoffMs = (attemptCount = 1) => {
  const baseMs = 1500;
  const jitterMs = Math.floor(Math.random() * 250);
  return Math.min(90_000, (baseMs * (2 ** Math.max(0, attemptCount - 1))) + jitterMs);
};

export const replayTerminalOperationCandidates = async ({
  candidates = [],
  maxRetries,
  printClosedShiftSummary
} = {}) => {
  let replayedCount = 0;
  let retryScheduledCount = 0;
  let failedManualCount = 0;
  let shouldRefreshOperational = false;

  for (const candidate of candidates) {
    const intentId = String(candidate?.intent_id || '').trim();
    const operation = String(candidate?.operation || '').trim();
    const payload = candidate?.payload && typeof candidate.payload === 'object'
      ? candidate.payload
      : {};

    if (!intentId || !operation) {
      await markTerminalOperationFailedManualResolution(intentId, {
        error: {
          message: 'Queued operation is malformed and requires manual resolution.',
          code: 'POS_QUEUE_MALFORMED_ENTRY'
        }
      });
      failedManualCount += 1;
      continue;
    }

    await markTerminalOperationReplaying(intentId);
    try {
      if (operation === 'shift_open') {
        await markTerminalOperationFailedManualResolution(intentId, {
          error: {
            message: 'Opening a shift requires an online server confirmation.',
            code: 'POS_SHIFT_OPEN_ONLINE_REQUIRED'
          }
        });
        failedManualCount += 1;
        continue;
      }

      if (operation === 'cash_event') {
        const shiftId = Number.parseInt(candidate?.shift_id || payload?.shift_id, 10);
        if (!Number.isInteger(shiftId) || shiftId <= 0) {
          throw new Error('Missing shift_id for queued cash event replay.');
        }
        await recordCashDrawerEvent(shiftId, payload);
        shouldRefreshOperational = true;
      } else if (operation === 'shift_close') {
        const shiftId = Number.parseInt(candidate?.shift_id || payload?.shift_id, 10);
        if (!Number.isInteger(shiftId) || shiftId <= 0) {
          throw new Error('Missing shift_id for queued shift-close replay.');
        }
        const closeResult = await closeTerminalShift(shiftId, payload);
        await printClosedShiftSummary(closeResult);
        shouldRefreshOperational = true;
      } else if (operation === 'parked_sale') {
        await createPosParkedSale(payload);
        shouldRefreshOperational = true;
      } else if (operation === 'order_status_update') {
        await markTerminalOperationFailedManualResolution(intentId, {
          error: {
            message: 'Online-order status changes require a live server connection.',
            code: 'POS_ONLINE_ORDER_ACTION_ONLINE_REQUIRED'
          }
        });
        failedManualCount += 1;
        continue;
      } else if (operation === 'item_create') {
        const [{ createItem }, { updatePosCatalogOverride }] = await Promise.all([
          import('@/services/itemService.js'),
          import('@/services/posCatalogService.js')
        ]);
        const itemPayload = { ...payload };
        const posAlwaysAvailable = itemPayload.pos_always_available === true;
        delete itemPayload.offline_draft_intent_id;
        delete itemPayload.pos_always_available;
        const createdItem = await createItem(itemPayload);
        const itemId = Number(createdItem?.item_id || createdItem?.id || 0);
        if (!Number.isInteger(itemId) || itemId <= 0) {
          throw new Error('Offline item draft synced without a valid item ID.');
        }
        if (posAlwaysAvailable) {
          await updatePosCatalogOverride(itemId, { pos_always_available: true });
        }
      } else {
        throw new Error(`Unsupported queued operation '${operation}'.`);
      }

      await markTerminalOperationReplayed(intentId);
      replayedCount += 1;
    } catch (error) {
      const errorDetails = resolveErrorDetails(error);
      if (operation === 'item_create' || !isRetryableError(error)) {
        await markTerminalOperationFailedManualResolution(intentId, { error: errorDetails });
        failedManualCount += 1;
        continue;
      }

      const nextAttemptCount = (Number(candidate?.attempt_count) || 0) + 1;
      if (nextAttemptCount >= maxRetries) {
        await markTerminalOperationFailedManualResolution(intentId, { error: errorDetails });
        failedManualCount += 1;
        continue;
      }

      await markTerminalOperationRetryScheduled(intentId, {
        attemptCount: nextAttemptCount,
        nextRetryAt: Date.now() + computeRetryBackoffMs(nextAttemptCount),
        error: errorDetails
      });
      retryScheduledCount += 1;
    }
  }

  return {
    replayedCount,
    retryScheduledCount,
    failedManualCount,
    shouldRefreshOperational
  };
};
