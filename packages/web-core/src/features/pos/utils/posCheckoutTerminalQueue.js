export const CHECKOUT_QUEUE_OPERATION = 'checkout';
export const CHECKOUT_QUEUE_MAX_RETRIES = 5;
export const CHECKOUT_REPLAY_BATCH_SIZE = 20;
export const RETRYABLE_CHECKOUT_REPLAY_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
export const CHECKOUT_RETRY_BACKOFF_BASE_MS = 1500;

export const isCheckoutQueueEntry = (entry) => (
    String(entry?.operation || '').trim() === CHECKOUT_QUEUE_OPERATION
);

export const isRetryableCheckoutReplayError = (error) => {
    if (!error?.response) return true;
    const status = Number(error?.response?.status || 0);
    return RETRYABLE_CHECKOUT_REPLAY_STATUS_CODES.has(status);
};

export const resolveCheckoutReplayErrorDetails = (error) => ({
    message: String(error?.response?.data?.message || error?.message || 'Replay failed').trim(),
    code: String(error?.response?.data?.error_code || error?.code || '').trim() || undefined,
    status: Number(error?.response?.status || 0) || undefined
});

export const computeCheckoutReplayBackoffMs = (attemptCount = 1, random = Math.random) => {
    const jitterMs = Math.floor(random() * 250);
    return Math.min(90_000, (CHECKOUT_RETRY_BACKOFF_BASE_MS * (2 ** Math.max(0, attemptCount - 1))) + jitterMs);
};

export const createIdempotencyKey = () => {
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
