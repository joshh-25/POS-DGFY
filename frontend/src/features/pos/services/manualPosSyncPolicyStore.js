const STORAGE_KEY_PREFIX = 'dgfy.pos.manual-sync-policy.v1';
export const MAX_MANUAL_POS_SYNCS_PER_DAY = 2;

const getLocalDayKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getScopeKey = ({ terminalId, userId } = {}) => (
    `${String(terminalId || '').trim() || 'unassigned-terminal'}:${String(userId || '').trim() || 'unassigned-user'}`
);

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
    if (!storage) {
        return { ...fallback, remaining: MAX_MANUAL_POS_SYNCS_PER_DAY, resetAt: nextLocalMidnight() };
    }

    try {
        const stored = JSON.parse(storage.getItem(`${STORAGE_KEY_PREFIX}:${getScopeKey(scope)}`) || 'null');
        const attempts = stored?.day === day ? Math.max(0, Number(stored?.attempts || 0)) : 0;
        return {
            day,
            attempts,
            remaining: Math.max(0, MAX_MANUAL_POS_SYNCS_PER_DAY - attempts),
            resetAt: nextLocalMidnight()
        };
    } catch {
        return { ...fallback, remaining: MAX_MANUAL_POS_SYNCS_PER_DAY, resetAt: nextLocalMidnight() };
    }
};

export const consumeManualPosSyncAttempt = (scope) => {
    const policy = getManualPosSyncPolicy(scope);
    if (policy.remaining <= 0) return { ...policy, allowed: false };

    const next = { day: policy.day, attempts: policy.attempts + 1 };
    const storage = getStorage();
    if (storage) {
        try {
            storage.setItem(`${STORAGE_KEY_PREFIX}:${getScopeKey(scope)}`, JSON.stringify(next));
        } catch {
            // The in-memory result still prevents duplicate clicks in the current terminal session.
        }
    }
    return {
        ...next,
        remaining: Math.max(0, MAX_MANUAL_POS_SYNCS_PER_DAY - next.attempts),
        resetAt: nextLocalMidnight(),
        allowed: true
    };
};
