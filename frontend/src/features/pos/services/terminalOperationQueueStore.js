const DB_NAME = 'sku_pos_terminal_sync_queue';
const DB_VERSION = 1;
const STORE_NAME = 'terminal_operation_queue';
const LEGACY_STORAGE_KEY = 'pos_terminal_operation_queue_v1';
const FALLBACK_STORAGE_KEY = 'pos_terminal_operation_queue_v2_fallback';
const LEGACY_MIGRATION_FLAG_KEY = 'pos_terminal_operation_queue_v2_legacy_migrated';
const STALE_REPLAY_WINDOW_MS = 90 * 1000;

export const TERMINAL_QUEUE_STATUS = Object.freeze({
  QUEUED: 'queued',
  REPLAYING: 'replaying',
  REPLAYED: 'replayed',
  FAILED_MANUAL_RESOLUTION_REQUIRED: 'failed_manual_resolution_required'
});

const QUEUE_STATUS_SET = new Set(Object.values(TERMINAL_QUEUE_STATUS));
const MAX_FALLBACK_HISTORY = 300;

const toIso = (value = Date.now()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
};

const toPositiveIntOrNull = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeStatus = (status) => (
  QUEUE_STATUS_SET.has(status) ? status : TERMINAL_QUEUE_STATUS.QUEUED
);

const sanitizeError = (error) => {
  if (!error || typeof error !== 'object') return {};
  const next = {};
  const message = String(error.message || '').trim();
  if (message) next.message = message;
  const code = String(error.code || '').trim();
  if (code) next.code = code;
  const status = Number(error.status);
  if (Number.isInteger(status) && status > 0) next.status = status;
  return next;
};

const normalizeQueueEntry = (entry = {}) => {
  const intentId = String(entry.intent_id || '').trim();
  if (!intentId) return null;

  return {
    intent_id: intentId,
    operation: String(entry.operation || '').trim() || 'unknown',
    payload: entry.payload && typeof entry.payload === 'object' ? entry.payload : {},
    shift_id: toPositiveIntOrNull(entry.shift_id),
    pos_transaction_id: toPositiveIntOrNull(entry.pos_transaction_id),
    source: String(entry.source || '').trim() || 'manual',
    status: normalizeStatus(entry.status),
    queued_at: toIso(entry.queued_at || Date.now()),
    updated_at: toIso(entry.updated_at || Date.now()),
    attempt_count: Math.max(0, Number.parseInt(entry.attempt_count, 10) || 0),
    next_retry_at: entry.next_retry_at ? toIso(entry.next_retry_at) : null,
    last_error: sanitizeError(entry.last_error),
    last_failure_at: entry.last_failure_at ? toIso(entry.last_failure_at) : null,
    replayed_at: entry.replayed_at ? toIso(entry.replayed_at) : null,
    resolved_at: entry.resolved_at ? toIso(entry.resolved_at) : null,
    resolution_note: String(entry.resolution_note || '').trim() || null,
    resolution_source: String(entry.resolution_source || '').trim() || null
  };
};

const sortByQueueTime = (entries = []) => (
  [...entries].sort((left, right) => {
    const leftTime = new Date(left.queued_at).getTime();
    const rightTime = new Date(right.queued_at).getTime();
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left.intent_id).localeCompare(String(right.intent_id));
  })
);

const hasIndexedDb = () => (
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
);

let dbPromise = null;

const openDatabase = async () => {
  if (!hasIndexedDb()) return null;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'intent_id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('updated_at', 'updated_at', { unique: false });
        store.createIndex('next_retry_at', 'next_retry_at', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
};

const withReadonlyStore = async (runner) => {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    let settled = false;
    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    tx.onerror = () => safeReject(tx.error);
    tx.onabort = () => safeReject(tx.error);
    runner(store, safeResolve, safeReject);
  });
};

