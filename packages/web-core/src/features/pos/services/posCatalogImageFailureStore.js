import { buildOfflinePosScopeKey } from './offlinePosScope.js';

const STORAGE_KEY_PREFIX = 'dgfy.pos.catalog-image-failures.v1';
const MAX_FAILED_ITEM_IDS = 500;
const inMemoryFailuresByScope = new Map();

const normalizeItemId = (value) => String(value ?? '').trim();

const normalizeFailures = (failures) => {
    const values = failures instanceof Set
        ? Array.from(failures)
        : Array.isArray(failures) ? failures : [];
    return new Set(values
        .map(normalizeItemId)
        .filter(Boolean)
        .slice(0, MAX_FAILED_ITEM_IDS));
};

const getSessionStorage = () => {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage || null;
    } catch {
        return null;
    }
};

const getStorageKey = (scope) => {
    const scopeKey = buildOfflinePosScopeKey(scope);
    return scopeKey ? `${STORAGE_KEY_PREFIX}:${scopeKey}` : '';
};

export const loadPosCatalogImageFailures = (scope = {}) => {
    const storageKey = getStorageKey(scope);
    if (!storageKey) return new Set();

    const failures = new Set(inMemoryFailuresByScope.get(storageKey) || []);
    const storage = getSessionStorage();
    if (storage) {
        try {
            const stored = JSON.parse(storage.getItem(storageKey) || '[]');
            normalizeFailures(stored).forEach((itemId) => failures.add(itemId));
        } catch {
            // A malformed or unavailable session entry must not block catalog rendering.
        }
    }

    const normalized = normalizeFailures(Array.from(failures));
    inMemoryFailuresByScope.set(storageKey, normalized);
    return new Set(normalized);
};

export const savePosCatalogImageFailures = (scope = {}, failures = new Set()) => {
    const storageKey = getStorageKey(scope);
    if (!storageKey) return false;

    const normalized = normalizeFailures(failures);
    inMemoryFailuresByScope.set(storageKey, normalized);
    const storage = getSessionStorage();
    if (!storage) return true;

    try {
        storage.setItem(storageKey, JSON.stringify(Array.from(normalized)));
        return true;
    } catch {
        // Keep the in-memory quarantine active for this tab when sessionStorage is unavailable.
        return false;
    }
};
