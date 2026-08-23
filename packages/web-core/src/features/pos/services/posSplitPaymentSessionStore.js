const STORAGE_PREFIX = 'pos_split_payment_session:';

export const buildPosSplitPaymentStorageKey = (scopeKey) => (
    scopeKey ? `${STORAGE_PREFIX}${scopeKey}` : ''
);

export const readPosSplitPaymentSessionPointer = (storageKey) => {
    if (typeof window === 'undefined' || !storageKey) return null;
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const sessionId = Number(parsed?.session_id || 0);
        return sessionId > 0
            ? { sessionId, idempotencyKey: String(parsed?.idempotency_key || '') }
            : null;
    } catch {
        return null;
    }
};

export const persistPosSplitPaymentSessionPointer = (storageKey, value) => {
    if (typeof window === 'undefined' || !storageKey) return;
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
        // Browser persistence is recovery convenience only; the server stays authoritative.
    }
};

export const clearPosSplitPaymentSessionPointer = (storageKey) => {
    if (typeof window === 'undefined' || !storageKey) return;
    try {
        window.localStorage.removeItem(storageKey);
    } catch {
        // A storage failure must not change the server payment-session lifecycle.
    }
};

export const isTerminalPosPaymentSession = (session) => (
    ['completed', 'cancelled'].includes(String(session?.status || '').toLowerCase())
);
