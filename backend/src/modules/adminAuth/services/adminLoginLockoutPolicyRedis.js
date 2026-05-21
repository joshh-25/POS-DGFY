import { getRedisClient, isRedisConnected } from '../../../config/redis.js';

const toKey = (prefix, identityKey) => {
  const encodedIdentity = encodeURIComponent(String(identityKey || '').toLowerCase());
  return `${prefix}:${encodedIdentity}`;
};

const parseCount = (value) => {
  const parsed = Number.parseInt(String(value || '0'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const createRedisAdminLoginLockoutPolicy = ({
  maxAttempts,
  windowMs,
  lockoutMs,
  fallbackPolicy,
  nowProvider = () => Date.now(),
  getRedisClientFn = getRedisClient,
  isRedisConnectedFn = isRedisConnected,
  redisKeyPrefix = 'admin_auth_lockout'
}) => {
  const attemptsTtlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const lockoutTtlSeconds = Math.max(1, Math.ceil(lockoutMs / 1000));

  const withFallback = async (fallbackAction) => {
    if (!isRedisConnectedFn()) {
      return fallbackAction();
    }
    const client = getRedisClientFn();
    if (!client) {
      return fallbackAction();
    }
    return null;
  };

  const check = async (identityKey) => {
    const fallbackResult = await withFallback(async () => (
      fallbackPolicy?.check?.(identityKey) || { locked: false, retryAfterMs: 0 }
    ));
    if (fallbackResult) return fallbackResult;

    const client = getRedisClientFn();
    const lockKey = toKey(`${redisKeyPrefix}:lock`, identityKey);
    const lockUntilRaw = await client.get(lockKey);
    if (!lockUntilRaw) {
      return { locked: false, retryAfterMs: 0 };
    }

    const now = nowProvider();
    const lockUntil = Number.parseInt(lockUntilRaw, 10);
    if (!Number.isFinite(lockUntil)) {
      return { locked: true, retryAfterMs: 0 };
    }

    return {
      locked: now < lockUntil,
      retryAfterMs: Math.max(0, lockUntil - now)
    };
  };

  const registerFailure = async (identityKey) => {
    const usedFallback = await withFallback(async () => {
      fallbackPolicy?.registerFailure?.(identityKey);
      return true;
    });
    if (usedFallback) return;

    const client = getRedisClientFn();
    const attemptsKey = toKey(`${redisKeyPrefix}:attempts`, identityKey);
    const lockKey = toKey(`${redisKeyPrefix}:lock`, identityKey);

    const currentCount = parseCount(await client.get(attemptsKey));
    const nextCount = currentCount + 1;
    await client.setEx(attemptsKey, attemptsTtlSeconds, String(nextCount));

    if (nextCount >= maxAttempts) {
      const lockUntil = nowProvider() + lockoutMs;
      await client.setEx(lockKey, lockoutTtlSeconds, String(lockUntil));
      await client.del(attemptsKey);
    }
  };

  const clear = async (identityKey) => {
    const usedFallback = await withFallback(async () => {
      fallbackPolicy?.clear?.(identityKey);
      return true;
    });
    if (usedFallback) return;

    const client = getRedisClientFn();
    const attemptsKey = toKey(`${redisKeyPrefix}:attempts`, identityKey);
    const lockKey = toKey(`${redisKeyPrefix}:lock`, identityKey);
    await client.del(attemptsKey, lockKey);
  };

  return {
    check,
    registerFailure,
    clear
  };
};

