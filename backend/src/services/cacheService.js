import { getRedisClient, isRedisConnected } from '../config/redis.js';
import logger from '../config/logger.js';
import dbStore from '../utils/dbStore.js'; // Fix 8.1: Import for tenant context

/**
 * Cache Service
 * Provides caching functionality with Redis as backend
 * Gracefully degrades to no-op if Redis is unavailable
 */

// Fix 8.1: Helper to scope keys by tenant
const getScopedKey = (key) => {
  const store = dbStore.getStore();
  // If we are in a tenant context (request/job), prefix the key
  if (store && store.tenantId) {
    return `tenant:${store.tenantId}:${key}`;
  }
  // If global context (system jobs without tenant), leave as is or prefix global?
  // Finding 8.1 is about collision. Global keys might collide with tenant keys if not careful.
  // Best practice: If no tenant, assume it's a SYSTEM key.
  return `system:${key}`;
};

/**
 * Get cached value by key
 * @param {string} key - Cache key
 * @returns {Promise<string|null>} - Cached value or null if not found/unavailable
 */
export const get = async (key) => {
  if (!isRedisConnected()) {
    return null;
  }

  try {
    const client = getRedisClient();
    if (!client) {
      return null;
    }

    const scopedKey = getScopedKey(key);
    const value = await client.get(scopedKey);
    return value;
  } catch (error) {
    logger.error('Cache get error:', { key, error: error.message });
    return null;
  }
};

/**
 * Get cached value by key, throwing error if unavailable (Critical / Fail-Closed)
 * @param {string} key - Cache key
 * @returns {Promise<string|null>} - Cached value or throws error
 */
export const getCritical = async (key) => {
  if (!isRedisConnected()) {
    throw new Error('Redis is not connected (Fail-Closed)');
  }

  try {
    const client = getRedisClient();
    if (!client) {
      throw new Error('Redis client is not available (Fail-Closed)');
    }

    const scopedKey = getScopedKey(key);
    const value = await client.get(scopedKey);
    return value;
  } catch (error) {
    logger.error('Cache getCritical error:', { key, error: error.message });
    throw error;
  }
};

/**
 * Set cached value with optional TTL
 * @param {string} key - Cache key
 * @param {string} value - Value to cache
 * @param {number} ttl - Time to live in seconds (optional)
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export const set = async (key, value, ttl = null) => {
  if (!isRedisConnected()) {
    return false;
  }

  try {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    const scopedKey = getScopedKey(key);
    if (ttl) {
      await client.setEx(scopedKey, ttl, value);
    } else {
      await client.set(scopedKey, value);
    }
    return true;
  } catch (error) {
    logger.error('Cache set error:', { key, error: error.message });
    return false;
  }
};

/**
 * Delete cached value by key
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export const del = async (key) => {
  if (!isRedisConnected()) {
    return false;
  }

  try {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    const scopedKey = getScopedKey(key);
    await client.del(scopedKey);
    return true;
  } catch (error) {
    logger.error('Cache delete error:', { key, error: error.message });
    return false;
  }
};

/**
 * Clear cache by pattern (e.g., "user:*" to clear all user cache)
 * @param {string} pattern - Redis key pattern
 * @returns {Promise<number>} - Number of keys deleted
 */
export const clear = async (pattern) => {
  if (!isRedisConnected()) {
    return 0;
  }

  try {
    const client = getRedisClient();
    if (!client) {
      return 0;
    }

    const keys = await client.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }

    const deleted = await client.del(keys);
    return deleted;
  } catch (error) {
    logger.error('Cache clear error:', { pattern, error: error.message });
    return 0;
  }
};

/**
 * Get multiple cached values by keys
 * @param {string[]} keys - Array of cache keys
 * @returns {Promise<Object>} - Object with key-value pairs
 */
export const getMultiple = async (keys) => {
  if (!isRedisConnected() || keys.length === 0) {
    return {};
  }

  try {
    const client = getRedisClient();
    if (!client) {
      return {};
    }

    const scopedKeys = keys.map(k => getScopedKey(k));
    const values = await client.mGet(scopedKeys);
    const result = {};
    keys.forEach((key, index) => {
      if (values[index] !== null) {
        result[key] = values[index];
      }
    });
    return result;
  } catch (error) {
    logger.error('Cache getMultiple error:', { keys, error: error.message });
    return {};
  }
};

/**
 * Set multiple cached values
 * @param {Object} keyValuePairs - Object with key-value pairs
 * @param {number} ttl - Time to live in seconds (optional, applies to all)
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export const setMultiple = async (keyValuePairs, ttl = null) => {
  if (!isRedisConnected()) {
    return false;
  }

  try {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    const pipeline = client.multi();
    Object.entries(keyValuePairs).forEach(([key, value]) => {
      const scopedKey = getScopedKey(key);
      if (ttl) {
        pipeline.setEx(scopedKey, ttl, value);
      } else {
        pipeline.set(scopedKey, value);
      }
    });
    await pipeline.exec();
    return true;
  } catch (error) {
    logger.error('Cache setMultiple error:', { error: error.message });
    return false;
  }
};

/**
 * Check if cache is available
 * @returns {boolean} - True if Redis is connected and available
 */
export const isAvailable = () => {
  return isRedisConnected();
};

/**
 * Acquire a distributed lock (Fix 8.2)
 * @param {string} key - Lock key
 * @param {number} ttl - Lock timeout in seconds
 * @returns {Promise<boolean>} - True if lock acquired
 */
export const acquireLock = async (key, ttl = 60) => {
  if (!isRedisConnected()) return true; // Fail-open (allow execution if no redis) or Fail-safe? Default to allow but warn? Or strictly false?
  // Distributed lock usually implies strictness. if Redis down, maybe dont run job twice?
  // For now, if Redis down, return true allowing execution (single instance assumption fallback)

  try {
    const client = getRedisClient();
    if (!client) return true;

    // Use raw key for locks (system wide) or scoped? 
    // Scheduler locks are usually system wide.
    // If we use getScopedKey, it will be 'system:scheduler:lock' which is fine.
    const scopedKey = getScopedKey(key);

    // set(key, value, { NX: true, EX: ttl })
    const result = await client.set(scopedKey, 'LOCKED', {
      NX: true,
      EX: ttl
    });

    return result === 'OK';
  } catch (error) {
    logger.error('Cache acquireLock error:', error);
    return false; // Error acquiring lock
  }
};

/**
 * Release a distributed lock
 */
export const releaseLock = async (key) => {
  if (!isRedisConnected()) return;
  try {
    const client = getRedisClient();
    await client.del(getScopedKey(key));
  } catch (err) {
    logger.error('Cache releaseLock error', err);
  }
};

export default {
  get,
  set,
  del,
  clear,
  getMultiple,
  setMultiple,
  isAvailable,
  acquireLock,
  releaseLock
};