const withReadwriteStore = async (runner) => {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let settled = false;
    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    tx.onerror = () => safeReject(tx.error);
    tx.onabort = () => safeReject(tx.error);
    runner(store, tx, safeResolve, safeReject);
  });
};

const readFallbackEntries = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeQueueEntry(entry))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const writeFallbackEntries = (entries = []) => {
  if (typeof window === 'undefined') return [];
  const normalized = sortByQueueTime(
    entries
      .map((entry) => normalizeQueueEntry(entry))
      .filter(Boolean)
  ).slice(-MAX_FALLBACK_HISTORY);
  window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

const readAllEntries = async () => {
  const idbRows = await withReadonlyStore((store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  if (!idbRows) {
    return sortByQueueTime(readFallbackEntries());
  }
  return sortByQueueTime(
    idbRows.map((entry) => normalizeQueueEntry(entry)).filter(Boolean)
  );
};

const upsertEntry = async (entry) => {
  const normalized = normalizeQueueEntry(entry);
  if (!normalized) return null;

  const idbResult = await withReadwriteStore((store, tx, resolve, reject) => {
    const request = store.put(normalized);
    request.onsuccess = () => resolve(normalized);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(normalized);
  });

  if (idbResult) {
    return normalized;
  }

  const fallbackRows = readFallbackEntries();
  const next = fallbackRows.filter((row) => row.intent_id !== normalized.intent_id);
  next.push(normalized);
  writeFallbackEntries(next);
  return normalized;
};

const putMany = async (entries = []) => {
  const normalizedEntries = entries
    .map((entry) => normalizeQueueEntry(entry))
    .filter(Boolean);
  if (normalizedEntries.length === 0) return [];

  const idbResult = await withReadwriteStore((store, tx, resolve, reject) => {
    normalizedEntries.forEach((entry) => {
      store.put(entry);
    });
    tx.oncomplete = () => resolve(normalizedEntries);
    tx.onerror = () => reject(tx.error);
  });

  if (idbResult) {
    return normalizedEntries;
  }

  const map = new Map(readFallbackEntries().map((entry) => [entry.intent_id, entry]));
  normalizedEntries.forEach((entry) => {
    map.set(entry.intent_id, entry);
  });
  const rows = sortByQueueTime(Array.from(map.values()));
  writeFallbackEntries(rows);
  return normalizedEntries;
};

const updateEntry = async (intentId, updater) => {
  const normalizedIntentId = String(intentId || '').trim();
  if (!normalizedIntentId) return null;
  const rows = await readAllEntries();
  const current = rows.find((entry) => entry.intent_id === normalizedIntentId);
  if (!current) return null;
  const next = updater(current);
  return upsertEntry(next);
};

const isLegacyQueueMigrated = () => {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(LEGACY_MIGRATION_FLAG_KEY) === '1';
};

const markLegacyQueueMigrated = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LEGACY_MIGRATION_FLAG_KEY, '1');
};

const extractLegacyQueue = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        ...entry,
        status: TERMINAL_QUEUE_STATUS.QUEUED,
        attempt_count: 0,
        next_retry_at: null,
        last_error: {},
        replayed_at: null,
        resolved_at: null,
        resolution_note: null,
        resolution_source: null,
        updated_at: entry.queued_at || Date.now()
      }))
      .map((entry) => normalizeQueueEntry(entry))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const isRetryWindowOpen = (entry, now = Date.now()) => {
  const nextRetryAt = entry?.next_retry_at ? new Date(entry.next_retry_at).getTime() : null;
  if (!Number.isFinite(nextRetryAt) || nextRetryAt <= 0) return true;
  return nextRetryAt <= now;
};

const isStaleReplayingEntry = (entry, now = Date.now()) => {
  if (entry?.status !== TERMINAL_QUEUE_STATUS.REPLAYING) return false;
  const updatedAt = new Date(entry.updated_at).getTime();
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return true;
  return (now - updatedAt) >= STALE_REPLAY_WINDOW_MS;
};

