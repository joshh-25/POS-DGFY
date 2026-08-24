import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildOfflinePosScopeKey,
  isOfflinePosScopeReady
} from '../services/offlinePosScope.js';
import {
  loadOfflinePosSnapshot,
  saveOfflinePosSnapshot
} from '../services/offlinePosSnapshotStore.js';
import {
  buildPosCartDraftKey,
  clearPosCartDraft,
  loadPosCartDraft,
  savePosCartDraft
} from '../services/posCartDraftStore.js';
import {
  consumeManualPosSyncAttempt,
  getManualPosSyncPolicy
} from '../services/manualPosSyncPolicyStore.js';
import {
  enqueueTerminalOperationIntent,
  getReplayCandidateEntries,
  listTerminalOperationQueueEntries,
  TERMINAL_QUEUE_STATUS
} from '../services/terminalOperationQueueStore.js';

const FALLBACK_STORAGE_KEY = 'pos_terminal_operation_queue_v2_fallback';

const createStorage = () => {
  const values = new Map();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.has(key) ? values.get(key) : null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  };
};

const scopeA = {
  tenantId: 'company-a',
  terminalId: 'POS-01',
  locationId: '10',
  userId: '100'
};
const scopeB = { ...scopeA, tenantId: 'company-b' };

describe('offline POS persistence boundaries', () => {
  let localStorage;

  beforeEach(() => {
    localStorage = createStorage();
    vi.stubGlobal('window', { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a complete tenant, terminal, location, and user scope', () => {
    expect(isOfflinePosScopeReady(scopeA)).toBe(true);
    expect(buildOfflinePosScopeKey(scopeA)).not.toBe(buildOfflinePosScopeKey(scopeB));
    expect(isOfflinePosScopeReady({ terminalId: 'POS-01', locationId: 10, userId: 100 })).toBe(false);
    expect(saveOfflinePosSnapshot({ terminalId: 'POS-01' }, { catalog: [{ item_id: 1 }] })).toBe(false);
  });

  it('isolates catalog snapshots by tenant', () => {
    expect(saveOfflinePosSnapshot(scopeA, { catalog: [{ item_id: 1 }] })).toBe(true);
    expect(loadOfflinePosSnapshot(scopeA)?.catalog).toEqual([{ item_id: 1 }]);
    expect(loadOfflinePosSnapshot(scopeB)).toBeNull();
  });

  it('restores cart drafts only for the same tenant, operator, terminal, and shift', () => {
    const shiftId = 81;
    const catalog = [{ item_id: 4, name: 'Beef Meal', vat_type: 'vatable', senior_pwd_discount_eligible: true }];
    expect(savePosCartDraft(scopeA, shiftId, [{
      line_key: 'line-4',
      item_id: 4,
      item_name: 'Old name',
      quantity: 2,
      sale_price: 150,
      password: 'must-not-persist',
      token: 'must-not-persist'
    }])).toBe(true);

    expect(buildPosCartDraftKey(scopeA, shiftId)).not.toBe(buildPosCartDraftKey(scopeB, shiftId));
    expect(loadPosCartDraft(scopeA, shiftId, catalog)).toEqual([
      expect.objectContaining({
        item_id: 4,
        item_name: 'Beef Meal',
        quantity: 2,
        sale_price: 150,
        senior_pwd_discount_eligible: true
      })
    ]);
    expect(loadPosCartDraft(scopeA, shiftId, catalog)[0]).not.toHaveProperty('password');
    expect(loadPosCartDraft(scopeA, shiftId, catalog)[0]).not.toHaveProperty('token');
    expect(loadPosCartDraft(scopeA, 82, catalog)).toEqual([]);
    expect(loadPosCartDraft(scopeB, shiftId, catalog)).toEqual([]);
    expect(clearPosCartDraft(scopeA, shiftId)).toBe(true);
    expect(loadPosCartDraft(scopeA, shiftId, catalog)).toEqual([]);
  });

  it('quarantines unscoped queue records and exposes only the active tenant scope', async () => {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify([{
      intent_id: 'legacy-unscoped',
      operation: 'checkout',
      status: TERMINAL_QUEUE_STATUS.QUEUED,
      queued_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]));

    await enqueueTerminalOperationIntent({
      intent_id: 'company-a-checkout',
      operation: 'checkout',
      queue_scope: scopeA,
      payload: { idempotency_key: 'company-a-checkout' }
    }, 'test');

    expect((await listTerminalOperationQueueEntries({ scope: scopeA })).map((row) => row.intent_id))
      .toEqual(['company-a-checkout']);
    expect(await listTerminalOperationQueueEntries({ scope: scopeB })).toEqual([]);
    expect((await getReplayCandidateEntries({ scope: scopeA })).map((row) => row.intent_id))
      .toEqual(['company-a-checkout']);
    await expect(enqueueTerminalOperationIntent({
      intent_id: 'unsafe-unscoped',
      operation: 'checkout'
    }, 'test')).rejects.toThrow(/company, terminal, location, and user scope/i);
  });

  it('never evicts pending fallback records when history exceeds the display limit', async () => {
    const scopeKey = buildOfflinePosScopeKey(scopeA);
    const pending = Array.from({ length: 305 }, (_, index) => ({
      intent_id: `pending-${index}`,
      operation: 'checkout',
      payload: { idempotency_key: `pending-${index}` },
      status: TERMINAL_QUEUE_STATUS.QUEUED,
      queued_at: new Date(2026, 0, 1, 0, 0, index).toISOString(),
      updated_at: new Date(2026, 0, 1, 0, 0, index).toISOString(),
      tenant_id: scopeA.tenantId,
      terminal_id: scopeA.terminalId,
      location_id: scopeA.locationId,
      user_id: scopeA.userId,
      scope_key: scopeKey
    }));
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(pending));

    await enqueueTerminalOperationIntent({
      intent_id: 'pending-305',
      operation: 'checkout',
      queue_scope: scopeA,
      payload: { idempotency_key: 'pending-305' }
    }, 'test');

    const stored = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY));
    expect(stored).toHaveLength(306);
    expect(stored.every((row) => row.status === TERMINAL_QUEUE_STATUS.QUEUED)).toBe(true);
  });

  it('tracks the manual sync allowance independently per tenant', () => {
    expect(getManualPosSyncPolicy(scopeA).remaining).toBe(2);
    expect(consumeManualPosSyncAttempt(scopeA)).toMatchObject({ allowed: true, remaining: 1 });
    expect(getManualPosSyncPolicy(scopeA).remaining).toBe(1);
    expect(getManualPosSyncPolicy(scopeB).remaining).toBe(2);
    expect(consumeManualPosSyncAttempt({ terminalId: 'POS-01' })).toMatchObject({
      allowed: false,
      remaining: 0,
      scopeReady: false
    });
  });

  it('keeps enforcing the manual sync limit when localStorage writes fail', () => {
    const storageFailureScope = { ...scopeA, tenantId: 'storage-failure-company' };
    window.localStorage.setItem = () => {
      throw new Error('quota exceeded');
    };

    expect(consumeManualPosSyncAttempt(storageFailureScope)).toMatchObject({ allowed: true, remaining: 1 });
    expect(consumeManualPosSyncAttempt(storageFailureScope)).toMatchObject({ allowed: true, remaining: 0 });
    expect(consumeManualPosSyncAttempt(storageFailureScope)).toMatchObject({ allowed: false, remaining: 0 });
  });
});
