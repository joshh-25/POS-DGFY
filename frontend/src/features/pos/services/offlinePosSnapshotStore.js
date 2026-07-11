const STORAGE_KEY_PREFIX = 'dgfy.pos.offline-snapshot.v1';

const getScopeKey = ({ terminalId, locationId, userId } = {}) => [
    String(terminalId || '').trim() || 'unassigned-terminal',
    String(locationId || '').trim() || 'unassigned-location',
    String(userId || '').trim() || 'unassigned-user'
].join(':');

const getStorageKey = (scope) => `${STORAGE_KEY_PREFIX}:${getScopeKey(scope)}`;

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
    if (!storage) return false;

    try {
        storage.setItem(getStorageKey(scope), JSON.stringify({
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
    if (!storage) return null;

    try {
        const parsed = JSON.parse(storage.getItem(getStorageKey(scope)) || 'null');
        if (!parsed || !Array.isArray(parsed.catalog)) return null;
        return parsed;
    } catch {
        return null;
    }
};

const getReportStorageKey = (scope, reportKey) => `${STORAGE_KEY_PREFIX}:report:${getScopeKey(scope)}:${reportKey}`;

export const saveOfflinePosReportSnapshot = (scope, reportKey, payload) => {
    const storage = getStorage();
    if (!storage || !payload || typeof payload !== 'object') return false;
    try {
        storage.setItem(getReportStorageKey(scope, reportKey), JSON.stringify({
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
    if (!storage) return null;
    try {
        const parsed = JSON.parse(storage.getItem(getReportStorageKey(scope, reportKey)) || 'null');
        return parsed?.payload && typeof parsed.payload === 'object' ? parsed : null;
    } catch {
        return null;
    }
};
