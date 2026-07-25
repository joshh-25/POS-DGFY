import { buildOfflinePosScopeKey } from './offlinePosScope.js';

const STORAGE_KEY_PREFIX = 'dgfy.pos.offline-snapshot.v2';

const getStorageKey = (scope) => {
    const scopeKey = buildOfflinePosScopeKey(scope);
    return scopeKey ? `${STORAGE_KEY_PREFIX}:${scopeKey}` : '';
};

const getStorage = () => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
};

// Auth and settings never enter browser snapshots. Reports use a separate read-only cached payload.
export const saveOfflinePosSnapshot = (scope, snapshot) => {
    const storage = getStorage();
    const storageKey = getStorageKey(scope);
    if (!storage || !storageKey) return false;

    try {
        storage.setItem(storageKey, JSON.stringify({
            saved_at: new Date().toISOString(),
            catalog: Array.isArray(snapshot?.catalog) ? snapshot.catalog : [],
            receipt_settings: snapshot?.receiptSettings && typeof snapshot.receiptSettings === 'object'
                ? snapshot.receiptSettings
                : {}
        }));
        return true;
    } catch {
        return false;
    }
};

export const loadOfflinePosSnapshot = (scope) => {
    const storage = getStorage();
    const storageKey = getStorageKey(scope);
    if (!storage || !storageKey) return null;

    try {
        const parsed = JSON.parse(storage.getItem(storageKey) || 'null');
        if (!parsed || !Array.isArray(parsed.catalog)) return null;
        return parsed;
    } catch {
        return null;
    }
};

const getReportStorageKey = (scope, reportKey) => {
    const scopeKey = buildOfflinePosScopeKey(scope);
    return scopeKey ? `${STORAGE_KEY_PREFIX}:report:${scopeKey}:${reportKey}` : '';
};

export const saveOfflinePosReportSnapshot = (scope, reportKey, payload) => {
    const storage = getStorage();
    const storageKey = getReportStorageKey(scope, reportKey);
    if (!storage || !storageKey || !payload || typeof payload !== 'object') return false;
    try {
        storage.setItem(storageKey, JSON.stringify({
            saved_at: new Date().toISOString(),
            payload
        }));
        return true;
    } catch {
        return false;
    }
};

export const loadOfflinePosReportSnapshot = (scope, reportKey) => {
    const storage = getStorage();
    const storageKey = getReportStorageKey(scope, reportKey);
    if (!storage || !storageKey) return null;
    try {
        const parsed = JSON.parse(storage.getItem(storageKey) || 'null');
        return parsed?.payload && typeof parsed.payload === 'object' ? parsed : null;
    } catch {
        return null;
    }
};
