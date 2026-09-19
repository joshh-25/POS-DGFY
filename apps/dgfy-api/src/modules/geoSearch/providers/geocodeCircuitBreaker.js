const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_OPEN_MS = 60000;

export const createCircuitBreaker = ({
    failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    openMs = DEFAULT_OPEN_MS,
    now = () => Date.now()
} = {}) => {
    let consecutiveFailures = 0;
    let openedAt = null;

    const isOpen = () => {
        if (openedAt === null) return false;
        if (now() - openedAt >= openMs) {
            // Window elapsed: close and let one trial request through.
            openedAt = null;
            consecutiveFailures = 0;
            return false;
        }
        return true;
    };

    return {
        isOpen,
        recordSuccess: () => {
            consecutiveFailures = 0;
            openedAt = null;
        },
        recordFailure: () => {
            consecutiveFailures += 1;
            if (consecutiveFailures >= failureThreshold) openedAt = now();
        },
        reset: () => {
            consecutiveFailures = 0;
            openedAt = null;
        }
    };
};

export const geocodeCircuitBreaker = createCircuitBreaker();
