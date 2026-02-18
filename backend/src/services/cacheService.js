import { getRedisClient, isRedisConnected } from '../config/redis.js';
import logger from '../config/logger.js';

/**
 * Cache Service
 * Provides caching functionality with Redis as backend
 * Gracefully degrades to no-op if Redis is unavailable
 */

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

    const value = await client.get(key);
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

    const value = await client.get(key);
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

    if (ttl) {
      await client.setEx(key, ttl, value);
    } else {
      await client.set(key, value);
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

    await client.del(key);
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

    const values = await client.mGet(keys);
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
      if (ttl) {
        pipeline.setEx(key, ttl, value);
      } else {
        pipeline.set(key, value);
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

export default {
  get,
  set,
  del,
  clear,
  getMultiple,
  setMultiple,
  isAvailable,
};

