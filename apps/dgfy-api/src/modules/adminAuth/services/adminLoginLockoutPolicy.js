export const createInMemoryAdminLoginLockoutPolicy = ({
  maxAttempts,
  windowMs,
  lockoutMs,
  nowProvider = () => Date.now()
}) => {
  const attemptsByIdentity = new Map();

  const cleanupStale = (identityKey, now) => {
    const state = attemptsByIdentity.get(identityKey);
    if (!state) return null;

    if (state.lockedUntil && now >= state.lockedUntil) {
      attemptsByIdentity.delete(identityKey);
      return null;
    }

    if (!state.lockedUntil && state.firstFailureAt && now - state.firstFailureAt > windowMs) {
      attemptsByIdentity.delete(identityKey);
      return null;
    }

    return state;
  };

  const check = (identityKey) => {
    const now = nowProvider();
    const state = cleanupStale(identityKey, now);
    if (!state || !state.lockedUntil) {
      return { locked: false, retryAfterMs: 0 };
    }

    return {
      locked: now < state.lockedUntil,
      retryAfterMs: Math.max(0, state.lockedUntil - now)
    };
  };

  const registerFailure = (identityKey) => {
    const now = nowProvider();
    const state = cleanupStale(identityKey, now);

    if (!state) {
      attemptsByIdentity.set(identityKey, {
        count: 1,
        firstFailureAt: now,
        lockedUntil: null
      });
      return;
    }

    const withinWindow = now - state.firstFailureAt <= windowMs;
    const nextCount = withinWindow ? state.count + 1 : 1;
    const firstFailureAt = withinWindow ? state.firstFailureAt : now;
    const lockedUntil = nextCount >= maxAttempts ? now + lockoutMs : null;

    attemptsByIdentity.set(identityKey, {
      count: nextCount,
      firstFailureAt,
      lockedUntil
    });
  };

  const clear = (identityKey) => {
    attemptsByIdentity.delete(identityKey);
  };

  return {
    check,
    registerFailure,
    clear
  };
};

