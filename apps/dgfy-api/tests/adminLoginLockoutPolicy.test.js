import { createInMemoryAdminLoginLockoutPolicy } from '../src/modules/adminAuth/services/adminLoginLockoutPolicy.js';

describe('createInMemoryAdminLoginLockoutPolicy', () => {
  it('locks identity after max failures and releases after lockout window', () => {
    let now = 1_000;
    const policy = createInMemoryAdminLoginLockoutPolicy({
      maxAttempts: 3,
      windowMs: 10_000,
      lockoutMs: 5_000,
      nowProvider: () => now
    });
    const key = 'skupervisor|127.0.0.1';

    expect(policy.check(key)).toEqual({ locked: false, retryAfterMs: 0 });

    policy.registerFailure(key);
    policy.registerFailure(key);
    expect(policy.check(key)).toEqual({ locked: false, retryAfterMs: 0 });

    policy.registerFailure(key);
    const locked = policy.check(key);
    expect(locked.locked).toBe(true);
    expect(locked.retryAfterMs).toBeGreaterThan(0);

    now += 6_000;
    expect(policy.check(key)).toEqual({ locked: false, retryAfterMs: 0 });
  });

  it('resets failure state on successful clear', () => {
    const policy = createInMemoryAdminLoginLockoutPolicy({
      maxAttempts: 2,
      windowMs: 10_000,
      lockoutMs: 10_000
    });
    const key = 'skupervisor|127.0.0.1';

    policy.registerFailure(key);
    policy.clear(key);
    expect(policy.check(key)).toEqual({ locked: false, retryAfterMs: 0 });
  });
});

