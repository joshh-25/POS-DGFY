import { createRedisAdminLoginLockoutPolicy } from '../src/modules/adminAuth/services/adminLoginLockoutPolicyRedis.js';
import { jest } from '@jest/globals';

describe('createRedisAdminLoginLockoutPolicy', () => {
  const createMockRedis = () => {
    const store = new Map();
    return {
      get: async (key) => (store.has(key) ? store.get(key) : null),
      setEx: async (key, _ttl, value) => {
        store.set(key, String(value));
        return 'OK';
      },
      del: async (...keys) => {
        const flattened = keys.flat();
        let deleted = 0;
        for (const key of flattened) {
          if (store.delete(key)) deleted += 1;
        }
        return deleted;
      }
    };
  };

  it('locks identity using redis state after configured number of failures', async () => {
    let now = 1_000;
    const redis = createMockRedis();
    const policy = createRedisAdminLoginLockoutPolicy({
      maxAttempts: 3,
      windowMs: 60_000,
      lockoutMs: 30_000,
      fallbackPolicy: null,
      nowProvider: () => now,
      getRedisClientFn: () => redis,
      isRedisConnectedFn: () => true
    });
    const key = 'skupervisor|127.0.0.1';

    expect(await policy.check(key)).toEqual({ locked: false, retryAfterMs: 0 });
    await policy.registerFailure(key);
    await policy.registerFailure(key);
    expect(await policy.check(key)).toEqual({ locked: false, retryAfterMs: 0 });

    await policy.registerFailure(key);
    const locked = await policy.check(key);
    expect(locked.locked).toBe(true);
    expect(locked.retryAfterMs).toBeGreaterThan(0);

    now += 31_000;
    const after = await policy.check(key);
    // In a real redis instance the key expires automatically; here we only assert lock math behavior.
    expect(after.locked).toBe(false);
    expect(after.retryAfterMs).toBe(0);
  });

  it('falls back to in-memory policy when redis is unavailable', async () => {
    const fallback = {
      check: jest.fn().mockReturnValue({ locked: false, retryAfterMs: 0 }),
      registerFailure: jest.fn(),
      clear: jest.fn()
    };
    const policy = createRedisAdminLoginLockoutPolicy({
      maxAttempts: 3,
      windowMs: 60_000,
      lockoutMs: 30_000,
      fallbackPolicy: fallback,
      getRedisClientFn: () => null,
      isRedisConnectedFn: () => false
    });
    const key = 'skupervisor|127.0.0.1';

    const checked = await policy.check(key);
    expect(checked).toEqual({ locked: false, retryAfterMs: 0 });
    await policy.registerFailure(key);
    await policy.clear(key);

    expect(fallback.check).toHaveBeenCalledWith(key);
    expect(fallback.registerFailure).toHaveBeenCalledWith(key);
    expect(fallback.clear).toHaveBeenCalledWith(key);
  });
});
