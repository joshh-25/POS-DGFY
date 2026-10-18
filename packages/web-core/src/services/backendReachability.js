export const GATEWAY_FAILURE_STATUS_CODES = new Set([502, 503, 504]);
export const BACKEND_UNREACHABLE_STATUS_CODES = new Set([408, ...GATEWAY_FAILURE_STATUS_CODES]);
export const BACKEND_RETRYABLE_STATUS_CODES = new Set([
    ...BACKEND_UNREACHABLE_STATUS_CODES,
    429,
    500
]);

const NETWORK_FAILURE_CODES = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT']);
const CANCELLED_ERROR_NAMES = new Set(['CanceledError', 'AbortError']);

const getResponseStatus = (error) => {
    const status = error?.response?.status ?? error?.status;
    if (status === undefined || status === null || status === '') return null;
    const numericStatus = Number(status);
    return Number.isFinite(numericStatus) ? numericStatus : null;
};

export const isRequestCancelled = (error) => (
    error?.code === 'ERR_CANCELED'
    || CANCELLED_ERROR_NAMES.has(String(error?.name || ''))
);

const isTransportFailure = (error) => {
    if (isRequestCancelled(error) || error?.response) return false;
    if (NETWORK_FAILURE_CODES.has(String(error?.code || ''))) return true;
    return Boolean(error?.request) && getResponseStatus(error) === null;
};

export const isBackendUnreachable = (error) => {
    if (!error || isRequestCancelled(error)) return false;

    const status = getResponseStatus(error);
    if (status !== null || error?.response) {
        return status !== null && BACKEND_UNREACHABLE_STATUS_CODES.has(status);
    }
    return isTransportFailure(error);
};

export const isRetryableBackendFailure = (error) => {
    if (!error || isRequestCancelled(error)) return false;

    const status = getResponseStatus(error);
    if (status !== null || error?.response) {
        return status !== null && BACKEND_RETRYABLE_STATUS_CODES.has(status);
    }
    return isTransportFailure(error);
};

export const computeUnreachableBackoffMs = ({
    baseMs,
    consecutiveFailures = 0,
    capMs,
    jitter = 0,
    random = Math.random
} = {}) => {
    const safeBaseMs = Math.max(0, Number(baseMs) || 0);
    const safeCapMs = Math.max(safeBaseMs, Number(capMs) || safeBaseMs);
    const failureCount = Math.max(0, Math.floor(Number(consecutiveFailures) || 0));
    if (failureCount === 0 || safeBaseMs === 0) return safeBaseMs;

    const jitterRatio = Math.min(1, Math.max(0, Number(jitter) || 0));
    const randomValue = Math.min(1, Math.max(0, Number(random()) || 0));
    const exponentialDelay = safeBaseMs * (2 ** Math.min(failureCount - 1, 30));
    const jitteredDelay = exponentialDelay * (1 - jitterRatio + (2 * jitterRatio * randomValue));
    return Math.min(safeCapMs, Math.round(jitteredDelay));
};

export const createUnreachablePollScheduler = ({
    run,
    isInFlight = () => false,
    getConsecutiveFailures = () => 0,
    baseMs,
    capMs,
    jitter = 0.2,
    random = Math.random,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
} = {}) => {
    let stopped = false;
    let timer = null;

    const scheduleNext = () => {
        if (stopped) return;
        const delayMs = computeUnreachableBackoffMs({
            baseMs,
            consecutiveFailures: getConsecutiveFailures(),
            capMs,
            jitter,
            random
        });
        timer = setTimeoutFn(() => {
            timer = null;
            if (stopped) return;
            if (isInFlight()) {
                scheduleNext();
                return;
            }
            Promise.resolve()
                .then(() => run?.())
                .then(scheduleNext, scheduleNext);
        }, delayMs);
    };

    scheduleNext();
    return {
        refresh: (...args) => run?.(...args),
        stop: () => {
            stopped = true;
            if (timer !== null) clearTimeoutFn(timer);
            timer = null;
        }
    };
};
