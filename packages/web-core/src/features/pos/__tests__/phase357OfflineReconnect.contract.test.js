import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  recordCashDrawerEvent,
  closeTerminalShift,
  createPosParkedSale
} = vi.hoisted(() => ({
  recordCashDrawerEvent: vi.fn(),
  closeTerminalShift: vi.fn(),
  createPosParkedSale: vi.fn()
}));

vi.mock('../services/posService.js', () => ({
  recordCashDrawerEvent,
  closeTerminalShift,
  createPosParkedSale
}));

import {
  enqueueTerminalOperationIntent,
  listTerminalOperationQueueEntries,
  TERMINAL_QUEUE_STATUS
} from '../services/terminalOperationQueueStore.js';
import { replayTerminalOperationCandidates } from '../utils/posTerminalQueueReplay.js';

const createStorage = () => {
  const values = new Map();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.has(key) ? values.get(key) : null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  };
};

const scope = {
  tenantId: 'phase357-company',
  terminalId: 'P357-01',
  locationId: 7,
  userId: 19
};

describe('Phase 357 offline/reconnect reconciliation', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: createStorage() });
    recordCashDrawerEvent.mockReset();
    closeTerminalShift.mockReset();
    createPosParkedSale.mockReset();
  });

  it('retains a queued cash event when reconnect rejects stale operator authority', async () => {
    recordCashDrawerEvent.mockRejectedValue({
      response: {
        status: 403,
        data: {
          error_code: 'POS_OPERATOR_ACTIVE_ELSEWHERE',
          message: 'The operator authority is no longer valid.'
        }
      }
    });
    const intentId = 'phase357-stale-authority-cash-event';

    await enqueueTerminalOperationIntent({
      intent_id: intentId,
      operation: 'cash_event',
      queue_scope: scope,
      shift_id: 357,
      payload: { shift_id: 357, event_type: 'cash_in', amount: 25 }
    }, 'offline');

    const candidates = await listTerminalOperationQueueEntries({ scope, includeResolved: false });
    const result = await replayTerminalOperationCandidates({ candidates, maxRetries: 3 });

    expect(result).toMatchObject({ replayedCount: 0, retryScheduledCount: 0, failedManualCount: 1 });
    expect(recordCashDrawerEvent).toHaveBeenCalledTimes(1);
    await expect(listTerminalOperationQueueEntries({ scope, includeResolved: false })).resolves.toEqual([
      expect.objectContaining({
        intent_id: intentId,
        status: TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED,
        last_error: {
          message: 'The operator authority is no longer valid.',
          code: 'POS_OPERATOR_ACTIVE_ELSEWHERE',
          status: 403
        }
      })
    ]);
  });

  it('does not acquire a new shift offline and keeps the reconnect decision visible', async () => {
    const intentId = 'phase357-offline-shift-open';
    await enqueueTerminalOperationIntent({
      intent_id: intentId,
      operation: 'shift_open',
      queue_scope: scope,
      payload: { terminal_id: scope.terminalId, location_id: scope.locationId }
    }, 'offline');

    const candidates = await listTerminalOperationQueueEntries({ scope, includeResolved: false });
    const result = await replayTerminalOperationCandidates({ candidates, maxRetries: 3 });

    expect(result).toMatchObject({ replayedCount: 0, retryScheduledCount: 0, failedManualCount: 1 });
    expect(closeTerminalShift).not.toHaveBeenCalled();
    expect(createPosParkedSale).not.toHaveBeenCalled();
    await expect(listTerminalOperationQueueEntries({ scope, includeResolved: false })).resolves.toEqual([
      expect.objectContaining({
        intent_id: intentId,
        status: TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED,
        last_error: expect.objectContaining({
          code: 'POS_SHIFT_OPEN_ONLINE_REQUIRED'
        })
      })
    ]);
  });
});
