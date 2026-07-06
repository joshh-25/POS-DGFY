import './env.js';
import { createClient } from 'redis';

let redisClient = null;
let isRedisAvailable = false;

export const initializeRedis = async () => {
    if (!process.env.REDIS_URL) {
        console.warn('[dgfy-api] REDIS_URL not configured; token blacklist checks will fail-open.');
        return false;
    }

    try {
        redisClient = createClient({
            url: process.env.REDIS_URL,
            socket: {
                reconnectStrategy: (retries) => (retries >= 10 ? false : Math.min(retries * 100, 3000))
            }
        });

        redisClient.on('error', () => { isRedisAvailable = false; });
        redisClient.on('ready', () => { isRedisAvailable = true; });
        redisClient.on('end', () => { isRedisAvailable = false; });

        await redisClient.connect();
        isRedisAvailable = true;
        return true;
    } catch (error) {
        console.warn('[dgfy-api] Redis unavailable, continuing without token blacklist enforcement:', error.message);
        isRedisAvailable = false;
        redisClient = null;
        return false;
    }
};

export const getRedisClient = () => (isRedisAvailable ? redisClient : null);

export const closeRedis = async () => {
    if (redisClient) {
        await redisClient.quit().catch(() => {});
        isRedisAvailable = false;
    }
};
