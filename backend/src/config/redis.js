import { createClient } from 'redis';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

let redisClient = null;
let isRedisAvailable = false;
let hasExceededRetryLimit = false;
let hasLoggedFirstError = false;

/**
 * Initialize Redis client connection
 * Returns true if connection successful, false otherwise
 */
export const initializeRedis = async () => {
  // Reset retry limit flag for new initialization attempt
  hasExceededRetryLimit = false;
  hasLoggedFirstError = false;
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries >= 10) {
            hasExceededRetryLimit = true;
            logger.warn('Redis reconnection attempts exceeded. Redis will be unavailable.');
            return false; // Return false to stop reconnecting (Redis v4+ behavior)
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    // Error event handlers
    redisClient.on('error', (err) => {
      // Only log the first error to avoid spam during reconnection attempts
      // Suppress all errors after retry limit is exceeded
      if (!hasExceededRetryLimit && !hasLoggedFirstError) {
        logger.error('Redis Client Error:', err);
        hasLoggedFirstError = true;
      }
      isRedisAvailable = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
      isRedisAvailable = true;
    });

    redisClient.on('reconnecting', () => {
      // Suppress all reconnecting messages after first error is logged to reduce noise
      // The first error already indicates Redis is unavailable, and we'll log when retries are exceeded
      if (!hasLoggedFirstError) {
        logger.warn('Redis client reconnecting...');
      }
      isRedisAvailable = false;
    });

    redisClient.on('end', () => {
      logger.warn('Redis client connection ended');
      isRedisAvailable = false;
    });

    // Connect to Redis
    try {
      await redisClient.connect();
    } catch (connectError) {
      throw connectError; // Re-throw to be caught by outer catch
    }
    isRedisAvailable = true;
    logger.info('✅ Redis connection established successfully');
    return true;
  } catch (error) {
    // Provide helpful error message based on error type
    const errorCode = error?.code || error?.errors?.[0]?.code;
    let errorMessage = 'Redis server is not available';
    if (errorCode === 'ECONNREFUSED') {
      errorMessage = 'Redis server is not running. Please start Redis or remove REDIS_URL from environment variables to disable caching.';
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    logger.warn('⚠️ Redis not available. Application will continue without caching.', {
      error: errorMessage,
      hint: 'To disable Redis, remove REDIS_URL from your environment variables.',
    });
    // Properly disconnect the client if it was created
    if (redisClient) {
      try {
        // Remove all event listeners to prevent reconnection attempts
        redisClient.removeAllListeners();
        // Disconnect the client
        if (redisClient.isOpen || redisClient.isReady) {
          await redisClient.quit().catch(() => {});
        } else {
          // If not connected, just disconnect without quit
          await redisClient.disconnect().catch(() => {});
        }
      } catch (quitError) {
        // Ignore quit/disconnect errors
      }
    }
    isRedisAvailable = false;
    redisClient = null;
    return false;
  }
};

/**
 * Get Redis client instance
 * Returns null if Redis is not available
 */
export const getRedisClient = () => {
  return isRedisAvailable ? redisClient : null;
};

/**
 * Check if Redis is available
 */
export const isRedisConnected = () => {
  return isRedisAvailable && redisClient?.isReady;
};

/**
 * Close Redis connection gracefully
 */
export const closeRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed');
      isRedisAvailable = false;
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }
};

export default {
  initializeRedis,
  getRedisClient,
  isRedisConnected,
  closeRedis,
};

