import { buildOfflinePosScopeKey } from './offlinePosScope.js';

const STORAGE_KEY_PREFIX = 'dgfy.pos.manual-sync-policy.v2';
export const MAX_MANUAL_POS_SYNCS_PER_DAY = 2;
const inMemoryPolicies = new Map();

const getLocalDayKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getStorage = () => {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
};

const nextLocalMidnight = () => {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    return next.toISOString();
};

export const getManualPosSyncPolicy = (scope) => {
    const storage = getStorage();
    const day = getLocalDayKey();
    const fallback = { day, attempts: 0 };
    const scopeKey = buildOfflinePosScopeKey(scope);
    if (!scopeKey) {
        return { ...fallback, remaining: 0, resetAt: nextLocalMidnight(), scopeReady: false };
    }
    const memoryPolicy = inMemoryPolicies.get(scopeKey);
    const memoryAttempts = memoryPolicy?.day === day
        ? Math.max(0, Number(memoryPolicy?.attempts || 0))
        : 0;
    if (!storage) {
        return {
            day,
            attempts: memoryAttempts,
            remaining: Math.max(0, MAX_MANUAL_POS_SYNCS_PER_DAY - memoryAttempts),
            resetAt: nextLocalMidnight(),
            scopeReady: true
        };
    }

    try {
        const stored = JSON.parse(storage.getItem(`${STORAGE_KEY_PREFIX}:${scopeKey}`) || 'null');
        const storedAttempts = stored?.day === day ? Math.max(0, Number(stored?.attempts || 0)) : 0;
        const attempts = Math.max(storedAttempts, memoryAttempts);
        return {
            day,
            attempts,
            remaining: Math.max(0, MAX_MANUAL_POS_SYNCS_PER_DAY - attempts),
            resetAt: nextLocalMidnight(),
            scopeReady: true
        };
    } catch {
        return {
            day,
            attempts: memoryAttempts,
            remaining: Math.max(0, MAX_MANUAL_POS_SYNCS_PER_DAY - memoryAttempts),
            resetAt: nextLocalMidnight(),
            scopeReady: true
        };
    }
};

export const consumeManualPosSyncAttempt = (scope) => {
    const policy = getManualPosSyncPolicy(scope);
    if (!policy.scopeReady) return { ...policy, allowed: false };
    if (policy.remaining <= 0) return { ...policy, allowed: false };

    const next = { day: policy.day, attempts: policy.attempts + 1 };
    const scopeKey = buildOfflinePosScopeKey(scope);
    inMemoryPolicies.set(scopeKey, next);
    const storage = getStorage();
    if (storage) {
        try {
            storage.setItem(`${STORAGE_KEY_PREFIX}:${scopeKey}`, JSON.stringify(next));
        } catch {
            // The in-memory policy still enforces the limit in the current terminal session.
        }
    }
    return {
        ...next,
        remaining: Math.max(0, MAX_MANUAL_POS_SYNCS_PER_DAY - next.attempts),
        resetAt: nextLocalMidnight(),
        scopeReady: true,
        allowed: true
    };
};