export const hydrateTerminalOperationQueueStore = async () => {
  if (isLegacyQueueMigrated()) return;
  const legacyRows = extractLegacyQueue();
  if (legacyRows.length > 0) {
    await putMany(legacyRows);
  }
  markLegacyQueueMigrated();
};

export const enqueueTerminalOperationIntent = async (entry, source = 'manual') => {
  const normalizedIntentId = String(entry?.intent_id || entry?.payload?.idempotency_key || '').trim();
  if (!normalizedIntentId) return null;
  const nowIso = toIso();
  const rows = await readAllEntries();
  const existing = rows.find((row) => row.intent_id === normalizedIntentId) || null;
  const nextEntry = normalizeQueueEntry({
    ...existing,
    ...entry,
    intent_id: normalizedIntentId,
    operation: entry?.operation || existing?.operation,
    payload: entry?.payload && typeof entry.payload === 'object'
      ? entry.payload
      : (existing?.payload || {}),
    source: String(source || entry?.source || existing?.source || 'manual').trim() || 'manual',
    status: TERMINAL_QUEUE_STATUS.QUEUED,
    queued_at: existing?.queued_at || nowIso,
    updated_at: nowIso,
    next_retry_at: null,
    last_error: {},
    last_failure_at: null,
    replayed_at: null,
    resolved_at: null,
    resolution_note: null,
    resolution_source: null,
    attempt_count: existing?.status === TERMINAL_QUEUE_STATUS.REPLAYED ? 0 : (existing?.attempt_count || 0)
  });
  return upsertEntry(nextEntry);
};

export const listTerminalOperationQueueEntries = async ({
  statuses = null,
  includeResolved = true,
  limit = null
} = {}) => {
  const rows = await readAllEntries();
  const statusSet = Array.isArray(statuses) && statuses.length > 0
    ? new Set(statuses.map((status) => normalizeStatus(status)))
    : null;

  const filtered = rows.filter((entry) => {
    if (statusSet && !statusSet.has(entry.status)) return false;
    if (!includeResolved && entry.status === TERMINAL_QUEUE_STATUS.REPLAYED) return false;
    return true;
  });
  if (!Number.isInteger(limit) || limit <= 0) return filtered;
  return filtered.slice(0, limit);
};

export const getReplayCandidateEntries = async ({ limit = 20 } = {}) => {
  const now = Date.now();
  const rows = await readAllEntries();
  const candidates = [];
  for (const row of rows) {
    if (row.status === TERMINAL_QUEUE_STATUS.QUEUED && isRetryWindowOpen(row, now)) {
      candidates.push(row);
      continue;
    }
    if (isStaleReplayingEntry(row, now)) {
      const reset = await markTerminalOperationQueued(row.intent_id, { preserveAttempts: true });
      if (reset) candidates.push(reset);
    }
  }
  const sorted = sortByQueueTime(candidates);
  if (!Number.isInteger(limit) || limit <= 0) return sorted;
  return sorted.slice(0, limit);
};

export const getTerminalOperationQueueSummary = async () => {
  const rows = await readAllEntries();
  const summary = {
    total: rows.length,
    [TERMINAL_QUEUE_STATUS.QUEUED]: 0,
    [TERMINAL_QUEUE_STATUS.REPLAYING]: 0,
    [TERMINAL_QUEUE_STATUS.REPLAYED]: 0,
    [TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED]: 0
  };
  rows.forEach((row) => {
    const status = normalizeStatus(row.status);
    summary[status] = (summary[status] || 0) + 1;
  });
  summary.pending = summary[TERMINAL_QUEUE_STATUS.QUEUED] + summary[TERMINAL_QUEUE_STATUS.REPLAYING];
  summary.blocked = summary[TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED];
  return summary;
};

export const markTerminalOperationReplaying = async (intentId) => (
  updateEntry(intentId, (current) => ({
    ...current,
    status: TERMINAL_QUEUE_STATUS.REPLAYING,
    updated_at: toIso(),
    next_retry_at: null
  }))
);

