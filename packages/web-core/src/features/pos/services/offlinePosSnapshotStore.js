import { buildOfflinePosScopeKey } from './offlinePosScope.js';

const STORAGE_KEY_PREFIX = 'dgfy.pos.offline-snapshot.v2';
const REPORT_SNAPSHOT_VERSION = 2;

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

export const saveOfflinePosReportSnapshot = (scope, reportKey, payload, reportType = 'overview') => {
    const storage = getStorage();
    const storageKey = getReportStorageKey(scope, reportKey);
    if (!storage || !storageKey || !payload || typeof payload !== 'object') return false;
    try {
        storage.setItem(storageKey, JSON.stringify({
            snapshot_version: REPORT_SNAPSHOT_VERSION,
            saved_at: new Date().toISOString(),
            generated_at: payload.generated_at || null,
            report_type: String(reportType || 'overview'),
            query_identity: reportKey,
            scope_identity: buildOfflinePosScopeKey(scope),
            stale: false,
            payload
        }));
        return true;
    } catch {
        return false;
    }
};

export const loadOfflinePosReportSnapshot = (scope, reportKey, reportType = 'overview') => {
    const storage = getStorage();
    const storageKey = getReportStorageKey(scope, reportKey);
    if (!storage || !storageKey) return null;
    try {
        const parsed = JSON.parse(storage.getItem(storageKey) || 'null');
        if (!parsed?.payload || typeof parsed.payload !== 'object') return null;
        if (Number(parsed.snapshot_version) !== REPORT_SNAPSHOT_VERSION) return null;
        if (String(parsed.report_type || '') !== String(reportType || 'overview')) return null;
        if (String(parsed.query_identity || '') !== String(reportKey || '')) return null;
        if (String(parsed.scope_identity || '') !== String(buildOfflinePosScopeKey(scope) || '')) return null;
        return { ...parsed, stale: true };
    } catch {
        return null;
    }
};
