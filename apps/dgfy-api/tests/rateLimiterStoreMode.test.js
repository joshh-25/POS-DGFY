import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const originalEnv = { ...process.env };

describe('rate limiter store mode', () => {
  let redisModule;
  let rateLimiterModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    redisModule = await import('../src/config/redis.js');
    redisModule.isRedisConnected.mockReturnValue(false);
    redisModule.getRedisClient.mockReturnValue(null);
    process.env.REDIS_URL = '';
    rateLimiterModule = await import('../src/middleware/rateLimiter.js');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('lazily switches a dynamic store to Redis after Redis becomes available', () => {
    const store = new rateLimiterModule.DynamicStore('late_test');
    store.init({ windowMs: 60000 });

    expect(store.getMode()).toBe('memory');

    redisModule.getRedisClient.mockReturnValue({
      sendCommand: jest.fn(async () => 'OK')
    });
    redisModule.isRedisConnected.mockReturnValue(true);

    expect(store.getMode()).toBe('redis');
    expect(rateLimiterModule.getRateLimiterStoreMode()).toBe('redis');
  });

  it('reports memory fallback when Redis is configured but unavailable', () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    redisModule.isRedisConnected.mockReturnValue(false);
    redisModule.getRedisClient.mockReturnValue(null);

    expect(rateLimiterModule.getRateLimiterStoreMode()).toBe('memory_fallback');
  });
});