export const markTerminalOperationReplayed = async (intentId, details = {}) => (
  updateEntry(intentId, (current) => ({
    ...current,
    status: TERMINAL_QUEUE_STATUS.REPLAYED,
    updated_at: toIso(),
    replayed_at: toIso(),
    next_retry_at: null,
    last_error: {},
    last_failure_at: null,
    resolution_source: details.resolution_source || current.resolution_source || null,
    resolution_note: details.resolution_note || current.resolution_note || null,
    resolved_at: details.resolved_at ? toIso(details.resolved_at) : (current.resolved_at || null)
  }))
);

export const markTerminalOperationQueued = async (
  intentId,
  { preserveAttempts = false, nextRetryAt = null } = {}
) => (
  updateEntry(intentId, (current) => ({
    ...current,
    status: TERMINAL_QUEUE_STATUS.QUEUED,
    updated_at: toIso(),
    next_retry_at: nextRetryAt ? toIso(nextRetryAt) : null,
    attempt_count: preserveAttempts ? (current.attempt_count || 0) : 0
  }))
);

export const markTerminalOperationRetryScheduled = async (
  intentId,
  { attemptCount = 1, nextRetryAt = null, error = null } = {}
) => (
  updateEntry(intentId, (current) => ({
    ...current,
    status: TERMINAL_QUEUE_STATUS.QUEUED,
    updated_at: toIso(),
    attempt_count: Math.max(0, Number.parseInt(attemptCount, 10) || 0),
    next_retry_at: nextRetryAt ? toIso(nextRetryAt) : null,
    last_error: sanitizeError(error),
    last_failure_at: toIso()
  }))
);

export const markTerminalOperationFailedManualResolution = async (
  intentId,
  { error = null } = {}
) => (
  updateEntry(intentId, (current) => ({
    ...current,
    status: TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED,
    updated_at: toIso(),
    next_retry_at: null,
    last_error: sanitizeError(error),
    last_failure_at: toIso()
  }))
);

export const markTerminalOperationResolved = async (
  intentId,
  { note = '' } = {}
) => (
  updateEntry(intentId, (current) => ({
    ...current,
    status: TERMINAL_QUEUE_STATUS.REPLAYED,
    updated_at: toIso(),
    replayed_at: current.replayed_at || toIso(),
    resolved_at: toIso(),
    resolution_source: 'manual',
    resolution_note: String(note || '').trim() || 'Marked resolved manually',
    next_retry_at: null,
    last_error: {}
  }))
);

export const pruneTerminalOperationHistory = async ({ keep = MAX_FALLBACK_HISTORY } = {}) => {
  const rows = await readAllEntries();
  if (rows.length <= keep) return rows;

  const pinned = rows.filter((row) => (
    row.status === TERMINAL_QUEUE_STATUS.QUEUED
    || row.status === TERMINAL_QUEUE_STATUS.REPLAYING
    || row.status === TERMINAL_QUEUE_STATUS.FAILED_MANUAL_RESOLUTION_REQUIRED
  ));
  const replayed = rows
    .filter((row) => row.status === TERMINAL_QUEUE_STATUS.REPLAYED)
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
  const slots = Math.max(0, keep - pinned.length);
  const nextRows = sortByQueueTime([...pinned, ...replayed.slice(0, slots)]);

  const idbResult = await withReadwriteStore((store, tx, resolve, reject) => {
    const clearRequest = store.clear();
    clearRequest.onerror = () => reject(clearRequest.error);
    clearRequest.onsuccess = () => {
      nextRows.forEach((row) => store.put(row));
      tx.oncomplete = () => resolve(nextRows);
      tx.onerror = () => reject(tx.error);
    };
  });
  if (idbResult) return nextRows;

  writeFallbackEntries(nextRows);
  return nextRows;
};

